'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiErrorMessage, redirectIfUnauthorized } from '@/lib/api-client';
import { csvRow } from '@/lib/csv';
import { addMonths, formatDateJST, yearMonthJST } from '@/lib/dates';
import { parseAmountInput } from '@/lib/items';

type Row = {
  id: string;
  createdAt: string; // 登録日時（ISO）
  date: string;      // 取引日（JST の YYYY-MM-DD）
  amount: number;
  vendor: string;
  category?: string|null;
  memo?: string;
  itemsText?: string; // "商品名:金額, ..." 形式（ExpenseItem から生成）
};

/** 編集中の値（入力欄の文字列のまま保持し、送信時に検証する） */
type Edit = {
  date?: string;
  amount?: string;
  vendor?: string;
  category?: string;
  memo?: string;
  itemsText?: string;
};

type ListRes = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};

const PAGE_SIZE = 50;

// ===== ページング補助 =====
const MAX_VISIBLE = 7; // 同時表示するページ番号の最大個数（必要に応じて 5〜9 程度に変更可）
function pageRange(current: number, total: number, maxVisible = MAX_VISIBLE){
  let start = Math.max(1, current - Math.floor(maxVisible/2));
  let end   = Math.min(total, start + maxVisible - 1);
  // 端で個数が目減りしないよう再調整
  start = Math.max(1, Math.min(start, end - maxVisible + 1));
  return Array.from({length: end - start + 1}, (_,i)=> start + i);
}

const pagerButton =
  'px-2 py-1 rounded border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50 ' +
  'dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]';

export default function ReceiptsList() {
  const today = yearMonthJST();
  const [year, setYear] = useState<number>(today.year);
  const [month, setMonth] = useState<number>(today.month);
  const [page, setPage] = useState<number>(1);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);

  // チェック状態 & 編集状態
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Edit>>({});

  // === エクスポートUI状態 ===
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fromYear, setFromYear] = useState<number>(year);
  const [fromMonth, setFromMonth] = useState<number>(month);
  const [toYear, setToYear] = useState<number>(year);
  const [toMonth, setToMonth] = useState<number>(month);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        year: String(year),
        month: String(month),
        page: String(page),
        pageSize: String(PAGE_SIZE),
      });
      const r = await fetch('/api/expenses/list?' + params.toString(), { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
      if (redirectIfUnauthorized(r)) return;
      if (!r.ok) {
        // 失敗時は表示中のデータと編集内容を残す
        setLoadError(await apiErrorMessage(r, '一覧の取得に失敗しました。'));
        return;
      }
      const j: ListRes = await r.json();
      setLoadError(null);
      setRows(j.items);
      setTotal(j.total);
      setChecked({});
      setEdits({});
    } catch {
      setLoadError('通信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  }, [year, month, page]);

  useEffect(() => { load(); }, [load]);

  // total が変わって現在ページがはみ出したらクランプ
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function setEdit(id: string, patch: Edit) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    // 編集した行は更新対象として自動でチェック
    setChecked(prev => (prev[id] ? prev : { ...prev, [id]: true }));
  }

  // 全選択チェックボックス（制御コンポーネント。一部選択時は indeterminate）
  const checkedCount = rows.filter(r => checked[r.id]).length;
  const allChecked = rows.length > 0 && checkedCount === rows.length;
  const checkAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (checkAllRef.current) checkAllRef.current.indeterminate = checkedCount > 0 && !allChecked;
  }, [checkedCount, allChecked]);

  function onCheckAll(e: React.ChangeEvent<HTMLInputElement>) {
    const on = e.target.checked;
    const obj: Record<string, boolean> = {};
    rows.forEach(r => { obj[r.id] = on; });
    setChecked(obj);
  }

  /** 金額欄の入力が不正なら true */
  const amountInvalid = (id: string) => {
    const a = edits[id]?.amount;
    return a !== undefined && parseAmountInput(a) === undefined;
  };

  async function bulkUpdate() {
    const targets = rows.filter(r => checked[r.id]);
    if (!targets.length) return alert('更新対象が選択されていません');

    const updates = [];
    for (const r of targets) {
      const e = edits[r.id] ?? {};
      const { amount: amountText, ...rest } = e;
      let amount: number | undefined;
      if (amountText !== undefined) {
        amount = parseAmountInput(amountText);
        if (amount === undefined) {
          return alert(`金額は数値で入力してください（${r.vendor || formatDateJST(r.date)}）。`);
        }
      }
      updates.push({ id: r.id, ...rest, ...(amount !== undefined ? { amount } : {}) });
    }

    setSaving(true);
    try {
      const res = await fetch('/api/expenses/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates })
      });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) {
        alert('一括更新に失敗しました\n' + (await apiErrorMessage(res, '')));
        return;
      }
      await load();
      alert(targets.length + '件を更新しました');
    } finally {
      setSaving(false);
    }
  }

  // 一括削除
  async function bulkDelete() {
    const ids = rows.map(r => r.id).filter(id => checked[id]);
    if (!ids.length) return alert('削除対象が選択されていません');
    if (!confirm(`${ids.length}件を削除します。よろしいですか？`)) return;

    setSaving(true);
    try {
      const res = await fetch('/api/expenses/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) {
        alert('一括削除に失敗しました\n' + (await apiErrorMessage(res, '')));
        return;
      }
      await load();
      alert(ids.length + '件を削除しました');
    } finally {
      setSaving(false);
    }
  }

  // ===== エクスポート（期間選択 → CSV） =====
  function* monthRange(y1:number,m1:number,y2:number,m2:number){
    for (let ym = { year: y1, month: m1 }; ym.year * 12 + ym.month <= y2 * 12 + m2; ym = addMonths(ym.year, ym.month, 1)) {
      yield { y: ym.year, m: ym.month };
    }
  }
  function toCsv(list: Row[]): string {
    const header = ['登録日','取引日','金額','取引先','区分','品目','メモ'];
    const lines = [csvRow(header)];
    list.forEach(r => {
      // csvRow は = + - @ で始まるセルを無害化する（CSVインジェクション対策）
      lines.push(csvRow([
        formatDateJST(r.createdAt),
        formatDateJST(r.date),
        r.amount,
        r.vendor ?? '',
        r.category ?? '',
        (r.itemsText ?? '').replace(/\r?\n/g, ' ').trim(),
        r.memo ?? ''
      ]));
    });
    return lines.join('\r\n');
  }
  async function onExportCsv(){
    if (fromYear * 12 + fromMonth > toYear * 12 + toMonth) {
      return alert('開始月は終了月以前を指定してください。');
    }
    try{
      setExporting(true);
      const acc: Row[] = [];
      for (const {y,m} of monthRange(fromYear, fromMonth, toYear, toMonth)) {
        let p = 1; const ps = 200;
        // ページング全件取得
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const r = await fetch(`/api/expenses/list?year=${y}&month=${m}&page=${p}&pageSize=${ps}`, { cache: 'no-store' });
          if (redirectIfUnauthorized(r)) return;
          if (!r.ok) throw new Error(await apiErrorMessage(r, `${y}年${m}月のデータを取得できませんでした。`));
          const j: ListRes = await r.json();
          acc.push(...j.items);
          const tp = Math.max(1, Math.ceil((j.total || 0) / ps));
          if (p >= tp) break;
          p++;
        }
      }
      const csv = toCsv(acc);
      const bom = '﻿';
      const blob = new Blob([bom, csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `recepita_export_${fromYear}-${String(fromMonth).padStart(2,'0')}_to_${toYear}-${String(toMonth).padStart(2,'0')}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setExportOpen(false);
    } catch(e) {
      alert('エクスポートに失敗しました\n' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setExporting(false);
    }
  }

  // 年/月の選択肢
  const yearOptions = useMemo(() => {
    return Array.from({length: 8}).map((_,i)=> today.year - i); // 直近8年
  }, [today.year]);
  const monthOptions = [1,2,3,4,5,6,7,8,9,10,11,12];
  const pages = pageRange(page, totalPages);
  const selectClass = 'border rounded-sm px-2 py-1 bg-(--card)';

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">経費一覧</h2>

      {/* フィルター */}
      <Card>
        <CardHeader className="p-4 border-b border-(--border)">フィルター</CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-sm mr-2 text-(--muted)">年</span>
              <select className={selectClass} value={year} onChange={e => { setPage(1); setYear(Number(e.target.value)); }}>
                {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
            <div>
              <span className="text-sm mr-2 text-(--muted)">月</span>
              <select className={selectClass} value={month} onChange={e => { setPage(1); setMonth(Number(e.target.value)); }}>
                {monthOptions.map(m => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
            <div className="text-sm text-(--muted) ml-auto">
              件数: {total}（ページ {page}/{totalPages}）
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 一覧 + エクスポート */}
      <Card>
        <CardHeader className="p-4 border-b border-(--border)">
          <div className="flex items-center justify-between">
            <div>一覧（編集可）</div>
            <Button variant="outline" onClick={() => setExportOpen(v => !v)}>エクスポート</Button>
          </div>

          {exportOpen && (
            <div className="mt-3 rounded-sm border p-3 bg-gray-50 dark:bg-[#0b1110]">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-(--muted)">開始</span>
                  <select className={selectClass} value={fromYear} onChange={e=>setFromYear(Number(e.target.value))}>
                    {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
                  </select>
                  <span>年</span>
                  <select className={selectClass} value={fromMonth} onChange={e=>setFromMonth(Number(e.target.value))}>
                    {monthOptions.map(m => (<option key={m} value={m}>{m}</option>))}
                  </select>
                  <span>月</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-(--muted)">終了</span>
                  <select className={selectClass} value={toYear} onChange={e=>setToYear(Number(e.target.value))}>
                    {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
                  </select>
                  <span>年</span>
                  <select className={selectClass} value={toMonth} onChange={e=>setToMonth(Number(e.target.value))}>
                    {monthOptions.map(m => (<option key={m} value={m}>{m}</option>))}
                  </select>
                  <span>月</span>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button onClick={onExportCsv} disabled={exporting}>{exporting ? '出力中…' : 'CSV出力'}</Button>
                </div>
              </div>
              <div className="text-xs text-(--muted) mt-2">
                ※ 指定期間（開始〜終了）の全件をCSVに出力します。編集内容は「一括更新」反映後にエクスポートしてください。
              </div>
            </div>
          )}
        </CardHeader>

        <CardContent>
          {loadError && (
            <div role="alert" className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {loadError}
            </div>
          )}
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm min-w-[980px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#101a16]">
                  <th className="p-2 border-b border-(--border) w-8 align-middle text-center">
                    <input
                      ref={checkAllRef}
                      type="checkbox"
                      aria-label="すべて選択"
                      checked={allChecked}
                      disabled={rows.length === 0}
                      onChange={onCheckAll}
                    />
                  </th>
                  <th className="text-left p-2 border-b border-(--border)">登録日</th>
                  <th className="text-left p-2 border-b border-(--border)">取引日</th>
                  <th className="text-left p-2 border-b border-(--border)">金額</th>
                  <th className="text-left p-2 border-b border-(--border)">取引先</th>
                  <th className="text-left p-2 border-b border-(--border)">区分</th>
                  <th className="text-left p-2 border-b border-(--border)">品目</th>
                  <th className="text-left p-2 border-b border-(--border)">メモ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const e = edits[r.id] || {};
                  const badAmount = amountInvalid(r.id);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 dark:hover:bg-[#101a16]">
                      <td className="p-2 align-middle text-center">
                        <div className="h-10 flex items-center justify-center">
                          <input
                            type="checkbox"
                            aria-label="選択"
                            checked={!!checked[r.id]}
                            onChange={ev => setChecked(prev => ({ ...prev, [r.id]: ev.target.checked }))}
                          />
                        </div>
                      </td>
                      <td className="p-2 align-top">
                        <Input readOnly className="min-w-[150px] text-center" value={formatDateJST(r.createdAt)} />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          type="date"
                          className="min-w-[150px]"
                          value={formatDateJST(e.date ?? r.date)}
                          onChange={ev => setEdit(r.id, { date: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          inputMode="numeric"
                          className={`min-w-[120px] ${badAmount ? 'border-red-500' : ''}`}
                          aria-invalid={badAmount || undefined}
                          title={badAmount ? '金額は数値で入力してください' : undefined}
                          value={e.amount ?? String(r.amount)}
                          onChange={ev => setEdit(r.id, { amount: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={e.vendor ?? r.vendor}
                          onChange={ev => setEdit(r.id, { vendor: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={e.category ?? (r.category ?? '')}
                          onChange={ev => setEdit(r.id, { category: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          title={e.itemsText ?? (r.itemsText ?? '')}
                          value={e.itemsText ?? (r.itemsText ?? '')}
                          onChange={ev => setEdit(r.id, { itemsText: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={e.memo ?? (r.memo ?? '')}
                          onChange={ev => setEdit(r.id, { memo: ev.target.value })}
                        />
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={8} className="p-3 text-(--muted)">{loading ? '読込中…' : 'データなし'}</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* ページング */}
          <div className="flex items-center justify-between mt-3">
            <div className="text-sm text-(--muted)">{loading ? '読込中…' : ''}</div>
            <nav className="flex items-center gap-2" aria-label="ページ">
              {/* 先頭 / 前へ */}
              <button onClick={() => setPage(1)} disabled={page === 1} className={pagerButton}>
                « 最初
              </button>
              <button onClick={() => setPage(page - 1)} disabled={page === 1} className={pagerButton}>
                ‹ 前
              </button>

              {/* 省略（…） */}
              {pages[0] > 1 && <span className="px-1 text-(--muted)">…</span>}

              {/* 中央のページ群（現在のページを強調） */}
              {pages.map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                  className={
                    p === page
                      ? 'px-3 py-1 rounded-sm border border-recepita bg-recepita text-white font-semibold'
                      : 'px-3 py-1 rounded-sm border bg-white text-gray-900 hover:bg-gray-50 dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]'
                  }
                >
                  {p}
                </button>
              ))}

              {pages[pages.length - 1] < totalPages && <span className="px-1 text-(--muted)">…</span>}

              {/* 次へ / 末尾 */}
              <button onClick={() => setPage(page + 1)} disabled={page === totalPages} className={pagerButton}>
                次 ›
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className={pagerButton}>
                最後 »
              </button>
            </nav>
          </div>

          {/* 一括削除 + 一括更新 */}
          <div className="flex justify-end mt-4 gap-3">
            <Button onClick={bulkDelete} disabled={saving} variant="primary" className="bg-red-600 hover:bg-red-700">
              一括削除
            </Button>
            <Button onClick={bulkUpdate} disabled={saving}>
              一括更新
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
