// The typed GET wrapper: query building, error shaping, and the schema gate
// that turns a silent web-side change into a loud failure.
import { avatarPart, uploadTeamAvatar } from '@/api/arena';
import { ApiError, get, q } from '@/api/client';
import { API_BASE } from '@/config';
import { useSession } from '@/store/session';
import { z } from 'zod';

const Schema = z.object({ ok: z.boolean() });

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

afterEach(() => {
  jest.restoreAllMocks();
  useSession.setState({ wallet: null, token: null });
});

/** Read the Authorization header off the fetch call the client made. */
function sentAuth(spy: jest.SpyInstance): string | undefined {
  const init = spy.mock.calls[0][1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe('session bearer', () => {
  it('attaches the session token when signed in', async () => {
    // A native app has no cookie jar, so the token has to ride on every call.
    useSession.setState({ wallet: 'WALLET', token: 'tok_abc123' });
    const spy = mockFetch(async () => jsonResponse({ ok: true }));
    await get('/api/thing', Schema);
    expect(sentAuth(spy)).toBe('Bearer tok_abc123');
  });

  it('rides on the team picture upload too, which bypasses the JSON client', async () => {
    // The route takes the captain from the session. Sent without it, the
    // server refused the upload and the screen blamed the connection.
    useSession.setState({ wallet: 'WALLET', token: 'tok_abc123' });
    const spy = mockFetch(async () => jsonResponse({ ok: true }));
    await uploadTeamAvatar('my-team', 'WALLET', { mimeType: 'image/jpeg', name: 'p.jpg', bytes: async () => new Uint8Array() });
    expect(sentAuth(spy)).toBe('Bearer tok_abc123');
    // The multipart boundary is the platform's to set: a Content-Type here would break the upload.
    expect(Object.keys((spy.mock.calls[0][1] as RequestInit).headers as object)).not.toContain('Content-Type');
  });

  it('sends the picture as something Expo\'s fetch can read, not as a uri', () => {
    // Expo's fetch refuses React Native's { uri } file part and throws before
    // anything is sent. It takes a part with bytes(), a name and a type.
    const bytes = async () => new Uint8Array([0xff, 0xd8, 0xff]);
    const part = avatarPart({ name: 'p.jpg', mimeType: 'image/jpeg', bytes });
    expect(part).toEqual({ name: 'p.jpg', type: 'image/jpeg', bytes });
    expect(part).not.toHaveProperty('uri');
  });

  it('sends no Authorization header when signed out', async () => {
    const spy = mockFetch(async () => jsonResponse({ ok: true }));
    await get('/api/thing', Schema);
    expect(sentAuth(spy)).toBeUndefined();
  });

  it('reads the token at call time, not when the query was defined', async () => {
    // Sign-in happens after most queries already exist, so a captured token
    // would leave every one of them permanently anonymous.
    const spy = mockFetch(async () => jsonResponse({ ok: true }));
    await get('/api/thing', Schema);
    expect(sentAuth(spy)).toBeUndefined();

    useSession.setState({ wallet: 'WALLET', token: 'tok_later' });
    spy.mockClear();
    await get('/api/thing', Schema);
    expect(sentAuth(spy)).toBe('Bearer tok_later');
  });
});

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
