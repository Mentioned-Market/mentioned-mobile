// Sign-in binds a Mentioned session to an Openfort wallet. The case that
// matters most is the mismatch: the app must never act as a wallet the server
// did not agree to.
import { chooseWalletAction, SignInError, signInWithServer, signInWithWalletSignature } from '@/auth/sign-in';
import { API_BASE } from '@/config';

const WALLET = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';
const OTHER = '2kRJr1m4TVN7rNSFQZLQr81orBSf4EChfzgZi5U2hexM';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const mockFetch = (impl: (url: string, init?: RequestInit) => Promise<Response>) => jest.spyOn(globalThis, 'fetch').mockImplementation(impl as typeof fetch);

afterEach(() => jest.restoreAllMocks());

describe('signInWithWalletSignature', () => {
  it('posts the signature and message under the type the route verifies as a wallet signature', async () => {
    const spy = mockFetch(async () => reply({ ok: true, wallet: WALLET, sessionToken: 'sess_abc' }));
    const result = await signInWithWalletSignature({ wallet: WALLET, message: 'Sign in to Mentioned\nTimestamp: 1', signature: 'c2ln', ref: 'ABC123' });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/auth/sign-in`);
    expect(JSON.parse(init?.body as string)).toEqual({
      type: 'phantom',
      wallet: WALLET,
      message: 'Sign in to Mentioned\nTimestamp: 1',
      signature: 'c2ln',
      client: 'mobile',
      ref: 'ABC123',
    });
    expect(result).toEqual({ wallet: WALLET, sessionToken: 'sess_abc' });
  });

  it('refuses a session bound to a different wallet', async () => {
    mockFetch(async () => reply({ ok: true, wallet: OTHER }));
    await expect(signInWithWalletSignature({ wallet: WALLET, message: 'm', signature: 's' })).rejects.toThrow(/not the wallet we signed in with/);
  });

  it('surfaces a rejected signature with its status', async () => {
    mockFetch(async () => reply({ error: 'Invalid signature' }, 401));
    await expect(signInWithWalletSignature({ wallet: WALLET, message: 'm', signature: 's' })).rejects.toMatchObject({ status: 401, message: 'Invalid signature' });
  });
});

describe('signInWithServer', () => {
  it('posts the Openfort type, token and wallet to the sign-in route', async () => {
    const spy = mockFetch(async () => reply({ ok: true, wallet: WALLET }));
    await signInWithServer({ token: 'tok', wallet: WALLET });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`${API_BASE}/api/auth/sign-in`);
    expect(JSON.parse(init?.body as string)).toMatchObject({ type: 'openfort', token: 'tok', wallet: WALLET, client: 'mobile' });
  });

  it('posts the Privy type for a legacy account', async () => {
    const spy = mockFetch(async () => reply({ ok: true, wallet: WALLET }));
    await signInWithServer({ token: 'privy_tok', wallet: WALLET, provider: 'privy' });
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toMatchObject({ type: 'privy', token: 'privy_tok', wallet: WALLET, client: 'mobile' });
  });

  it('returns the wallet the server confirmed', async () => {
    mockFetch(async () => reply({ ok: true, wallet: WALLET }));
    await expect(signInWithServer({ token: 'tok', wallet: WALLET })).resolves.toEqual({ wallet: WALLET, sessionToken: null });
  });

  it('reports no session token until the web returns one in the body', async () => {
    mockFetch(async () => reply({ ok: true, wallet: WALLET }));
    expect((await signInWithServer({ token: 'tok', wallet: WALLET })).sessionToken).toBeNull();
  });

  it('picks up the session token once the web adds it', async () => {
    mockFetch(async () => reply({ ok: true, wallet: WALLET, sessionToken: 'sess_abc' }));
    expect((await signInWithServer({ token: 'tok', wallet: WALLET })).sessionToken).toBe('sess_abc');
  });

  it('refuses a session bound to a different wallet', async () => {
    mockFetch(async () => reply({ ok: true, wallet: OTHER }));
    await expect(signInWithServer({ token: 'tok', wallet: WALLET })).rejects.toThrow(/not the wallet we signed in with/);
  });

  it('surfaces a rejected token, which is what a project mismatch looks like', async () => {
    mockFetch(async () => reply({ error: 'Verification failed' }, 401));
    await expect(signInWithServer({ token: 'tok', wallet: WALLET })).rejects.toMatchObject({ status: 401, message: 'Verification failed' });
  });

  it('carries the server code through, for the legacy Privy case', async () => {
    mockFetch(async () => reply({ error: 'New accounts use our current sign-in.', code: 'PRIVY_SIGNUP_CLOSED' }, 409));
    const err = (await signInWithServer({ token: 'tok', wallet: WALLET }).catch((e: unknown) => e)) as SignInError;
    expect(err.code).toBe('PRIVY_SIGNUP_CLOSED');
  });

  it('sends a referral code only when there is one', async () => {
    const spy = mockFetch(async () => reply({ ok: true, wallet: WALLET }));
    await signInWithServer({ token: 'tok', wallet: WALLET, ref: 'MICHTQYJ' });
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string).ref).toBe('MICHTQYJ');
    spy.mockClear();
    await signInWithServer({ token: 'tok', wallet: WALLET, ref: null });
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).not.toHaveProperty('ref');
  });

  it('fails clearly on an HTML error page', async () => {
    mockFetch(async () => new Response('<html>502</html>', { status: 502 }));
    await expect(signInWithServer({ token: 'tok', wallet: WALLET })).rejects.toBeInstanceOf(SignInError);
  });

  it('refuses a 200 that names no wallet', async () => {
    mockFetch(async () => reply({ ok: true }));
    await expect(signInWithServer({ token: 'tok', wallet: WALLET })).rejects.toThrow(/no wallet/);
  });
});

describe('chooseWalletAction', () => {
  it('recovers an existing wallet rather than making another', () => {
    // A returning user must never end up with a second, empty wallet.
    expect(chooseWalletAction([{ address: WALLET }])).toEqual({ action: 'recover', address: WALLET });
  });

  it('creates only when there is genuinely none', () => {
    expect(chooseWalletAction([])).toEqual({ action: 'create' });
  });

  it('takes the first when Openfort returns several with no dates', () => {
    expect(chooseWalletAction([{ address: WALLET }, { address: OTHER }])).toEqual({ action: 'recover', address: WALLET });
  });

  it('keeps the wallet the app already has a session for', () => {
    // Signing in again is how a lost Openfort session is repaired; it must
    // come back to the same wallet, not to the oldest one on the account.
    expect(chooseWalletAction([{ address: WALLET, createdAt: 100 }, { address: OTHER, createdAt: 200 }], OTHER)).toEqual({ action: 'recover', address: OTHER });
  });

  it('ignores a preferred wallet the account no longer holds', () => {
    expect(chooseWalletAction([{ address: WALLET, createdAt: 100 }], OTHER)).toEqual({ action: 'recover', address: WALLET });
  });

  it('takes the oldest when Openfort returns several, whatever the order', () => {
    // A second wallet on an account is an accident; the money is on the first.
    expect(chooseWalletAction([{ address: OTHER, createdAt: 200 }, { address: WALLET, createdAt: 100 }])).toEqual({ action: 'recover', address: WALLET });
  });
});
