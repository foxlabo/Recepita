// lib/http.ts
// Small helpers so every API route returns consistent JSON errors and never
// leaks exception messages / Prisma errors to clients.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

export const MSG_SERVER_ERROR = 'サーバーエラーが発生しました。時間をおいて再度お試しください。';
export const MSG_BAD_REQUEST = 'リクエストの形式が正しくありません。';
export const MSG_INVALID_INPUT = '入力内容が正しくありません。';
export const MSG_NOT_FOUND = '対象のデータが見つかりません。';
export const MSG_CONFLICT = '既に登録されているデータと重複しているため処理できませんでした。';

/** An error whose message is safe to show to the client. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
    readonly headers?: Record<string, string>,
  ) {
    super(publicMessage);
    this.name = 'HttpError';
  }
}

export class UnauthorizedError extends HttpError {
  constructor() {
    super(401, 'unauthorized');
    this.name = 'UnauthorizedError';
  }
}

export function jsonError(
  status: number,
  error: string,
  init?: { headers?: Record<string, string>; extra?: Record<string, unknown> },
) {
  return NextResponse.json({ ...(init?.extra ?? {}), error }, { status, headers: init?.headers });
}

export function unauthorized() {
  return jsonError(401, 'unauthorized');
}

/**
 * User-facing message for a validation error. Only messages we wrote
 * ourselves in the schemas are shown (zod's defaults are English and may echo
 * internals). For items of an array the position is prefixed ("3件目: …").
 */
export function validationMessage(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first?.message || !/[ぁ-んァ-ン一-龥]/.test(first.message)) return MSG_INVALID_INPUT;
  const index = first.path.find((p): p is number => typeof p === 'number');
  return index === undefined ? first.message : `${index + 1}件目: ${first.message}`;
}

/** Parse a JSON body and validate it. Invalid JSON / schema → HttpError(400). */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, MSG_BAD_REQUEST);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(400, validationMessage(parsed.error));
  return parsed.data;
}

/**
 * Map any thrown value to a safe JSON response:
 * - HttpError → its status/message
 * - ZodError (schema.parse outside readJson) → 400
 * - Prisma P2025 (record to update/delete not found, e.g. not owned) → 404
 * - Prisma P2002 (unique constraint) → 409
 * - anything else → 500 without details (logged briefly)
 */
export function handleRouteError(e: unknown): Response {
  if (e instanceof HttpError) {
    return jsonError(e.status, e.publicMessage, { headers: e.headers });
  }
  if (e instanceof z.ZodError) {
    return jsonError(400, validationMessage(e));
  }
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'P2025') return jsonError(404, MSG_NOT_FOUND);
  if (code === 'P2002') return jsonError(409, MSG_CONFLICT);
  console.error('[api] unhandled error:', e instanceof Error ? `${e.name}: ${e.message}` : e);
  return jsonError(500, MSG_SERVER_ERROR);
}

/** Throw 404 when an update/delete touched no row of the current user. */
export function assertFound(count: number): void {
  if (count === 0) throw new HttpError(404, MSG_NOT_FOUND);
}

type RouteCtx<P> = { params: Promise<P> };

/** Wrap a public route handler with consistent error handling. */
export function withErrors<P extends Record<string, string | string[]> = Record<string, never>>(
  handler: (req: NextRequest, ctx: { params: P }) => Promise<Response> | Response,
) {
  return async (req: NextRequest, ctx: RouteCtx<P>): Promise<Response> => {
    try {
      return await handler(req, { params: await ctx.params });
    } catch (e) {
      return handleRouteError(e);
    }
  };
}

/**
 * Redirect with a relative Location header, so the target never depends on
 * the request's Host header (or a misconfigured proxy origin).
 */
export function relativeRedirect(location: string, status: 303 | 307 = 303): NextResponse {
  if (!location.startsWith('/') || location.startsWith('//')) throw new Error('relativeRedirect: path expected');
  return new NextResponse(null, { status, headers: { Location: location, 'Cache-Control': 'no-store' } });
}
