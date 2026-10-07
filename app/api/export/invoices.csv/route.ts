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

  const rows = await prisma.invoice.findMany({
    where: { userId: s.userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, client: true, amount: true, issueDate: true},
  });

  const header = ['id','client','amount','issueDate','status'];
  const lines = [header.join(',')];
  for (const r of rows) {
    const issueDate = r.issueDate instanceof Date ? r.issueDate.toISOString().slice(0,10) : String(r.issueDate);
    lines.push([
      csvEscape(r.id),
      csvEscape(r.client ?? ''),
      csvEscape(r.amount),
      csvEscape(issueDate),
    ].join(','));
  }
  const csv = lines.join('\n');
  const bom = '\ufeff';
  return new Response(bom + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename=invoices.csv',
      'cache-control': 'no-store',
    },
  });
}
