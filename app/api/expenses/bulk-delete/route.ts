import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const s = getSession();
  if (!s) return NextResponse.json({ ok:false, message:'unauthorized' }, { status: 401 });
  try {
    const { ids } = (await req.json()) as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ ok: false, message: "no ids" }, { status: 400 });
    }


    // ユーザー所有のIDに限定
    const myIds = (await prisma.expense.findMany({
      where: { userId: s.userId, id: { in: ids } },
      select: { id: true }
    })).map(x => x.id);
    if (myIds.length === 0) {
      return NextResponse.json({ ok: true, deleted: 0 });
    }
    // 子 → 親 の順（ExpenseItem → Expense）
    await prisma.expenseItem.deleteMany({
      where: { expenseId: { in: myIds } },
    });

    const result = await prisma.expense.deleteMany({
      where: { id: { in: myIds }, userId: s.userId },
    });

    return NextResponse.json({ ok: true, deleted: result.count });
  } catch (e: any) {
    console.error("bulk-delete error:", e);
    return NextResponse.json(
      { ok: false, message: e?.message ?? "unexpected error" },
      { status: 500 }
    );
  }
}

// 任意：GETで疎通チェック
export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST /api/expenses/bulk-delete" });
}