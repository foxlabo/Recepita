// lib/users.ts
import 'server-only';
import { prisma } from '@/lib/prisma';
import { normalizeEmail } from '@/lib/validation';

/**
 * Find a user by e-mail. New addresses are stored lower-cased; accounts created
 * before normalisation may contain upper-case letters, so fall back to a
 * case-insensitive match.
 */
export async function findUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  const exact = await prisma.user.findUnique({ where: { email: normalized } });
  if (exact) return exact;
  return prisma.user.findFirst({
    where: { email: { equals: normalized, mode: 'insensitive' } },
    orderBy: { createdAt: 'asc' },
  });
}

/** Address used to replace the e-mail of a deleted account (frees the real one). */
export function tombstoneEmail(userId: string): string {
  return `deleted+${userId}@invalid`;
}
