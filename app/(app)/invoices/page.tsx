// app/(app)/invoices/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

type Invoice = {
  id: string;
  client: string;
  amount: number;
  issueDate: string;
  status: string;
};

export default function Invoices() {
  const [list, setList] = useState<Invoice[]>([]);
  const [form, setForm] = useState({
    client: '',
    amount: '',
    issueDate: new Date().toISOString().slice(0, 10),
  });

  async function load() {
    const res = await fetch('/api/invoices');
    // セッション失効時は API が 401 を返す → Cookie を整理してログイン画面へ
    if (res.status === 401) {
      location.href = '/api/auth/expired';
      return;
    }
    const data = await res.json().catch(() => []);
    setList(Array.isArray(data) ? data : []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!form.client || !form.amount) return alert('宛先/金額 必須');
    await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: form.client,
        amount: Number(form.amount),
        issueDate: form.issueDate,
      }),
    });
    setForm({
      client: '',
      amount: '',
      issueDate: new Date().toISOString().slice(0, 10),
    });
    load();
  }

  function pdf(id: string) {
    window.open(`/api/invoices/${id}/pdf`, '_blank');
  }

  // 追加：1件削除
  async function removeOne(id: string) {
    if (!confirm('この売上データを削除します。よろしいですか？')) return;
    const r = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    if (!r.ok) {
      alert('削除に失敗しました');
      return;
    }
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">売上</h2>

      <Card>
        <CardHeader className="p-4 border-b border-(--border)">新規作成</CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-3 max-w-3xl">
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">売上名</label>
              <Input
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">金額</label>
              <Input
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)">発行日</label>
              <Input
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              />
            </div>
            <div className="md:col-span-3">
              <Button onClick={add}>追加</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 border-b border-(--border)">一覧</CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#101a16]">
                  {/* <th className="text-left p-2 border-b border-(--border)">ID</th> */}
                  <th className="text-left p-2 border-b border-(--border)">売上名</th>
                  <th className="text-left p-2 border-b border-(--border)">金額</th>
                  <th className="text-left p-2 border-b border-(--border)">発行日</th>
                  <th className="text-left p-2 border-b border-(--border)">状態</th>
                  <th className="p-2 border-b border-(--border) w-28 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="hover:bg-gray-50/70 dark:hover:bg-[#101a16]">
                    {/* <td className="p-2"><code>{x.id.slice(0,8)}</code></td> */}
                    <td className="p-2">{x.client}</td>
                    <td className="p-2">¥{x.amount.toLocaleString()}</td>
                    <td className="p-2">
                      {new Date(x.issueDate)
                        .toLocaleDateString('ja-JP', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                        })
                        .replace(/-/g, '/')}
                    </td>
                    <td className="p-2">{x.status}</td>
                    <td className="p-2 text-right">
                      <div className="inline-flex gap-2">
                       {/*} <Button size="sm" variant="outline" onClick={() => pdf(x.id)}>
                          PDF
                        </Button>*/}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => removeOne(x.id)}
                        >
                          削除
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-3 text-(--muted)">
                      データなし
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
