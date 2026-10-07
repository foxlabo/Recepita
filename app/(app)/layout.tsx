import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'
import UserMenu from '@/components/UserMenu'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // proxy.ts は JWT の署名/期限のみ確認する。失効済み（sessionVersion 不一致・
  // 削除済みユーザー）の場合は Cookie を消してログイン画面へ戻す。
  const session = await getSession()
  if (!session) redirect('/api/auth/expired')
  const email = session.email

  return (
    <div className="flex min-h-screen flex-col">
      <header className="h-16 bg-(--card) border-b border-(--border) flex items-center px-4 shadow-xs">
        <Link href="/" className="font-bold text-recepita" style={{ fontSize: 24 }}>
          Recepita
        </Link>
        <div className="ml-auto">
          <UserMenu email={email} />
        </div>
      </header>

      <main className="flex flex-1 min-h-0">
        <nav className="w-56 bg-(--card) border-r border-(--border) p-3">
          <ul className="space-y-2">
            <li><Link className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#101a16]" href="/dashboard">ダッシュボード</Link></li>
            <li><Link className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#101a16]" href="/expenses">経費登録</Link></li>
            <li><Link className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#101a16]" href="/receipts">経費一覧</Link></li>
            <li><Link className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#101a16]" href="/invoices">売上登録</Link></li>
            <li><Link className="block px-3 py-2 rounded-md hover:bg-gray-100 dark:hover:bg-[#101a16]" href="/settings">設定</Link></li>
          </ul>
        </nav>
        <section className="flex-1 overflow-auto p-5">{children}</section>
      </main>
    </div>
  )
}
