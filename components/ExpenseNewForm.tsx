'use client';

import React, { useMemo, useState } from 'react';

type DraftItem = { name: string; qty: number; unitPrice: number; taxRate: number; amount: number };
type OCRDraft = { date?: string; partnerName?: string; total?: number; items?: DraftItem[] };

function parseItemsText(s: string): DraftItem[] {
  if (!s) return [];
  const norm = s.replace(/\r/g, '').trim();
  if (!norm) return [];
  const parts = norm.split(/[\n,、]+/).map(p => p.trim()).filter(Boolean);
  const items: DraftItem[] = [];
  for (const p of parts) {
    const [nameRaw, priceRaw] = p.split(/[:：=]/).map(x => (x || '').trim());
    if (!nameRaw) continue;
    const m = (priceRaw || '').replace(/[^0-9.]/g, '');
    if (!m) continue;
    const amt = Math.round(Number(m) || 0);
    items.push({ name: nameRaw, qty: 1, unitPrice: amt, taxRate: 10, amount: amt });
  }
  return items;
}

function itemsToText(items: any[]): string {
  if (!Array.isArray(items)) return '';
  return items
    .map((it: any) => {
      const name = String(it?.name ?? '').trim();
      const price = Math.round(Number(it?.amount ?? it?.unitPrice ?? 0));
      if (!name) return null;
      return `${name}:${price}`;
    })
    .filter(Boolean)
    .join(', ');
}

export default function ExpenseNewForm() {
  const [date, setDate] = useState<string>('');
  const [amount, setAmount] = useState<any>('');
  const [vendor, setVendor] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [itemsText, setItemsText] = useState<string>('');

  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<'idle'|'uploading'|'processing'|'ready'|'failed'>('idle');

  const parsedItems = useMemo(() => parseItemsText(itemsText), [itemsText]);
  const totalByItems = useMemo(
    () => parsedItems.reduce((s, it) => s + (Number(it.amount) || 0), 0),
    [parsedItems]
  );

  const onParse = async () => {
    if (files.length === 0) return;
    try {
      setStatus('uploading');
      const form = new FormData();
      files.forEach(f => form.append('files', f));
      const res = await fetch('/api/scansets', { method: 'POST', body: form });
      if (!res.ok) throw new Error('upload failed');
      const j = await res.json();
      const scanSetId = j.scanSetId;

      setStatus('processing');
      const res2 = await fetch(`/api/scansets/${scanSetId}/ocr`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ files: j.files, model: 'prebuilt-receipt', options: {} }),
      });
      if (!res2.ok) throw new Error('ocr start failed');

      const started = Date.now();
      const timeout = 60_000;
      while (Date.now() - started < timeout) {
        await new Promise(r => setTimeout(r, 800));
        const r = await fetch(`/api/scansets/${scanSetId}`);
        const d = await r.json();
        if (d.status === 'ready') {
          const combined: OCRDraft = d.draft?.combined || {};
          if (combined.date) setDate(combined.date);
          if (combined.partnerName) setVendor(combined.partnerName);
          if (combined.total) setAmount(combined.total);
          if (Array.isArray(d.draft?.combined?.items)) setItemsText(itemsToText(d.draft.combined.items));
          setStatus('ready');
          return;
        }
        if (d.status === 'failed') throw new Error('ocr failed');
      }
      throw new Error('timeout');
    } catch (e) {
      console.error('[parse] failed:', e);
      setStatus('failed');
      alert('解析に失敗しました');
    }
  };

  const onAdd = async () => {
    try {
      const items = parseItemsText(itemsText);
      const payload = {
        date,
        vendor,
        total: Number(amount) || 0,
        category: category || null,
        paymentMethod: paymentMethod || null,
        memo: memo || null,
        items,
      };
      const res = await fetch('/api/expenses/create-simple', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('create failed');
      alert('登録しました');
      location.reload();
    } catch (e) {
      console.error('[add] failed:', e);
      alert('登録に失敗しました');
    }
  };

  return (
    <div className="bg-white rounded-sm shadow-xs border p-4 mb-6">
      <div className="text-lg font-semibold mb-3">新規登録</div>

      {/* 1行目：日付・金額・取引先・区分・支払方法 */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <label className="text-sm block">
          <span className="block mb-1">日付</span>
          <input className="w-full border rounded-sm px-2 py-2" value={date} onChange={(e)=>setDate(e.target.value)} placeholder="YYYY-MM-DD" />
        </label>
        <label className="text-sm block">
          <span className="block mb-1">金額</span>
          <input type="number" className="w-full border rounded-sm px-2 py-2" value={amount} onChange={(e)=>setAmount(e.target.value)} />
        </label>
        <label className="text-sm block">
          <span className="block mb-1">取引先</span>
          <input className="w-full border rounded-sm px-2 py-2" value={vendor} onChange={(e)=>setVendor(e.target.value)} />
        </label>
        <label className="text-sm block">
          <span className="block mb-1">区分</span>
          <input className="w-full border rounded-sm px-2 py-2" value={category} onChange={(e)=>setCategory(e.target.value)} placeholder="旅費交通費/通信費/消耗品/食料品 など" />
        </label>
        <label className="text-sm block">
          <span className="block mb-1">支払方法</span>
          <input className="w-full border rounded-sm px-2 py-2" value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)} placeholder="現金 / クレカ / 電子マネー など" />
        </label>
      </div>

      {/* 2行目：品目（テキスト） */}
      <div className="mt-3">
        <label className="text-sm block mb-1">品目（`商品名:金額` をカンマ / 改行区切り）</label>
        <textarea className="w-full border rounded-sm px-2 py-2" rows={2}
                  placeholder="ジャスミン:59, スイートパインブロ:289, ごま油香る うま塩き:258, 梨【MK】:238"
                  value={itemsText} onChange={(e)=>setItemsText(e.target.value)} />
      </div>

      {/* 3行目：メモ */}
      <div className="mt-3">
        <label className="text-sm block mb-1">メモ</label>
        <input className="w-full border rounded-sm px-2 py-2" value={memo} onChange={(e)=>setMemo(e.target.value)} />
      </div>

      {/* ボタン列 */}
      <div className="mt-4 flex items-center gap-3">
        <input type="file" multiple onChange={(e)=>setFiles(Array.from(e.target.files||[]))} />
        <button onClick={onParse} disabled={!files.length || status==='processing'} className="px-3 py-2 border rounded-sm">
          解析
        </button>
        <div className="ml-auto flex items-center gap-3">
          <div className="text-sm text-gray-500">合計(品目): {totalByItems.toLocaleString()} 円</div>
          <button onClick={onAdd} className="px-4 py-2 bg-black text-white rounded-sm">追加</button>
        </div>
      </div>
    </div>
  );
}
