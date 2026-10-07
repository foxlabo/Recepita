import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiErrorMessage, redirectIfUnauthorized } from '@/lib/api-client';
import { cn } from '@/lib/cn';
import { callOcr, OcrRequestError } from '@/lib/ocr/client';
import { THEME_STORAGE_KEY, themeInitScript } from '@/lib/theme';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('apiErrorMessage', () => {
  it('shows Japanese server messages', async () => {
    const res = Response.json({ error: '金額は数値で入力してください。' }, { status: 400 });
    expect(await apiErrorMessage(res, 'fallback')).toBe('金額は数値で入力してください。');
  });

  it('hides machine-readable codes and broken bodies', async () => {
    expect(await apiErrorMessage(Response.json({ error: 'unauthorized' }, { status: 401 }), '失敗')).toBe('失敗');
    expect(await apiErrorMessage(Response.json({ error: 42 }), '失敗')).toBe('失敗');
    expect(await apiErrorMessage(new Response('<html>502</html>', { status: 502 }), '失敗')).toBe('失敗');
  });
});

describe('redirectIfUnauthorized', () => {
  it('sends the browser to /api/auth/expired on 401 only', () => {
    const location = { href: '/receipts' };
    vi.stubGlobal('location', location);
    expect(redirectIfUnauthorized(new Response(null, { status: 403 }))).toBe(false);
    expect(location.href).toBe('/receipts');
    expect(redirectIfUnauthorized(new Response(null, { status: 401 }))).toBe(true);
    expect(location.href).toBe('/api/auth/expired');
  });
});

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', undefined, false, 'b')).toBe('a b');
  });
});

describe('callOcr (browser → /api/ocr)', () => {
  const file = new File([new Uint8Array([0xff, 0xd8, 0xff])], 'r.jpg', { type: 'image/jpeg' });
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('posts the file and model as multipart form data', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ ok: true, detected: { amount: 1 } }));
    expect(await callOcr(file, 'invoice')).toEqual({ ok: true, detected: { amount: 1 } });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/ocr');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('model')).toBe('invoice');
    expect(((init.body as FormData).get('file') as File).name).toBe('r.jpg');
  });

  it('retries a 429 with a short Retry-After when allowed', async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(Response.json({ error: '混雑' }, { status: 429, headers: { 'Retry-After': '2' } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const p = callOcr(file, 'auto', { retries: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry by default, without Retry-After, or for long waits', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: '混雑しています' }, { status: 429, headers: { 'Retry-After': '2' } }),
    );
    await expect(callOcr(file, 'auto')).rejects.toMatchObject({ message: '混雑しています', status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValue(Response.json({ error: 'x' }, { status: 503 }));
    await expect(callOcr(file, 'auto', { retries: 3 })).rejects.toBeInstanceOf(OcrRequestError);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockReset().mockResolvedValue(Response.json({}, { status: 503, headers: { 'Retry-After': '120' } }));
    await expect(callOcr(file, 'auto', { retries: 3 })).rejects.toMatchObject({
      message: '解析に失敗しました（HTTP 503）',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns 401 into a re-login message', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ error: 'unauthorized' }, { status: 401 }));
    await expect(callOcr(file, 'auto')).rejects.toMatchObject({
      status: 401,
      message: 'ログインの有効期限が切れました。再度ログインしてください。',
    });
  });

  it('propagates network errors', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(callOcr(file, 'auto', { retries: 2 })).rejects.toThrow('Failed to fetch');
  });
});

describe('themeInitScript (runs before the first paint)', () => {
  function run(stored: string | null, systemDark: boolean, storageThrows = false) {
    const classes = new Set<string>();
    const document = {
      documentElement: {
        classList: { toggle: (c: string, on: boolean) => (on ? classes.add(c) : classes.delete(c)) },
      },
    };
    const localStorage = {
      getItem: (k: string) => {
        if (storageThrows) throw new Error('SecurityError');
        return k === THEME_STORAGE_KEY ? stored : null;
      },
    };
    const window = { matchMedia: (q: string) => ({ matches: systemDark && q.includes('dark') }) };
    new Function('document', 'localStorage', 'window', themeInitScript)(document, localStorage, window);
    return classes.has('dark');
  }

  it('applies a stored choice regardless of the OS setting', () => {
    expect(run('dark', false)).toBe(true);
    expect(run('light', true)).toBe(false);
  });

  it('follows the OS setting without a stored choice', () => {
    expect(run(null, true)).toBe(true);
    expect(run(null, false)).toBe(false);
    expect(run('bogus', true)).toBe(true);
  });

  it('never throws when storage is unavailable', () => {
    expect(() => run(null, true, true)).not.toThrow();
  });
});
