'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

export default function Signup(){
  const [email, setEmail] = useState('demo@example.com');
  const [pw, setPw]       = useState('demo');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'form'|'sent'|'error'>('form');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: any) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email, password: pw })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? '登録失敗');
        setPhase('error');
        return;
      }
      // 登録成功：認証メール案内フェーズへ
      setPhase('sent');
    } catch {
      setError('通信に失敗しました');
      setPhase('error');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    setLoading(true);
    try {
      const r = await fetch('/api/account/email/register', {
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ email })
      });
      if (!r.ok) throw new Error();
      alert('確認メールを再送しました。受信トレイをご確認ください。');
    } catch {
      alert('再送に失敗しました。時間をおいてお試しください。');
    } finally {
      setLoading(false);
    }
  }

  // === 認証メール案内画面（デザイントーンを維持） ===
  if (phase === 'sent') {
    return (
      <div className="min-h-screen grid place-items-center">
        <Card className="w-[380px]">
          <CardContent>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">メール確認のお願い</h2>
              <p className="text-sm text-[var(--muted)]">
                <b>{email}</b> 宛に確認メールを送信しました。<br />
                メール内のリンクをクリックして認証を完了してください。<br />
                認証が完了するまでログインはできません。
              </p>
              <Button className="w-full" variant="outline" onClick={resend} disabled={loading}>
                確認メールを再送する
              </Button>
              <div className="text-sm">
                <a className="text-recepita hover:underline" href="/login">ログインに戻る</a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // === 登録フォーム（オリジナルデザインのまま） ===
  return (
    <div className="min-h-screen grid place-items-center">
      <Card className="w-[380px]">
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <h2 className="text-xl font-semibold">新規登録</h2>

            {error && (
              <div className="p-2 rounded text-sm bg-red-50 text-red-800">{error}</div>
            )}

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted)]">メール</label>
              <Input value={email} onChange={e=> setEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted)]">パスワード</label>
              <Input type="password" value={pw} onChange={e=> setPw(e.target.value)} />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? '登録中…' : '登録'}
            </Button>

            <div className="text-sm">
              <a className="text-recepita hover:underline" href="/login">ログインに戻る</a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
