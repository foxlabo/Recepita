'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

export default function Signup() {
  const [email, setEmail] = useState('demo@example.com');
  const [pw, setPw] = useState('demo');
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<'form' | 'sent' | 'error'>('form');
  const [error, setError] = useState<string | null>(null);
  const [verificationUrl, setVerificationUrl] = useState<string | null>(null);
  const [devMode, setDevMode] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? '登録に失敗しました');
        setPhase('error');
        return;
      }
      setVerificationUrl(data?.verificationUrl ?? null);
      setDevMode(data?.devMode === true);
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error();
      setVerificationUrl(data?.verificationUrl ?? null);
      setDevMode(data?.devMode === true);
      alert(data?.devMode ? '開発用の確認リンクを更新しました。' : '確認メールを再送しました。');
    } catch {
      alert('再送に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  if (phase === 'sent') {
    return (
      <div className="min-h-screen grid place-items-center">
        <Card className="w-[420px] max-w-[92vw]">
          <CardContent>
            <div className="space-y-3">
              <h2 className="text-xl font-semibold">確認手順</h2>
              <p className="text-sm text-[var(--muted)]">
                <b>{email}</b> 宛てに確認メールを送信しました。
                メール内のリンクから認証を完了してください。
              </p>
              {devMode && verificationUrl && (
                <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                  <div className="font-medium">開発モード</div>
                  <a className="mt-2 block break-all text-recepita hover:underline" href={verificationUrl}>
                    {verificationUrl}
                  </a>
                </div>
              )}
              <Button className="w-full" variant="outline" onClick={resend} disabled={loading}>
                確認メールを再送
              </Button>
              <div className="text-sm">
                <a className="text-recepita hover:underline" href="/login">
                  ログインに戻る
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

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
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted)]">パスワード</label>
              <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? '登録中...' : '登録'}
            </Button>

            <div className="text-sm">
              <a className="text-recepita hover:underline" href="/login">
                ログインに戻る
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
