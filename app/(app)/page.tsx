// app/page.tsx  ← サーバーコンポーネント
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'

export const runtime = 'nodejs'
// （任意）常にリダイレクト計算したい場合
// export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const session = await getSession()
  redirect(session ? '/dashboard' : '/login')
}
