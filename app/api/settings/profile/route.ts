// /app/api/settings/profile/route.ts
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSessionOrThrow } from '@/lib/auth-server';

function toDateOrNull(v: any): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

// GET: プロフィール取得
export async function GET(_req: Request) {
  const { userId } = await getSessionOrThrow();           // ← 引数なし
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  // 未作成なら空オブジェクトを返す（フロントの扱いやすさ重視）
  return NextResponse.json(profile ?? {});
}

// PUT: プロフィール更新（なければ作成）
export async function PUT(req: Request) {
  const { userId } = await getSessionOrThrow();           // ← 引数なし
  const body = await req.json();

  const data = {
    lastName:       body.lastName ?? null,
    firstName:      body.firstName ?? null,
    lastNameKana:   body.lastNameKana ?? null,
    firstNameKana:  body.firstNameKana ?? null,
    birthDate:      toDateOrNull(body.birthDate),
    gender:         body.gender ?? null,
    phone:          body.phone ?? null,
    postalCode:     body.postalCode ?? null,
    prefecture:     body.prefecture ?? null,
    city:           body.city ?? null,
    address1:       body.address1 ?? null,
    address2:       body.address2 ?? null,
    businessName:   body.businessName ?? null,
    startDate:      toDateOrNull(body.startDate),
    occupation:     body.occupation ?? null,
    invoiceNo:      body.invoiceNo ?? null,
  };

  const saved = await prisma.userProfile.upsert({
    where: { userId },
    update: data,
    create: { userId, ...data },
  });

  return NextResponse.json({ ok: true, profile: saved });
}
