'use client';
import BulkRegisterPage from '@/components/BulkRegisterPage';
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { formatDateJST, normalizeDateString, todayJST } from '@/lib/dates';
import { formatItemsText, itemsFromJson, parseItemsText } from '@/lib/items';

// ===== OCR endpoint (個別用) =====
const OCR_ENDPOINT = '/api/ocr';
const FILE_FIELD   = 'file';

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

// ===== helpers =====
function toNum(v: any): number | undefined {
  if (v == null) return;
  const n = Number(String(v).replace(/[,￥¥円\s]/g,''));
  return Number.isFinite(n) ? n : undefined;
}
function normalize(raw: any): any {
  let c: any = raw?.message?.content ?? raw?.choices?.[0]?.message?.content ?? raw?.content ?? raw;
  for (let i=0;i<3;i++) {
    if (typeof c === 'string') {
      const t = c.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try { c = JSON.parse(t); continue; } catch {}
      }
      break;
    }
  }
  return c;
}
// preview row with both dates
type PreviewRow = {
  id?: string;
  registeredDate: string; // 登録日（当日 or createdAt）
  tradeDate: string;      // 取引日（フォームで入力）
  amount: number;
  vendor: string;
  category?: string;
  memo?: string;
  itemsSummary?: string;
};

function SingleRegisterTab({ onAppend, drafts, onDeleteDraft, onFinalize, onClearDrafts }: { onAppend: (row: PreviewRow) => void; drafts: PreviewRow[]; onDeleteDraft: (i:number)=>void; onFinalize: ()=>void; onClearDrafts: ()=>void; }) {
  const pathname = usePathname();

  // 状態表示
  const [busy, setBusy] = useState<'idle'|'parsing'|'posting'>('idle');
  const statusText = useMemo(() => ({ idle: '', parsing: '解析中…', posting: '登録中…' }[busy]), [busy]);

  // フォーム（取引日）
  const [form, setForm] = useState({
    tradeDate: todayJST(),
    amount: '',
    vendor: '',
    category: '',
    memo: '',
    paymentMethod: ''
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [itemsText, setItemsText] = useState('');

  // ===== OCR呼び出し（個別） =====
  async function callOcrSingle(file: File) {
    const fd = new FormData();
    fd.append(FILE_FIELD, file, file.name);
    fd.append('model', 'prebuilt-receipt'); // ひとまず個別は固定
    const res = await fetch(OCR_ENDPOINT, { method: 'POST', body: fd, headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error ?? `解析に失敗しました（HTTP ${res.status}）`);
    }
    return res.json();
  }

  // 解析（OCR→フォームに反映）
  async function handleFile(file: File) {
    setBusy('parsing');
    try {
      const raw = await callOcrSingle(file);
      const p = normalize(raw) as OcrResponse;
      const d = p?.detected || {};
      const regDate = todayJST();

      // 取引日
      const tradeDate = normalizeDateString(d.date) || regDate;

      // 金額（total > subtotal+tax > amount）
      const subtotal = toNum(d.subtotal);
      const tax = toNum(d.tax);
      const amount =
        toNum(d.total) ??
        (subtotal != null && tax != null ? (subtotal + tax) : undefined) ??
        toNum(d.amount) ?? 0;

      // 取引先
      const vendor = (d.vendor ?? '').toString();

      // 品目テキスト
      const items = formatItemsText(itemsFromJson(d.items));
      const itemsSummary = items || (p?.itemsSummary ?? '');

      // カテゴリ／メモ（AI推測があれば）
      const category = p?.ai?.category ?? '';
      const memo = p?.ai?.memo ?? '';

      // フォームに反映
      setForm(prev => ({
        ...prev,
        tradeDate: tradeDate,
        amount: String(amount ?? ''),
        vendor: vendor ?? prev.vendor,
        category: category ?? prev.category,
        memo: memo ?? prev.memo
      }));
      setItemsText(itemsSummary);

      // 軽いフィードバック
      // alert('解析しました。必要に応じて内容を調整して「追加」してください。');
      console.log('OCR parsed -> form updated');
    } catch (e: any) {
      console.error(e);
      alert(e?.message || '解析に失敗しました');
    } finally {
      setBusy('idle');
    }
  }


  const [preview, setPreview] = useState<PreviewRow[]>([]);
  useEffect(() => { setPreview([]); }, [pathname]); // 画面遷移でクリア

  async function submit(e: any) {
    e.preventDefault();
    if (!form.tradeDate || !form.amount || !form.vendor) {
      return alert('取引日/金額/取引先は必須です');
    }
    const reg = todayJST();
    const row: PreviewRow = {
      registeredDate: reg,
      tradeDate: formatDateJST(form.tradeDate),
      amount: Number(form.amount),
      vendor: form.vendor,
      category: form.category ?? '',
      memo: form.memo ?? '',
      itemsSummary: formatItemsText(parseItemsText(itemsText))
    };
    onAppend(row);
    setForm({
      tradeDate: todayJST(),
      amount: '',
      vendor: '',
      category: '',
      memo: '',
      paymentMethod: ''
    });
    setItemsText('');
    setSelectedFile(null);
  }

  return (
    <div className="space-y-4">

      <Card>
        <CardHeader className="p-4 border-b border-(--border)">新規登録</CardHeader>
        <CardContent>
          <form onSubmit={submit} id="form-new" className="grid gap-3 md:grid-cols-4 w-full">
            {/* 1行目：5列 */}
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">取引日</label>
              <Input type="date" value={form.tradeDate} onChange={e => setForm({ ...form, tradeDate: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">金額</label>
              <Input inputMode="numeric" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">取引先</label>
              <Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">区分</label>
              <Input value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} />
            </div>
            {/*<div className="space-y-1">
              <label className="text-sm text-(--muted)">支払方法</label>
              <Input value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })} />
            </div>*/}

            {/* 2行目：品目（フル幅） */}
            <div className="space-y-1 md:col-span-5">
              <label className="text-sm text-(--muted)">品目</label>
              <textarea
                rows={2}
                className="w-full rounded-sm border px-3 py-2"
                value={itemsText}
                onChange={e => setItemsText(e.target.value)}
              />
            </div>

            {/* 3行目：メモ（フル幅） */}
            <div className="space-y-1 md:col-span-5">
              <label className="text-sm text-(--muted)">メモ</label>
              <Input value={form.memo} onChange={e => setForm({ ...form, memo: e.target.value })} />
            </div>

            {/* ボタン列 */}
            <div className="md:col-span-5 flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={e => setSelectedFile(e.target.files?.[0] || null)}
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
                <Button type="submit">追加</Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* 下書き（DB） */}
      <Card>
        <CardHeader className="p-4 border-b border-(--border) flex items-center justify-between">
          <div>下書き</div>
          <div className="flex items-center gap-2">
            <Button size="md" variant="outline" onClick={onClearDrafts}>クリア</Button>
            <Button size="md" onClick={onFinalize}>登録</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border border-(--border) rounded-lg overflow-hidden">
              <thead className="bg-(--muted-bg) border-b border-(--border)">
                <tr className="text-left">
                  <th className="p-2">登録日</th>
                  <th className="p-2">取引日</th>
                  <th className="p-2 text-right">金額</th>
                  <th className="p-2">取引先</th>
                  <th className="p-2">区分</th>
                  <th className="p-2">品目</th>
                  <th className="p-2">メモ</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((x, i) => (
                  <tr key={i} className="border-b border-(--border)">
                    <td className="p-2 whitespace-nowrap">{x.registeredDate}</td>
                    <td className="p-2 whitespace-nowrap">{x.tradeDate}</td>
                    <td className="p-2 text-right">{Number(x.amount).toLocaleString()}</td>
                    <td className="p-2">{x.vendor}</td>
                    <td className="p-2">{x.category || '-'}</td>
                    <td className="p-2 max-w-[360px] truncate" title={x.itemsSummary || ''}>{x.itemsSummary || '-'}</td>
                    <td className="p-2">{x.memo || ''}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"　onClick={() => onDeleteDraft(i)}>削除</Button>
                    </td>
                  </tr>
                ))}
                {drafts.length === 0 && (
                  <tr><td colSpan={8} className="p-3 text-(--muted)">下書きなし</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

    </div>
  );
}
export default function Expenses(){
  // ▼ 下書き（DB保存）
  const [drafts, setDrafts] = useState<PreviewRow[]>([]);
  async function reloadDrafts(){
    try{
      const r = await fetch('/api/expense-drafts', { cache: 'no-store' });
      const j = await r.json(); setDrafts(j.items||[]);
    }catch{}
  }
  useEffect(()=>{ reloadDrafts(); },[]);

  async function addDraft(row: PreviewRow){
    const res = await fetch('/api/expense-drafts', {
      method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
        tradeDate: row.tradeDate, amount: row.amount, vendor: row.vendor,
        category: row.category, memo: row.memo, itemsSummary: row.itemsSummary
      })
    });
    if(!res.ok){ alert('下書き保存に失敗しました'); return; }
    await reloadDrafts();
  }
  async function deleteDraftAt(i:number){
    const id = drafts[i]?.id; if(!id) return;
    await fetch('/api/expense-drafts', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ ids:[id] }) });
    await reloadDrafts();
  }
  async function clearDrafts(){
    await fetch('/api/expense-drafts?all=true', { method:'DELETE' });
    await reloadDrafts();
  }
  async function finalizeDrafts(){
    if(!drafts.length) return alert('下書きがありません');
    if(!confirm(`${drafts.length}件を登録します。よろしいですか？`)) return;
    const r = await fetch('/api/expense-drafts/finalize', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
    if(!r.ok){ const t = await r.text().catch(()=> ''); alert('登録に失敗しました\n' + t); return; }
    alert('登録しました');
    await reloadDrafts();
  }

  // ▼ タブ
  const [active, setActive] = useState<'single' | 'bulk'>('single');
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">経費</h2>
      <div className="flex items-center gap-2 border-b pb-2 mt-2">
        <button
          className={`px-4 py-2 rounded-t border-b-2 ${active==='single' ? 'border-black font-semibold' : 'border-transparent text-(--muted)'}`}
          onClick={()=>setActive('single')}
        >
          個別登録
        </button>
        <button
          className={`px-4 py-2 rounded-t border-b-2 ${active==='bulk' ? 'border-black font-semibold' : 'border-transparent text-(--muted)'}`}
          onClick={()=>setActive('bulk')}
        >
          一括登録
        </button>
      </div>
      <div className="pt-2">
        {active === 'single' ? (
          <SingleRegisterTab
            onAppend={addDraft}
            drafts={drafts}
            onDeleteDraft={deleteDraftAt}
            onFinalize={finalizeDrafts}
            onClearDrafts={clearDrafts}
          />
        ) : (
          <BulkRegisterPage
            drafts={drafts}
            onAppendDraft={addDraft}
            onDeleteDraft={deleteDraftAt}
            onFinalize={finalizeDrafts}
            onClearDrafts={clearDrafts}
          />
        )}
      </div>
    </div>
  );
}
