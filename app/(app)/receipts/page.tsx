'use client';
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { csvRow } from '@/lib/csv';
import { addMonths, formatDateJST, yearMonthJST } from '@/lib/dates';

type Row = {
  id: string;
  createdAt: string; // 登録日時（ISO）
  date: string;      // 取引日（JST の YYYY-MM-DD）
  amount: number;
  vendor: string;
  category?: string|null;
  memo?: string;
  itemsText?: string; // "商品名:金額, ..." 形式
};

type ListRes = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};


// ===== ページング補助 =====
const MAX_VISIBLE = 7; // 同時表示するページ番号の最大個数（必要に応じて 5〜9 程度に変更可）
function pageRange(current: number, total: number, maxVisible = MAX_VISIBLE){
  let start = Math.max(1, current - Math.floor(maxVisible/2));
  let end   = Math.min(total, start + maxVisible - 1);
  // 端で個数が目減りしないよう再調整
  start = Math.max(1, Math.min(start, end - maxVisible + 1));
  return Array.from({length: end - start + 1}, (_,i)=> start + i);
}

export default function ReceiptsList() {
  const today = yearMonthJST();
  const [year, setYear] = useState<number>(today.year);
  const [month, setMonth] = useState<number>(today.month);
  const [page, setPage] = useState<number>(1);
  const pageSize = 50;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);

  // チェック状態 & 編集状態
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [edits, setEdits] = useState<Record<string, Partial<Row>>>({});

  // === エクスポートUI状態 ===
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fromYear, setFromYear] = useState<number>(year);
  const [fromMonth, setFromMonth] = useState<number>(month);
  const [toYear, setToYear] = useState<number>(year);
  const [toMonth, setToMonth] = useState<number>(month);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', String(year));
      if (month) params.set('month', String(month));
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      const r = await fetch('/api/expenses/list?' + params.toString(), { headers: { 'Accept': 'application/json' } });
      if (r.status === 401) {
        setRows([]); setTotal(0);
        return; // 未ログイン（セッション切れ）時は空表示
      }
      const j: ListRes = await r.json();
      setRows(j.items);
      setTotal(j.total);
      setChecked({});
      setEdits({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [year, month, page]);

  // total が変わって現在ページがはみ出したらクランプ
  useEffect(() => {
    const tp = Math.max(1, Math.ceil(total / pageSize));
    if (page > tp) setPage(tp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, pageSize]);

  function setEdit(id: string, patch: Partial<Row>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function onCheckAll(e: React.ChangeEvent<HTMLInputElement>) {
    const on = e.target.checked;
    const obj: Record<string, boolean> = {};
    rows.forEach(r => obj[r.id] = on);
    setChecked(obj);
  }

  async function bulkUpdate() {
    const ids = rows.map(r => r.id).filter(id => checked[id]);
    if (!ids.length) return alert('更新対象が選択されていません');
    const updates = ids.map(id => ({ id, ...(edits[id] || {}) }));
    const r = await fetch('/api/expenses/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates })
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      alert('一括更新に失敗しました\n' + t);
      return;
    }
    await load();
    alert(ids.length + '件を更新しました');
  }

  // 一括削除
  async function bulkDelete() {
    const ids = rows.map(r => r.id).filter(id => checked[id]);
    if (!ids.length) return alert('削除対象が選択されていません');
    if (!confirm(`${ids.length}件を削除します。よろしいですか？`)) return;

    const r = await fetch('/api/expenses/bulk-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids })
    });
    if (!r.ok) {
      const t = await r.text().catch(()=> '');
      alert('一括削除に失敗しました\n' + t);
      return;
    }
    await load();
    alert(ids.length + '件を削除しました');
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
    try{
      setExporting(true);
      const acc: Row[] = [];
      for (const {y,m} of monthRange(fromYear, fromMonth, toYear, toMonth)) {
        let p = 1; const ps = 200;
        // ページング全件取得
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const r = await fetch(`/api/expenses/list?year=${y}&month=${m}&page=${p}&pageSize=${ps}`);
          if (!r.ok) throw new Error(`fetch failed: ${y}-${m} page ${p}`);
          const j: ListRes = await r.json();
          acc.push(...j.items);
          const tp = Math.max(1, Math.ceil((j.total || 0) / ps));
          if (p >= tp) break;
          p++;
        }
      }
      const csv = toCsv(acc);
      const bom = '\ufeff';
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
    } catch(e:any) {
      alert('エクスポートに失敗しました\n' + (e?.message ?? e));
    } finally {
      setExporting(false);
    }
  }

  // 年/月の選択肢
  const yearOptions = useMemo(() => {
    const y = today.year;
    return Array.from({length: 8}).map((_,i)=> y - i); // 直近8年
  }, []);
  const monthOptions = [1,2,3,4,5,6,7,8,9,10,11,12];

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
              <select className="border rounded-sm px-2 py-1" value={year} onChange={e => { setPage(1); setYear(Number(e.target.value)); }}>
                {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
            <div>
              <span className="text-sm mr-2 text-(--muted)">月</span>
              <select className="border rounded-sm px-2 py-1" value={month} onChange={e => { setPage(1); setMonth(Number(e.target.value)); }}>
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
                  <select className="border rounded-sm px-2 py-1" value={fromYear} onChange={e=>setFromYear(Number(e.target.value))}>
                    {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
                  </select>
                  <span>年</span>
                  <select className="border rounded-sm px-2 py-1" value={fromMonth} onChange={e=>setFromMonth(Number(e.target.value))}>
                    {monthOptions.map(m => (<option key={m} value={m}>{m}</option>))}
                  </select>
                  <span>月</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-(--muted)">終了</span>
                  <select className="border rounded-sm px-2 py-1" value={toYear} onChange={e=>setToYear(Number(e.target.value))}>
                    {yearOptions.map(y => (<option key={y} value={y}>{y}</option>))}
                  </select>
                  <span>年</span>
                  <select className="border rounded-sm px-2 py-1" value={toMonth} onChange={e=>setToMonth(Number(e.target.value))}>
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
          <div className="overflow-auto">
            <table className="w-full border-collapse text-sm min-w-[980px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#101a16]">
                  <th className="p-2 border-b border-(--border) w-8 align-middle text-center">
                    <input type="checkbox" onChange={onCheckAll} />
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
                  return (
                    <tr key={r.id} className="hover:bg-gray-50/70 dark:hover:bg-[#101a16]">
                      <td className="p-2 align-middle text-center">
                        <div className="h-10 flex items-center justify-center">
                          <input
                            type="checkbox"
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
                          className="min-w-[120px]"
                          value={String(e.amount ?? r.amount)}
                          onChange={ev => setEdit(r.id, { amount: Number(ev.target.value || 0) })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={String(e.vendor ?? r.vendor)}
                          onChange={ev => setEdit(r.id, { vendor: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={String(e.category ?? (r.category ?? ''))}
                          onChange={ev => setEdit(r.id, { category: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          title={String(e.itemsText ?? (r.itemsText ?? ''))}
                          value={String(e.itemsText ?? (r.itemsText ?? ''))}
                          onChange={ev => setEdit(r.id, { itemsText: ev.target.value })}
                        />
                      </td>
                      <td className="p-2 align-top">
                        <Input
                          value={String(e.memo ?? (r.memo ?? ''))}
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
  <div className="flex items-center gap-2">
    {/* 先頭 / 前へ */}
    <button
      onClick={() => page > 1 && setPage(1)}
      disabled={page === 1}
      className="px-2 py-1 rounded border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50
                 dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]"
    >
      « 最初
    </button>
    <button
      onClick={() => page > 1 && setPage(page - 1)}
      disabled={page === 1}
      className="px-2 py-1 rounded border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50
                 dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]"
    >
      ‹ 前
    </button>

    {/* 省略（…） */}
    {pageRange(page, totalPages).at(0)! > 1 && <span className="px-1 text-gray-500">…</span>}

    {/* 中央のページ群 */}
    {pageRange(page, totalPages).map(p => (
      <button
  key={p}
  onClick={() => setPage(p)}
  className="px-3 py-1 rounded-sm border bg-white border-gray-300"
  style={{ color: '#111' }}  // ← これで見えるなら外部CSSが原因
>
  {p}
</button>
    ))}

    {pageRange(page, totalPages).at(-1)! < totalPages && <span className="px-1 text-gray-500">…</span>}

    {/* 次へ / 末尾 */}
    <button
      onClick={() => page < totalPages && setPage(page + 1)}
      disabled={page === totalPages}
      className="px-2 py-1 rounded border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50
                 dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]"
    >
      次 ›
    </button>
    <button
      onClick={() => page < totalPages && setPage(totalPages)}
      disabled={page === totalPages}
      className="px-2 py-1 rounded border bg-white text-gray-900 hover:bg-gray-50 disabled:opacity-50
                 dark:bg-[#0e1513] dark:text-gray-100 dark:hover:bg-[#16211e]"
    >
      最後 »
    </button>
  </div>
</div>


          {/* 一括削除 + 一括更新 */}
          <div className="flex justify-end mt-4 gap-3">
          <Button
  onClick={bulkDelete}
  variant="primary"
  className="bg-red-600 hover:bg-red-700"
>
  一括削除
</Button>
  <Button onClick={bulkUpdate}>
    一括更新
  </Button>
</div>
        </CardContent>
      </Card>
    </div>
  );
}
