import Link from 'next/link';

export default function AppNav() {
  return (
    <nav className="w-full bg-white shadow-xs border-b sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-2 flex items-center gap-4">
        <Link href="/" className="font-semibold">Recepita</Link>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/expenses" className="hover:underline">経費一覧</Link>
          <Link href="/expenses/bulk" className="px-2 py-1 rounded-sm bg-black text-white hover:opacity-90">
            一括登録
          </Link>
        </div>
      </div>
    </nav>
  );
}
