// lib/http.ts
// Small helpers so every API route returns consistent JSON errors and never
// leaks exception messages / Prisma errors to clients.
import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';

export const MSG_SERVER_ERROR = 'サーバーエラーが発生しました。時間をおいて再度お試しください。';
export const MSG_BAD_REQUEST = 'リクエストの形式が正しくありません。';

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

/** Parse a JSON body and validate it. Invalid JSON / schema → HttpError(400). */
export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new HttpError(400, MSG_BAD_REQUEST);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    // Only messages we wrote ourselves in the schemas are shown; zod's
    // defaults are English and may echo internals, so fall back to a generic one.
    const msg = first?.message && /[ぁ-んァ-ン一-龥]/.test(first.message) ? first.message : '入力内容が正しくありません。';
    throw new HttpError(400, msg);
  }
  return parsed.data;
}

/** Map any thrown value to a safe JSON response. */
export function handleRouteError(e: unknown): Response {
  if (e instanceof HttpError) {
    return jsonError(e.status, e.publicMessage, { headers: e.headers });
  }
  const code = (e as { code?: unknown } | null)?.code;
  if (code === 'P2025') {
    // Prisma "record not found" (e.g. update on a row the user does not own)
    return jsonError(404, 'not_found');
  }
  console.error('[api] unhandled error:', e instanceof Error ? `${e.name}: ${e.message}` : e);
  return jsonError(500, MSG_SERVER_ERROR);
}

type RouteCtx<P> = { params: Promise<P> };

/** Wrap a public route handler with consistent error handling. */
export function withErrors<P extends Record<string, string | string[]> = {}>(
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
