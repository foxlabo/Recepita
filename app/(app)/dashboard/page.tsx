// app/(app)/dashboard/page.tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth-server';
import type { Metadata } from 'next';
import Dashboard from '@/components/Dashboard';

export const runtime = 'nodejs';
export const metadata: Metadata = { title: 'ダッシュボード' };

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect('/api/auth/expired');

  return (
    <div className="p-4">
      <Dashboard />
    </div>
  );
}
