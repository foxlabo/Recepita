import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'
export const runtime = 'nodejs'
export default async function HomePage() {
  const session = await getSession()
  redirect(session ? '/dashboard' : '/login')
}
