import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  assertFound,
  HttpError,
  handleRouteError,
  jsonError,
  MSG_BAD_REQUEST,
  MSG_CONFLICT,
  MSG_INVALID_INPUT,
  MSG_NOT_FOUND,
  MSG_SERVER_ERROR,
  readJson,
  relativeRedirect,
  UnauthorizedError,
  validationMessage,
  withErrors,
} from '@/lib/http';

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

const body = async (res: Response) => ({ status: res.status, json: await res.json() });
const prismaError = (code: string, message = `Prisma ${code} internal detail`) =>
  Object.assign(new Error(message), { code, clientVersion: '7.10.0', meta: { target: ['email'] } });

describe('handleRouteError', () => {
  it('HttpError → its status, public message and headers', async () => {
    const res = handleRouteError(new HttpError(429, 'ゆっくり', { 'Retry-After': '30' }));
    expect(await body(res)).toEqual({ status: 429, json: { error: 'ゆっくり' } });
    expect(res.headers.get('Retry-After')).toBe('30');
  });

  it('UnauthorizedError → 401 unauthorized', async () => {
    expect(await body(handleRouteError(new UnauthorizedError()))).toEqual({
      status: 401,
      json: { error: 'unauthorized' },
    });
  });

  it('ZodError → 400 with our Japanese message', async () => {
    const schema = z.object({ amount: z.number({ error: '金額は数値で入力してください。' }) });
    const err = schema.safeParse({ amount: 'x' }).error;
    expect(await body(handleRouteError(err))).toEqual({
      status: 400,
      json: { error: '金額は数値で入力してください。' },
    });
  });

  it("ZodError with zod's default (English) message → generic 400", async () => {
    const err = z.object({ n: z.number() }).safeParse({ n: 'x' }).error;
    expect(await body(handleRouteError(err))).toEqual({ status: 400, json: { error: MSG_INVALID_INPUT } });
  });

  it('Prisma P2025 → 404, P2002 → 409, without Prisma details', async () => {
    const notFound = await body(handleRouteError(prismaError('P2025')));
    expect(notFound).toEqual({ status: 404, json: { error: MSG_NOT_FOUND } });
    const conflict = await body(handleRouteError(prismaError('P2002')));
    expect(conflict).toEqual({ status: 409, json: { error: MSG_CONFLICT } });
    expect(JSON.stringify([notFound, conflict])).not.toMatch(/Prisma|internal|email/);
  });

  it('unknown errors → 500 with a generic message and nothing internal', async () => {
    const secret = 'connect ECONNREFUSED postgresql://user:hunter2@db:5432/prod';
    const res = handleRouteError(new Error(secret));
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(JSON.parse(text)).toEqual({ error: MSG_SERVER_ERROR });
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('ECONNREFUSED');
    expect(consoleError).toHaveBeenCalledOnce();
  });

  it('non-Error throwables and other Prisma codes → 500', async () => {
    for (const thrown of ['boom', null, undefined, 42, { code: 'P1001' }, prismaError('P2003')]) {
      expect(await body(handleRouteError(thrown))).toEqual({ status: 500, json: { error: MSG_SERVER_ERROR } });
    }
  });
});

describe('validationMessage', () => {
  it('prefixes the 1-based position of array items', () => {
    const schema = z.array(z.object({ name: z.string().min(1, '名前を入力してください。') }));
    const err = schema.safeParse([{ name: 'a' }, { name: 'b' }, { name: '' }]).error;
    expect(err && validationMessage(err)).toBe('3件目: 名前を入力してください。');
  });
});

describe('readJson', () => {
  const schema = z.object({ email: z.string().min(1, 'メールアドレスを入力してください。') });
  const req = (raw: string) => new Request('http://localhost/api', { method: 'POST', body: raw });

  it('returns the parsed data', async () => {
    await expect(readJson(req('{"email":"a@example.com"}'), schema)).resolves.toEqual({ email: 'a@example.com' });
  });

  it('invalid JSON → HttpError 400', async () => {
    await expect(readJson(req('{oops'), schema)).rejects.toMatchObject({ status: 400, publicMessage: MSG_BAD_REQUEST });
  });

  it('schema violations → HttpError 400 with the message', async () => {
    await expect(readJson(req('{"email":""}'), schema)).rejects.toMatchObject({
      status: 400,
      publicMessage: 'メールアドレスを入力してください。',
    });
  });
});

describe('withErrors', () => {
  it('passes awaited params and maps thrown errors', async () => {
    const handler = withErrors<{ id: string }>(async (_req, { params }) => {
      if (params.id === 'missing') assertFound(0);
      return jsonError(200, `ok ${params.id}`);
    });
    const req = new NextRequest('http://localhost/api/x');
    expect(await body(await handler(req, { params: Promise.resolve({ id: '1' }) }))).toEqual({
      status: 200,
      json: { error: 'ok 1' },
    });
    expect(await body(await handler(req, { params: Promise.resolve({ id: 'missing' }) }))).toEqual({
      status: 404,
      json: { error: MSG_NOT_FOUND },
    });
  });
});

describe('jsonError / assertFound', () => {
  it('jsonError merges extra fields and headers', async () => {
    const res = jsonError(503, 'x', { extra: { ok: false, error: 'ignored' }, headers: { 'X-A': '1' } });
    expect(await body(res)).toEqual({ status: 503, json: { ok: false, error: 'x' } });
    expect(res.headers.get('X-A')).toBe('1');
  });

  it('assertFound only throws for 0', () => {
    expect(() => assertFound(1)).not.toThrow();
    expect(() => assertFound(0)).toThrow(HttpError);
  });
});

describe('relativeRedirect', () => {
  it('sets a relative Location', () => {
    const res = relativeRedirect('/login?verified=1');
    expect(res.status).toBe(303);
    expect(res.headers.get('Location')).toBe('/login?verified=1');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(relativeRedirect('/dashboard', 307).status).toBe(307);
  });

  it.each(['https://evil.example/', '//evil.example', 'login'])('refuses %j', (loc) => {
    expect(() => relativeRedirect(loc)).toThrow();
  });
});
