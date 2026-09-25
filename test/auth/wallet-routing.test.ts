// The routing rule is the server's; what the app owns is reading the server's
// answer correctly and picking the right Privy wallet. A misread either way
// is costly: missing the legacy case strands someone's funds behind a generic
// error, and a wrong wallet signs transactions the chain rejects.
import { fetchEncryptionSession, LegacyPrivyAccountError } from '@/auth/encryption-session';
import { SignInError } from '@/auth/sign-in';
import { handoffFor, privySolanaWallet } from '@/auth/wallet-routing';

const A = '49GT1N8mRLp4Q9JYJDRR3YopGtfHFGTrwg6cmbm3u2fY';
const B = '2kRJr1m4TVN7rNSFQZLQr81orBSf4EChfzgZi5U2hexM';
const PHANTOM = 'EjM5xY7BbZ1VQpQh4gXk9m3sJ2uYw8rT6nCBgRkq1aa1';

const embedded = (address: string, wallet_index: number) => ({ type: 'wallet', chain_type: 'solana', connector_type: 'embedded', address, wallet_index });

afterEach(() => jest.restoreAllMocks());

describe('handoffFor', () => {
  it('sends a legacy account to Privy', () => {
    expect(handoffFor(new LegacyPrivyAccountError())).toBe('use-privy');
  });

  it('sees the legacy case through the SDK wrapping it in its own error', async () => {
    // What the SDK actually throws: "Failed to create Solana wallet", with the
    // encryption-session 409 underneath and nowhere on the error itself.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'LEGACY_PRIVY_ACCOUNT' }), { status: 409, headers: { 'Content-Type': 'application/json' } }),
    );
    await fetchEncryptionSession('tok').catch(() => undefined);
    expect(handoffFor(new Error('Failed to create Solana wallet'))).toBe('use-privy');
  });

  it('sends a post-cutover Privy account back to the normal sign-in', () => {
    expect(handoffFor(new SignInError(409, 'New accounts use our current sign-in.', 'PRIVY_SIGNUP_CLOSED'))).toBe('use-openfort');
  });

  it('sends an identity Privy has never seen back to the normal sign-in', () => {
    expect(handoffFor(Object.assign(new Error('Signup disabled'), { code: 'signup_disabled' }))).toBe('use-openfort');
    expect(handoffFor(Object.assign(new Error('Account not found'), { code: 'user_does_not_exist' }))).toBe('use-openfort');
  });

  it('leaves every other failure alone', async () => {
    // Clear the last encryption-session error with a successful call first.
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ session: 's' }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    await fetchEncryptionSession('tok');
    expect(handoffFor(new Error('Network request failed'))).toBeNull();
    expect(handoffFor(new SignInError(401, 'Verification failed'))).toBeNull();
    expect(handoffFor(Object.assign(new Error('x'), { code: 'invalid_credentials' }))).toBeNull();
    expect(handoffFor(null)).toBeNull();
  });
});

describe('privySolanaWallet', () => {
  it('picks the embedded Solana wallet', () => {
    expect(privySolanaWallet([{ type: 'email', address: 'a@b.co' }, embedded(A, 0)])).toBe(A);
  });

  it('never picks an external wallet, which the app cannot sign with', () => {
    const phantom = { type: 'wallet', chain_type: 'solana', connector_type: 'injected', address: PHANTOM };
    expect(privySolanaWallet([phantom])).toBeNull();
    expect(privySolanaWallet([phantom, embedded(A, 0)])).toBe(A);
  });

  it('ignores Ethereum wallets', () => {
    expect(privySolanaWallet([{ type: 'wallet', chain_type: 'ethereum', connector_type: 'embedded', address: '0xabc', wallet_index: 0 }])).toBeNull();
  });

  it('takes the first HD index, the wallet made at signup', () => {
    expect(privySolanaWallet([embedded(B, 1), embedded(A, 0)])).toBe(A);
  });

  it('prefers the wallet the app already has a session for', () => {
    expect(privySolanaWallet([embedded(A, 0), embedded(B, 1)], B)).toBe(B);
  });

  it('ignores a preferred wallet the account does not hold', () => {
    expect(privySolanaWallet([embedded(A, 0)], PHANTOM)).toBe(A);
  });

  it('copes with no accounts at all', () => {
    expect(privySolanaWallet(undefined)).toBeNull();
    expect(privySolanaWallet([])).toBeNull();
  });
});
