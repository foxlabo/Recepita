// app/(app)/settings/page.tsx
'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Card, CardContent } from '@/components/ui/Card';

export const dynamic = 'force-dynamic';

type Profile = {
  lastName?: string | null;
  firstName?: string | null;
  lastNameKana?: string | null;
  firstNameKana?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  phone?: string | null;
  postalCode?: string | null;
  prefecture?: string | null;
  city?: string | null;
  address1?: string | null;
  address2?: string | null;
  businessName?: string | null;
  startDate?: string | null;
  occupation?: string | null;
  invoiceNo?: string | null;
};

export default function Settings() {
  const [tab, setTab] = useState<'account' | 'profile'>('account');

  // account tab states
  const [pw, setPw] = useState({ current: '', next: '' });
  const [newEmail, setNewEmail] = useState('');
  const [emailReqState, setEmailReqState] =
    useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // ★ アカウント削除用
  const [deleteEmail, setDeleteEmail] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  // profile tab states
  const [profile, setProfile] = useState<Profile>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/profile', { cache: 'no-store' });
        const p = await res.json();
        const toDateInput = (d?: string) =>
          d ? new Date(d).toISOString().slice(0, 10) : '';
        setProfile({
          ...p,
          birthDate: p?.birthDate ? toDateInput(p.birthDate) : '',
          startDate: p?.startDate ? toDateInput(p.startDate) : '',
        } as Profile);
      } catch {}
    })();
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">設定</h2>

      <div className="flex gap-2">
        {(
          [
            ['account', 'アカウント'],
            ['profile', 'マイページ'],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            variant={tab === k ? 'primary' : 'outline'}
            size="md"
            onClick={() => setTab(k as any)}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* ====== アカウントタブ ====== */}
      {tab === 'account' && (
        <Card>
          <CardContent>
            <div className="grid gap-8 max-w-2xl">
              {/* パスワード変更 */}
              <div className="grid gap-3">
                <h3 className="font-semibold text-lg">パスワード変更</h3>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    現在のパスワード
                  </label>
                  <Input
                    type="password"
                    value={pw.current}
                    onChange={(e) =>
                      setPw({ ...pw, current: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    新しいパスワード
                  </label>
                  <Input
                    type="password"
                    value={pw.next}
                    onChange={(e) => setPw({ ...pw, next: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/account/password', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(pw),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok) {
                          alert(data?.error || 'パスワードの更新に失敗しました。');
                          return;
                        }
                        setPw({ current: '', next: '' });
                        alert('パスワードを更新しました。他の端末ではサインアウトされます。');
                      } catch {
                        alert('通信に失敗しました。時間をおいてお試しください。');
                      }
                    }}
                  >
                    変更
                  </Button>
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!confirm('すべての端末からサインアウトします。よろしいですか？')) return;
                      const res = await fetch('/api/auth/logout-all', { method: 'POST' }).catch(() => null);
                      if (!res || (!res.ok && res.status !== 401)) {
                        alert('サインアウトに失敗しました。時間をおいてお試しください。');
                        return;
                      }
                      location.href = '/login';
                    }}
                  >
                    全端末サインアウト
                  </Button>
                </div>
              </div>

              {/* メールアドレス変更 */}
              <div className="grid gap-3 border-t border-(--border) pt-4">
                <h3 className="font-semibold text-lg">メールアドレス変更</h3>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    新しいメールアドレス
                  </label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    現在のパスワード（確認）
                  </label>
                  <Input
                    type="password"
                    value={pw.current}
                    onChange={(e) =>
                      setPw({ ...pw, current: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Button
                    onClick={async () => {
                      try {
                        setEmailReqState('sending');
                        const res = await fetch('/api/account/email/request', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            newEmail,
                            currentPassword: pw.current,
                          }),
                        });
                        if (!res.ok) throw new Error(await res.text());
                        setEmailReqState('sent');
                        alert(
                          '確認メールを送信しました。新しいメールアドレスの受信箱をご確認ください。',
                        );
                      } catch (e) {
                        setEmailReqState('error');
                        alert(
                          '送信に失敗しました。メールアドレスの重複やパスワードをご確認ください。',
                        );
                      } finally {
                        setEmailReqState('idle');
                      }
                    }}
                    disabled={!newEmail || emailReqState === 'sending'}
                  >
                    確認メールを送信
                  </Button>
                </div>
              </div>

              {/* アカウント削除 */}
              <div className="grid gap-3 border-t border-(--border) pt-4">
                <h3 className="font-semibold text-lg text-red-600">
                  アカウント削除
                </h3>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    メールアドレス
                  </label>
                  <Input
                    type="email"
                    value={deleteEmail}
                    onChange={(e) => setDeleteEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    パスワード
                  </label>
                  <Input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                  />
                </div>
                <div>
                  <Button
                    variant="outline"
                    className="border-red-300 text-red-600 hover:bg-red-50"
                    disabled={
                      deleteLoading || !deleteEmail || !deletePassword
                    }
                    onClick={async () => {
                      if (
                        !confirm(
                          'アカウントを削除します。よろしいですか？（この操作は取り消せません）',
                        )
                      )
                        return;
                      try {
                        setDeleteLoading(true);
                        const res = await fetch('/api/account/delete', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            email: deleteEmail,
                            password: deletePassword,
                          }),
                        });
                        const data = await res.json().catch(() => ({}));
                        if (!res.ok || !data?.ok) {
                          alert(
                            data?.error ||
                              '削除に失敗しました。メールアドレスまたはパスワードをご確認ください。',
                          );
                          return;
                        }
                        alert('アカウントを削除しました。ご利用ありがとうございました。');
                        location.href = '/login?deleted=1';
                      } catch (e) {
                        alert('削除に失敗しました。時間をおいてお試しください。');
                      } finally {
                        setDeleteLoading(false);
                      }
                    }}
                  >
                    アカウントを削除する
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ====== マイページタブ ====== */}
      {tab === 'profile' && (
        <Card>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await fetch('/api/settings/profile', {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(profile),
                });
                alert('保存しました');
              }}
              className="grid gap-3 max-w-3xl"
            >
              {/* 氏名 */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">姓</label>
                  <Input
                    value={profile.lastName || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, lastName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">名</label>
                  <Input
                    value={profile.firstName || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, firstName: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* フリガナ */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    セイ（カナ）
                  </label>
                  <Input
                    value={profile.lastNameKana || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, lastNameKana: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    メイ（カナ）
                  </label>
                  <Input
                    value={profile.firstNameKana || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, firstNameKana: e.target.value })
                    }
                  />
                </div>
              </div>

              {/* 生年月日・性別 */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">生年月日</label>
                  <Input
                    type="date"
                    value={profile.birthDate || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, birthDate: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">性別</label>
                  <select
                    value={profile.gender || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, gender: e.target.value })
                    }
                    className="w-full rounded-md border border-(--border) bg-white dark:bg-(--card) px-3 py-2"
                  >
                    <option value="">未選択</option>
                    <option value="male">男性</option>
                    <option value="female">女性</option>
                    <option value="other">その他</option>
                  </select>
                </div>
              </div>

              {/* 連絡先・住所 */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">電話番号</label>
                  <Input
                    value={profile.phone || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    郵便番号
                  </label>
                  <Input
                    placeholder="1000001"
                    value={profile.postalCode || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, postalCode: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    都道府県
                  </label>
                  <Input
                    value={profile.prefecture || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, prefecture: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    市区町村
                  </label>
                  <Input
                    value={profile.city || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, city: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-(--muted)">番地</label>
                <Input
                  value={profile.address1 || ''}
                  onChange={(e) =>
                    setProfile({ ...profile, address1: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-(--muted)">建物名等</label>
                <Input
                  value={profile.address2 || ''}
                  onChange={(e) =>
                    setProfile({ ...profile, address2: e.target.value })
                  }
                />
              </div>

              {/* 事業情報 */}
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    屋号（事業所名）
                  </label>
                  <Input
                    value={profile.businessName || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, businessName: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">開業日</label>
                  <Input
                    type="date"
                    value={profile.startDate || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, startDate: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    業種／職種
                  </label>
                  <Input
                    value={profile.occupation || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, occupation: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm text-(--muted)">
                    登録番号（インボイス）
                  </label>
                  <Input
                    placeholder="T1234567890123"
                    value={profile.invoiceNo || ''}
                    onChange={(e) =>
                      setProfile({ ...profile, invoiceNo: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="pt-2">
                <Button type="submit">保存</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
