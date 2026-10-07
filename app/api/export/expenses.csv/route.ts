import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-server';

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v).replace(/\r?\n/g, ' ');
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export async function GET() {
  const s = await getSession();
  if (!s?.userId) return new Response('Unauthorized', { status: 401 });

  const rows = await prisma.expense.findMany({
    where: { userId: s.userId },
    orderBy: { date: 'desc' },
    select: { date: true, amount: true, vendor: true, category: true, memo: true },
  });

  const header = ['date','amount','vendor','category','memo'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const date = r.date instanceof Date ? r.date.toISOString().slice(0,10) : String(r.date);
    lines.push([
      csvEscape(date),
      csvEscape(r.amount),
      csvEscape(r.vendor ?? ''),
      csvEscape(r.category ?? ''),
      csvEscape(r.memo ?? ''),
    ].join(','));
  }
  const csv = lines.join('\n');
  const bom = '\ufeff';
  return new Response(bom + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename=expenses.csv',
      'cache-control': 'no-store',
    },
  });
}
