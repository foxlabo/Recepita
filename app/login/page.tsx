// app/login/page.tsx
'use client';
import { Suspense, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';
import { safeNextPath } from '@/lib/safe-next';

const FAIL_REASON: Record<string, string> = {
  expired: '認証リンクの有効期限が切れています。再送してからお試しください。',
  invalid: '認証リンクが無効か、既に使用されています。認証済みの場合はそのままログインしてください。',
  taken: 'このメールアドレスは既に使用されているため変更できませんでした。',
};

function Banner({ tone, children }: { tone: 'ok' | 'warn' | 'error'; children: React.ReactNode }) {
  const cls =
    tone === 'ok'
      ? 'bg-green-50 text-green-800'
      : tone === 'warn'
        ? 'bg-yellow-50 text-yellow-800'
        : 'bg-red-50 text-red-800';
  return <div className={`mt-4 mb-2 p-3 rounded-sm text-sm ${cls}`}>{children}</div>;
}

function LoginForm() {
  const sp = useSearchParams();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResend, setShowResend] = useState(false);

  // クエリ（認証完了/期限切れ/退会完了バナー と next パラメータ）
  const changed = sp.get('email_changed');
  const verified = sp.get('verified');
  const reason = sp.get('reason') ?? '';
  const deleted = sp.get('deleted');
  const next = safeNextPath(sp.get('next'));
  const failText = FAIL_REASON[reason] ?? '認証に失敗しました。時間をおいて再度お試しください。';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data?.error ?? 'ログインに失敗しました');
        // 未認証かどうかは応答から判別できないため、失敗時は再送手段を表示する
        if (res.status === 401) setShowResend(true);
        return;
      }
      // 成功：API側でセッションCookie付与済み
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
      const r = await fetch('/api/account/email/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        alert(data?.error ?? '再送に失敗しました。時間をおいてお試しください。');
        return;
      }
      alert('メール認証が未完了のアカウントの場合、確認メールを送信しました。受信トレイをご確認ください。');
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
            <Banner tone="ok">メールアドレスを変更しました。新しいメールアドレスでログインしてください。</Banner>
          )}
          {changed === '0' && <Banner tone="warn">{failText}</Banner>}
          {verified === '1' && <Banner tone="ok">メール確認が完了しました。ログインしてください。</Banner>}
          {verified === '0' && <Banner tone="warn">{failText}</Banner>}
          {deleted === '1' && <Banner tone="ok">アカウントを削除しました。ご利用ありがとうございました。</Banner>}

          {/* エラー表示 */}
          {error && <Banner tone="error">{error}</Banner>}

          <form onSubmit={submit} className="space-y-3">
            <h2 className="text-xl font-semibold">ログイン</h2>

            <div className="space-y-1">
              <label className="text-sm text-(--muted)" htmlFor="login-email">
                メール
              </label>
              <Input
                id="login-email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm text-(--muted)" htmlFor="login-password">
                パスワード
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>

            <Button className="w-full" disabled={loading}>
              {loading ? 'ログイン中…' : 'ログイン'}
            </Button>

            {showResend && (
              <div className="pt-1 space-y-1">
                <p className="text-xs text-(--muted)">メール認証がお済みでない場合は、確認メールを再送できます。</p>
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

export default function Login() {
  // useSearchParams はクライアント側でのみ値が確定するため Suspense で包む
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
