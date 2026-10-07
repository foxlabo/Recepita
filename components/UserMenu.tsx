'use client';
import ThemeToggle from '@/components/ThemeToggle';
export default function UserMenu({ email }: { email?: string }) {
  async function doLogout(){
    await fetch('/api/auth/logout', { method: 'POST' });
    if (typeof window !== 'undefined') location.href = '/login';
  }
  return (
    <div className="flex items-center gap-2">
      <div className="text-sm text-(--muted) hidden sm:block">{email || 'user'}</div>
      <button
        onClick={doLogout}
        className="rounded-md border border-(--border) bg-(--card) px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-[#101a16]"
      >
        サインアウト
      </button>
    </div>
  );
}