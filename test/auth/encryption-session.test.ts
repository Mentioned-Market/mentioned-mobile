// The encryption-session call is the one chokepoint the web uses to stop a
// legacy Privy user getting a second, empty Openfort wallet while their real
// funds sit in Privy. Recognising that 409 correctly is the whole point.
import { EncryptionSessionError, fetchEncryptionSession, LegacyPrivyAccountError, WalletRoutingUnconfiguredError } from '@/auth/encryption-session';
import { OPENFORT } from '@/config';

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) =>
  jest.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);

afterEach(() => jest.restoreAllMocks());

describe('fetchEncryptionSession', () => {
  it('returns the session the route mints', async () => {
    mockFetch(async () => reply({ session: 'enc_abc123' }));
    await expect(fetchEncryptionSession('tok')).resolves.toBe('enc_abc123');
  });

  it('posts the access token to the configured route', async () => {
    const spy = mockFetch(async () => reply({ session: 's' }));
    await fetchEncryptionSession('tok');
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(OPENFORT.encryptionSessionUrl);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ accessToken: 'tok' });
  });

  it('recognises a legacy Privy account', async () => {
    mockFetch(async () => reply({ error: 'This account already exists with our previous wallet provider.', code: 'LEGACY_PRIVY_ACCOUNT' }, 409));
    const err = await fetchEncryptionSession('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LegacyPrivyAccountError);
    // The message is shown to the user, so it points at the website.
    expect((err as Error).message).toMatch(/mentioned\.market/);
  });

  it('does not mistake any other 409 for a legacy account', async () => {
    mockFetch(async () => reply({ error: 'Conflict' }, 409));
    const err = await fetchEncryptionSession('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EncryptionSessionError);
    expect(err).not.toBeInstanceOf(LegacyPrivyAccountError);
  });

  it('surfaces an unconfigured Shield', async () => {
    mockFetch(async () => reply({ error: 'Openfort Shield is not configured' }, 503));
    await expect(fetchEncryptionSession('tok')).rejects.toMatchObject({ status: 503, message: /not configured/ });
  });

  it('surfaces a rejected token', async () => {
    mockFetch(async () => reply({ error: 'Invalid access token' }, 401));
    await expect(fetchEncryptionSession('tok')).rejects.toMatchObject({ status: 401 });
  });

  it('surfaces the rate limit', async () => {
    mockFetch(async () => reply({ error: 'Rate limit exceeded' }, 429));
    await expect(fetchEncryptionSession('tok')).rejects.toMatchObject({ status: 429 });
  });

  it('fails clearly on a non-JSON error page', async () => {
    mockFetch(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(fetchEncryptionSession('tok')).rejects.toBeInstanceOf(EncryptionSessionError);
  });

  it('refuses a 200 that carries no session', async () => {
    mockFetch(async () => reply({}));
    await expect(fetchEncryptionSession('tok')).rejects.toThrow(/no session/);
  });

  it('sends an abort signal so a hung call cannot wedge sign-in', async () => {
    let seen: RequestInit | undefined;
    mockFetch(async (_u, init) => {
      seen = init;
      return reply({ session: 's' });
    });
    await fetchEncryptionSession('tok');
    expect(seen?.signal).toBeDefined();
  });
});

describe('wallet routing not configured', () => {
  it('recognises the servers refusal to create new wallets', async () => {
    // The server cannot tell a legacy Privy user from a new one without its
    // cutover set, so it refuses rather than risk a second empty wallet.
    mockFetch(async () => reply({ error: 'Wallet setup is temporarily unavailable. Please try again shortly.', code: 'WALLET_ROUTING_UNCONFIGURED' }, 503));
    const err = await fetchEncryptionSession('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WalletRoutingUnconfiguredError);
    expect((err as Error).message).toMatch(/not switched on yet/);
  });

  it('does not mistake a plain 503 for it', async () => {
    mockFetch(async () => reply({ error: 'Openfort Shield is not configured' }, 503));
    const err = await fetchEncryptionSession('tok').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(EncryptionSessionError);
    expect(err).not.toBeInstanceOf(WalletRoutingUnconfiguredError);
  });
});
