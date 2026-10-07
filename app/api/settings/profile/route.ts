// app/api/settings/profile/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth-server';
import { readJson } from '@/lib/http';
import { optionalText } from '@/lib/validation';

export const runtime = 'nodejs';

function toDateOrNull(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

const text = optionalText(200);
// 画面は GET の結果（id/userId/createdAt 等を含む）をそのまま送るため、
// 既知の項目だけを取り出し、それ以外は無視する。
const profileSchema = z.object({
  lastName: text,
  firstName: text,
  lastNameKana: text,
  firstNameKana: text,
  birthDate: optionalText(64),
  gender: optionalText(200),
  phone: optionalText(200),
  postalCode: optionalText(200),
  prefecture: text,
  city: text,
  address1: text,
  address2: text,
  businessName: text,
  startDate: optionalText(64),
  occupation: text,
  invoiceNo: optionalText(200),
});

// GET: プロフィール取得
export const GET = withAuth(async (_req, { session }) => {
  const profile = await prisma.userProfile.findUnique({
    where: { userId: session.userId },
  });
  // 未作成なら空オブジェクトを返す（フロントの扱いやすさ重視）
  return NextResponse.json(profile ?? {});
});

// PUT: プロフィール更新（なければ作成）
export const PUT = withAuth(async (req, { session }) => {
  const userId = session.userId;
  const body = await readJson(req, profileSchema);

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
});
