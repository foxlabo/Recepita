// app/(app)/dashboard/page.tsx
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/auth-server'
import Dashboard from '@/components/Dashboard'

export const runtime = 'nodejs'

export default function DashboardPage() {
  const session = getSession()
  if (!session) redirect('/login')

  return (
    <div className="p-4">
      <Dashboard />
    </div>
  )
}
