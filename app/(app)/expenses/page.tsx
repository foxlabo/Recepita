'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import BulkRegisterPage from '@/components/BulkRegisterPage';
import DraftsCard, { type DraftRow } from '@/components/DraftsCard';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiErrorMessage, redirectIfUnauthorized } from '@/lib/api-client';
import { normalizeDateString, todayJST } from '@/lib/dates';
import type { DraftPayload } from '@/lib/draft-import';
import { formatItemsText, itemsFromJson, parseAmountInput, parseItemsText } from '@/lib/items';
import { callOcr } from '@/lib/ocr/client';
import { toNum, unwrapOcrResponse } from '@/lib/ocr/extract';

type OcrDetected = {
  date?: string; // 取引日
  amount?: number;
  vendor?: string;
  items?: Array<{ name?: string; qty?: number; price?: number; total?: number }>;
  subtotal?: number;
  tax?: number;
  total?: number;
  paymentMethod?: string;
};

type OcrResponse = {
  ocrText?: string;
  detected?: OcrDetected;
  ai?: { category?: string; confidence?: number; memo?: string };
  itemsSummary?: string;
};

const emptyForm = () => ({ tradeDate: todayJST(), amount: '', vendor: '', category: '', memo: '' });

function SingleRegisterTab({ onAppend }: { onAppend: (row: DraftPayload) => Promise<boolean> }) {
  // 状態表示
  const [busy, setBusy] = useState<'idle' | 'parsing' | 'posting'>('idle');
  const statusText = { idle: '', parsing: '解析中…', posting: '登録中…' }[busy];

  // フォーム（取引日）
  const [form, setForm] = useState(emptyForm);
  const [itemsText, setItemsText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 解析（OCR→フォームに反映）
  async function handleFile(file: File) {
    setBusy('parsing');
    try {
      // 個別登録は再試行なし（ひとまず個別はレシート固定）
      const p = unwrapOcrResponse(await callOcr(file, 'prebuilt-receipt')) as OcrResponse;
      const d = p?.detected || {};

      // 取引日（読めなければ今日）
      const tradeDate = normalizeDateString(d.date) || todayJST();

      // 金額（total > subtotal+tax > amount）
      const subtotal = toNum(d.subtotal);
      const tax = toNum(d.tax);
      const amount =
        toNum(d.total) ?? (subtotal != null && tax != null ? subtotal + tax : undefined) ?? toNum(d.amount) ?? 0;

      // 品目テキスト
      const items = formatItemsText(itemsFromJson(d.items));

      setForm((prev) => ({
        ...prev,
        tradeDate,
        amount: String(amount ?? ''),
        vendor: (d.vendor ?? '').toString(),
        category: p?.ai?.category ?? '',
        memo: p?.ai?.memo ?? '',
      }));
      setItemsText(items || (p?.itemsSummary ?? ''));
    } catch (e) {
      alert(e instanceof Error && e.message ? e.message : '解析に失敗しました');
    } finally {
      setBusy('idle');
    }
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!form.tradeDate || !form.amount.trim() || !form.vendor.trim()) {
      return alert('取引日/金額/取引先は必須です');
    }
    const amount = parseAmountInput(form.amount);
    if (amount === undefined) return alert('金額は数値で入力してください。');

    setBusy('posting');
    try {
      const ok = await onAppend({
        tradeDate: form.tradeDate,
        amount, // 小数はサーバー側で円単位に丸める
        vendor: form.vendor,
        category: form.category,
        memo: form.memo,
        itemsSummary: formatItemsText(parseItemsText(itemsText)),
      });
      if (!ok) return; // 失敗時は入力内容を残す
      setForm(emptyForm());
      setItemsText('');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } finally {
      setBusy('idle');
    }
  }

  return (
    <Card>
      <CardHeader className="p-4 border-b border-(--border)">新規登録</CardHeader>
      <CardContent>
        <form onSubmit={submit} id="form-new" className="grid gap-3 md:grid-cols-4 w-full">
          {/* 1行目：4列 */}
          <div className="space-y-1">
            <label className="text-sm text-(--muted)" htmlFor="new-trade-date">
              取引日
            </label>
            <Input
              id="new-trade-date"
              type="date"
              value={form.tradeDate}
              onChange={(e) => setForm({ ...form, tradeDate: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-(--muted)" htmlFor="new-amount">
              金額
            </label>
            <Input
              id="new-amount"
              inputMode="numeric"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-(--muted)" htmlFor="new-vendor">
              取引先
            </label>
            <Input id="new-vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
          </div>
          <div className="space-y-1">
            <label className="text-sm text-(--muted)" htmlFor="new-category">
              区分
            </label>
            <Input
              id="new-category"
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>

          {/* 2行目：品目（フル幅） */}
          <div className="space-y-1 md:col-span-full">
            <label className="text-sm text-(--muted)" htmlFor="new-items">
              品目
            </label>
            <textarea
              id="new-items"
              rows={2}
              className="w-full rounded-sm border px-3 py-2 bg-white dark:bg-(--card)"
              placeholder="例）コピー用紙:550, 値引き:-50"
              value={itemsText}
              onChange={(e) => setItemsText(e.target.value)}
            />
          </div>

          {/* 3行目：メモ（フル幅） */}
          <div className="space-y-1 md:col-span-full">
            <label className="text-sm text-(--muted)" htmlFor="new-memo">
              メモ
            </label>
            <Input id="new-memo" value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} />
          </div>

          {/* ボタン列 */}
          <div className="md:col-span-full flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="block"
            />
            <Button
              type="button"
              disabled={!selectedFile || busy !== 'idle'}
              onClick={() => selectedFile && handleFile(selectedFile)}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              解析
            </Button>
            <span className="text-(--muted) ml-2">状態: {statusText}</span>
            <div className="ml-auto">
              <Button type="submit" disabled={busy !== 'idle'}>
                追加
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function Expenses() {
  // ▼ 下書き（DB保存）
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [draftsBusy, setDraftsBusy] = useState(false);

  const reloadDrafts = useCallback(async () => {
    try {
      const r = await fetch('/api/expense-drafts', { cache: 'no-store' });
      if (redirectIfUnauthorized(r)) return;
      if (!r.ok) {
        alert(await apiErrorMessage(r, '下書きの取得に失敗しました。'));
        return;
      }
      const j = await r.json();
      setDrafts(Array.isArray(j.items) ? j.items : []);
    } catch {
      alert('通信に失敗しました。時間をおいて再度お試しください。');
    }
  }, []);
  useEffect(() => {
    reloadDrafts();
  }, [reloadDrafts]);

  /** POST して結果を通知。成功なら一覧を 1 回だけ再読込して true。 */
  async function postDrafts(url: string, body: unknown, fallback: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (redirectIfUnauthorized(res)) return false;
      if (!res.ok) {
        alert(await apiErrorMessage(res, fallback));
        return false;
      }
      await reloadDrafts();
      return true;
    } catch {
      alert('通信に失敗しました。時間をおいて再度お試しください。');
      return false;
    }
  }

  const addDraft = (row: DraftPayload) => postDrafts('/api/expense-drafts', row, '下書き保存に失敗しました。');
  // 一括登録・CSV は 1 リクエストでまとめて保存（全件成功 or 全件失敗）
  const addDrafts = (rows: DraftPayload[]) =>
    postDrafts('/api/expense-drafts/bulk', { drafts: rows }, '下書き保存に失敗しました。');

  async function deleteDraft(id: string) {
    setDraftsBusy(true);
    try {
      const res = await fetch('/api/expense-drafts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] }),
      });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok && res.status !== 404) alert(await apiErrorMessage(res, '削除に失敗しました。'));
      await reloadDrafts();
    } finally {
      setDraftsBusy(false);
    }
  }

  async function clearDrafts() {
    if (!drafts.length) return;
    if (!confirm(`下書き${drafts.length}件をすべて削除します。よろしいですか？`)) return;
    setDraftsBusy(true);
    try {
      const res = await fetch('/api/expense-drafts?all=true', { method: 'DELETE' });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) alert(await apiErrorMessage(res, '削除に失敗しました。'));
      await reloadDrafts();
    } finally {
      setDraftsBusy(false);
    }
  }

  async function finalizeDrafts() {
    if (!drafts.length) return alert('下書きがありません');
    if (!confirm(`${drafts.length}件を登録します。よろしいですか？`)) return;
    setDraftsBusy(true);
    try {
      // 表示中の下書きだけを確定する（別タブで追加された分は含めない）
      const res = await fetch('/api/expense-drafts/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: drafts.map((d) => d.id) }),
      });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) {
        alert('登録に失敗しました\n' + (await apiErrorMessage(res, '')));
      } else {
        const j = await res.json().catch(() => ({}));
        alert(`${j?.created ?? drafts.length}件を登録しました`);
      }
      await reloadDrafts();
    } finally {
      setDraftsBusy(false);
    }
  }

  // ▼ タブ
  const [active, setActive] = useState<'single' | 'bulk'>('single');
  const tabClass = (on: boolean) =>
    `px-4 py-2 rounded-t border-b-2 ${on ? 'border-(--fg) font-semibold' : 'border-transparent text-(--muted)'}`;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">経費</h2>
      <div className="flex items-center gap-2 border-b pb-2 mt-2">
        <button className={tabClass(active === 'single')} onClick={() => setActive('single')}>
          個別登録
        </button>
        <button className={tabClass(active === 'bulk')} onClick={() => setActive('bulk')}>
          一括登録
        </button>
      </div>
      <div className="pt-2 space-y-4">
        {active === 'single' ? (
          <SingleRegisterTab onAppend={addDraft} />
        ) : (
          <BulkRegisterPage onAppendDrafts={addDrafts} />
        )}

        {/* 下書き（DB） */}
        <DraftsCard
          drafts={drafts}
          busy={draftsBusy}
          onDelete={deleteDraft}
          onClear={clearDrafts}
          onFinalize={finalizeDrafts}
        />
      </div>
    </div>
  );
}
