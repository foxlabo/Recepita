// lib/verification.ts
// E-mail verification tokens: 256-bit random, only the SHA-256 hash is
// stored, typed per flow, single-use and expiring.
import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { appUrl } from '@/lib/app-url';
import { escapeHtml, sendMail } from '@/lib/mail';
import type { Prisma, VerificationToken } from '@/lib/generated/prisma/client';

export type TokenType = 'EMAIL_VERIFY' | 'EMAIL_CHANGE';

export const TOKEN_TTL_MINUTES = 30;

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * Create a new token for (user, type), replacing older ones of the same type,
 * and return the raw token (to be sent by e-mail only).
 */
export async function issueToken(userId: string, email: string, type: TokenType): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  const now = new Date();
  await prisma.$transaction([
    prisma.verificationToken.deleteMany({
      where: { OR: [{ userId, type }, { expiresAt: { lt: now } }] },
    }),
    prisma.verificationToken.create({
      data: {
        tokenHash: hashToken(token),
        type,
        userId,
        email,
        expiresAt: new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000),
      },
    }),
  ]);
  return token;
}

export type ConsumeFailure = 'invalid' | 'expired' | 'taken';

/** Thrown from a consume callback to reject the token (transaction is rolled back). */
export class TokenRejected extends Error {
  constructor(readonly reason: ConsumeFailure) {
    super(`token rejected: ${reason}`);
  }
}

/**
 * Atomically consume a token of the given type and run `apply` in the same
 * transaction. A token of another type, an unknown token, an expired token or
 * one that was already used is rejected.
 */
export async function consumeToken(
  rawToken: string | null,
  type: TokenType,
  apply: (tx: Prisma.TransactionClient, vt: VerificationToken) => Promise<void>,
): Promise<{ ok: true; token: VerificationToken } | { ok: false; reason: ConsumeFailure }> {
  if (!rawToken || rawToken.length > 256) return { ok: false, reason: 'invalid' };

  const vt = await prisma.verificationToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!vt || vt.type !== type) return { ok: false, reason: 'invalid' };
  if (vt.expiresAt.getTime() <= Date.now()) {
    await prisma.verificationToken.deleteMany({ where: { id: vt.id } });
    return { ok: false, reason: 'expired' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Delete first: only one concurrent request can win the token.
      const { count } = await tx.verificationToken.deleteMany({
        where: { id: vt.id, type, expiresAt: { gt: new Date() } },
      });
      if (count !== 1) throw new TokenRejected('invalid');
      await apply(tx, vt);
    });
    return { ok: true, token: vt };
  } catch (e) {
    if (e instanceof TokenRejected) return { ok: false, reason: e.reason };
    if ((e as { code?: unknown })?.code === 'P2002') return { ok: false, reason: 'taken' };
    throw e;
  }
}

// ---------------------------------------------------------------- e-mails

function linkMail(to: string, subject: string, lead: string, link: string) {
  const safe = escapeHtml(link);
  return {
    to,
    subject,
    text: `${lead}\n${link}\n\nこのリンクの有効期限は${TOKEN_TTL_MINUTES}分です。心当たりがない場合はこのメールを破棄してください。`,
    html:
      `<p>${escapeHtml(lead)}</p><p><a href="${safe}">${safe}</a></p>` +
      `<p>このリンクの有効期限は${TOKEN_TTL_MINUTES}分です。心当たりがない場合はこのメールを破棄してください。</p>`,
  };
}

/** Issue an EMAIL_VERIFY token and send the sign-up confirmation mail. Returns the link. */
export async function sendSignupVerification(user: { id: string; email: string }): Promise<string> {
  const token = await issueToken(user.id, user.email, 'EMAIL_VERIFY');
  const link = appUrl('/api/account/email/verify', { token });
  await sendMail(
    linkMail(
      user.email,
      'Recepita 新規登録メール認証',
      '以下のリンクをクリックしてアカウント登録を完了してください。',
      link,
    ),
  );
  return link;
}

/** Issue an EMAIL_CHANGE token and send the confirmation mail to the new address. */
export async function sendEmailChangeConfirmation(userId: string, newEmail: string): Promise<string> {
  const token = await issueToken(userId, newEmail, 'EMAIL_CHANGE');
  const link = appUrl('/api/account/email/confirm', { token });
  await sendMail(
    linkMail(
      newEmail,
      'Recepita メールアドレス変更の確認',
      '以下のリンクをクリックして新しいメールアドレスを確定してください。',
      link,
    ),
  );
  return link;
}

/** Sent when someone tries to sign up with an address that already has an account. */
export async function sendAlreadyRegisteredNotice(email: string): Promise<void> {
  const login = appUrl('/login');
  await sendMail({
    to: email,
    subject: 'Recepita 登録済みのメールアドレスです',
    text: `このメールアドレスは既に Recepita に登録されています。\nログイン: ${login}\n\n心当たりがない場合はこのメールを破棄してください。`,
    html:
      `<p>このメールアドレスは既に Recepita に登録されています。</p>` +
      `<p><a href="${escapeHtml(login)}">ログインはこちら</a></p>` +
      `<p>心当たりがない場合はこのメールを破棄してください。</p>`,
  });
}
