// app/login/page.tsx
'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

export default function Login() {
  const [email, setEmail] = useState('demo@example.com');
  const [pw, setPw] = useState('demo');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needVerify, setNeedVerify] = useState(false);

  // クエリ（認証完了/期限切れ/退会完了バナー と next パラメータ）
  const sp = useMemo(
    () =>
      new URLSearchParams(
        typeof window !== 'undefined' ? window.location.search : '',
      ),
    [],
  );
  const changed = sp.get('email_changed');
  const reason = sp.get('reason');
  const deleted = sp.get('deleted');
  const verified = sp.get('verified');
  const next = sp.get('next') || '/dashboard';

  async function submit(e: any) {
    e.preventDefault();
    setError(null);
    setNeedVerify(false);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data?.code === 'EMAIL_NOT_VERIFIED') {
          setNeedVerify(true);
          setError(
            'メール認証が完了していません。メール内のリンクをクリックしてください。',
          );
        } else {
          setError(data?.error ?? 'ログインに失敗しました');
        }
        return;
      }
      // 成功：API側でセッションCookie付与済み想定
      location.href = next;
    } catch {
      setError('通信に失敗しました');
    } finally {
      setLoading(false);
    }
  }

  async function resend() {
    try {
      setLoading(true);
      const r = await fetch('/api/account/email/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!r.ok) throw new Error();
      alert('確認メールを再送しました。受信トレイをご確認ください。');
    } catch {
      alert('再送に失敗しました。時間をおいてお試しください。');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center">
      <Card className="w-[380px]">
        <CardContent>
          {/* バナー表示 */}
          {changed === '1' && (
            <div className="mt-4 mb-2 p-3 rounded text-sm bg-green-50 text-green-800">
              メール認証が完了しました。ログインしてください。
            </div>
          )}
          {verified === '1' && (
            <div className="mt-4 mb-2 p-3 rounded text-sm bg-green-50 text-green-800">
              メール確認が完了しました。ログインしてください。
            </div>
          )}
          {changed === '0' && reason === 'expired' && (
            <div className="mt-4 mb-2 p-3 rounded text-sm bg-yellow-50 text-yellow-800">
              認証リンクの有効期限が切れています。再送してからお試しください。
            </div>
          )}
          {deleted === '1' && (
            <div className="mt-4 mb-2 p-3 rounded text-sm bg-green-50 text-green-800">
              アカウントを削除しました。ご利用ありがとうございました。
            </div>
          )}

          {/* エラー表示 */}
          {error && (
            <div className="mt-4 mb-2 p-3 rounded text-sm bg-red-50 text-red-800">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-3">
            <h2 className="text-xl font-semibold">ログイン</h2>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted)]">メール</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-[var(--muted)]">パスワード</label>
              <Input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? 'ログイン中…' : 'ログイン'}
            </Button>

            {/* 認証未完了時のみ再送UIを表示 */}
            {needVerify && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={resend}
                  disabled={loading || !email}
                >
                  確認メールを再送する
                </Button>
              </div>
            )}

            <div className="text-sm">
              <a className="text-recepita hover:underline" href="/signup">
                新規登録
              </a>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
