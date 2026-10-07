// app/(app)/invoices/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { apiErrorMessage, redirectIfUnauthorized } from '@/lib/api-client';
import { formatDateJST, todayJST } from '@/lib/dates';
import { parseAmountInput } from '@/lib/items';

type Invoice = {
  id: string;
  client: string;
  amount: number;
  issueDate: string;
};

const emptyForm = () => ({ client: '', amount: '', issueDate: todayJST() });

export default function Invoices() {
  const [list, setList] = useState<Invoice[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch('/api/invoices', { cache: 'no-store' });
    // セッション失効時は API が 401 を返す → Cookie を整理してログイン画面へ
    if (redirectIfUnauthorized(res)) return;
    if (!res.ok) {
      setError(await apiErrorMessage(res, '一覧の取得に失敗しました。'));
      return;
    }
    const data = await res.json().catch(() => []);
    setList(Array.isArray(data) ? data : []);
  }
  useEffect(() => {
    load();
  }, []);

  async function add() {
    if (!form.client.trim() || !form.amount.trim()) {
      setError('売上名と金額を入力してください。');
      return;
    }
    const amount = parseAmountInput(form.amount);
    if (amount === undefined) {
      setError('金額は数値で入力してください。');
      return;
    }
    if (!Number.isInteger(amount)) {
      setError('金額は円単位の整数で入力してください。');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: form.client, amount, issueDate: form.issueDate }),
      });
      if (redirectIfUnauthorized(res)) return;
      if (!res.ok) {
        // 失敗時は入力内容を残す
        setError(await apiErrorMessage(res, '追加に失敗しました。'));
        return;
      }
      setError(null);
      setForm(emptyForm());
      await load();
    } catch {
      setError('通信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSaving(false);
    }
  }

  // 1件削除
  async function removeOne(id: string) {
    if (!confirm('この売上データを削除します。よろしいですか？')) return;
    const r = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    if (redirectIfUnauthorized(r)) return;
    if (!r.ok) alert(await apiErrorMessage(r, '削除に失敗しました'));
    load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">売上</h2>

      <Card>
        <CardHeader className="p-4 border-b border-(--border)">新規作成</CardHeader>
        <CardContent>
          <form
            className="grid gap-3 md:grid-cols-3 max-w-3xl"
            onSubmit={(e) => {
              e.preventDefault();
              add();
            }}
          >
            <div className="space-y-1">
              <label className="text-sm text-(--muted)" htmlFor="invoice-client">
                売上名
              </label>
              <Input
                id="invoice-client"
                value={form.client}
                onChange={(e) => setForm({ ...form, client: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)" htmlFor="invoice-amount">
                金額
              </label>
              <Input
                id="invoice-amount"
                inputMode="numeric"
                value={form.amount}
                aria-invalid={error?.includes('金額') || undefined}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-(--muted)" htmlFor="invoice-issue-date">
                発行日
              </label>
              <Input
                id="invoice-issue-date"
                type="date"
                value={form.issueDate}
                onChange={(e) => setForm({ ...form, issueDate: e.target.value })}
              />
            </div>
            {error && (
              <div role="alert" className="md:col-span-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div className="md:col-span-3">
              <Button type="submit" disabled={saving}>
                {saving ? '追加中…' : '追加'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 border-b border-(--border)">一覧</CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-[#101a16]">
                  <th className="text-left p-2 border-b border-(--border)">売上名</th>
                  <th className="text-left p-2 border-b border-(--border)">金額</th>
                  <th className="text-left p-2 border-b border-(--border)">発行日</th>
                  <th className="p-2 border-b border-(--border) w-28 text-right">操作</th>
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <tr key={x.id} className="hover:bg-gray-50/70 dark:hover:bg-[#101a16]">
                    <td className="p-2">{x.client}</td>
                    <td className="p-2">¥{x.amount.toLocaleString()}</td>
                    <td className="p-2">{formatDateJST(x.issueDate).replace(/-/g, '/')}</td>
                    <td className="p-2 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-950"
                        onClick={() => removeOne(x.id)}
                      >
                        削除
                      </Button>
                    </td>
                  </tr>
                ))}
                {list.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-3 text-(--muted)">
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
