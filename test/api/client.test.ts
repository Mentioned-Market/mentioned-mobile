// The typed GET wrapper: query building, error shaping, and the schema gate
// that turns a silent web-side change into a loud failure.
import { ApiError, get, q } from '@/api/client';
import { API_BASE } from '@/config';
import { z } from 'zod';

const Schema = z.object({ ok: z.boolean() });

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => jest.restoreAllMocks());

describe('q', () => {
  it('builds a query string', () => {
    expect(q({ id: '1', wallet: 'abc' })).toBe('?id=1&wallet=abc');
  });

  it('drops undefined values', () => {
    expect(q({ id: '1', week: undefined })).toBe('?id=1');
  });

  it('is empty when everything is undefined', () => {
    expect(q({ week: undefined })).toBe('');
  });

  it('encodes values', () => {
    expect(q({ name: 'a b&c' })).toBe('?name=a%20b%26c');
  });

  it('accepts numbers', () => {
    expect(q({ id: 42 })).toBe('?id=42');
  });
});

describe('get', () => {
  it('requests the path against the configured API base', async () => {
    const spy = mockFetch(async () => jsonResponse({ ok: true }));
    await get('/api/thing', Schema);
    expect(spy.mock.calls[0][0]).toBe(`${API_BASE}/api/thing`);
  });

  it('returns the parsed body', async () => {
    mockFetch(async () => jsonResponse({ ok: true }));
    await expect(get('/api/thing', Schema)).resolves.toEqual({ ok: true });
  });

  it('throws an ApiError carrying the status', async () => {
    mockFetch(async () => jsonResponse({ error: 'nope' }, 404));
    await expect(get('/api/thing', Schema)).rejects.toMatchObject({ name: 'ApiError', status: 404, message: 'nope' });
  });

  it('survives a non-JSON error body', async () => {
    mockFetch(async () => new Response('<html>502</html>', { status: 502 }));
    const err = await get('/api/thing', Schema).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(502);
  });

  it('fails loudly when the response shape changes', async () => {
    // A web-side rename must not reach a screen as undefined.
    mockFetch(async () => jsonResponse({ okay: true }));
    await expect(get('/api/thing', Schema)).rejects.toThrow(/Unexpected response shape/);
  });

  it('names the offending field in the shape error', async () => {
    mockFetch(async () => jsonResponse({ ok: 'yes' }));
    await expect(get('/api/thing', Schema)).rejects.toThrow(/ok/);
  });

  it('passes an abort signal so the request can time out', async () => {
    let seen: RequestInit | undefined;
    mockFetch(async (_url, init) => {
      seen = init;
      return jsonResponse({ ok: true });
    });
    await get('/api/thing', Schema);
    expect(seen?.signal).toBeDefined();
  });
});
