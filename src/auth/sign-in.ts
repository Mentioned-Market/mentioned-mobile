// Exchanges a verified Openfort or Privy identity, or a Seeker wallet's
// signature, for a Mentioned session.
//
// The web route verifies the provider's access token (or the signature) server
// side and binds the session to the exact wallet the client claims, so a caller
// can never get a session for someone else's wallet. It returns the session
// token in the body for `client: 'mobile'`; `sessionToken` is null only against
// a server from before that change.
import type { WalletProvider } from '@/auth/wallet-routing';
import { API_BASE } from '@/config';

export type ServerSignIn = {
  wallet: string;
  /** Null only from a server that predates the token in the body for `client: 'mobile'`. */
  sessionToken: string | null;
};

export class SignInError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'SignInError';
  }
}

const TIMEOUT_MS = 20_000;

type SignInBody = { ok?: boolean; wallet?: string; sessionToken?: string; error?: string; code?: string };

/** One POST to the sign-in route. `wallet` is the wallet the session must come back bound to. */
async function postSignIn(wallet: string, fields: Record<string, string>, ref?: string | null): Promise<ServerSignIn> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...fields,
        wallet,
        // `client: 'mobile'` is what makes the route return the session token
        // in the body; `ref` is read from there for the same reason.
        client: 'mobile',
        ...(ref ? { ref } : {}),
      }),
      signal: controller.signal,
    });

    let body: SignInBody = {};
    try {
      body = (await res.json()) as SignInBody;
    } catch {
      // Non-JSON body; the status below is what we report.
    }

    if (!res.ok) throw new SignInError(res.status, body.error ?? `Sign-in failed (${res.status})`, body.code);
    if (!body.wallet) throw new SignInError(res.status, 'Sign-in succeeded but returned no wallet');
    // Fail loudly rather than letting the app act as a different wallet.
    if (body.wallet !== wallet) {
      throw new SignInError(res.status, `Server bound the session to ${body.wallet}, not the wallet we signed in with`);
    }

    return { wallet: body.wallet, sessionToken: body.sessionToken ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * `provider` defaults to Openfort. Privy is for accounts made before the move
 * to Openfort; the route refuses a Privy account made after it with 409
 * PRIVY_SIGNUP_CLOSED (see src/auth/wallet-routing.ts).
 */
export async function signInWithServer(params: {
  token: string;
  wallet: string;
  ref?: string | null;
  provider?: Exclude<WalletProvider, 'seeker'>;
}): Promise<ServerSignIn> {
  return postSignIn(params.wallet, { type: params.provider ?? 'openfort', token: params.token }, params.ref);
}

/**
 * Sign in as a Seeker wallet, with the message it signed (see
 * src/lib/seeker-session.ts). There is no provider token here: the signature
 * is the proof, and the server checks it against the wallet claimed.
 *
 * The route calls this type `phantom` because a browser wallet was the first
 * thing to use it. It is a signature check and nothing about it is Phantom's.
 * `signature` is base64.
 */
export async function signInWithWalletSignature(params: {
  wallet: string;
  message: string;
  signature: string;
  ref?: string | null;
}): Promise<ServerSignIn> {
  return postSignIn(params.wallet, { type: 'phantom', message: params.message, signature: params.signature }, params.ref);
}

/**
 * Picks the wallet to sign in with, mirroring the web's
 * ensureOpenfortSolanaWallet: recover an existing wallet, and only create one
 * when there genuinely is none, so a returning user never ends up with a
 * second empty wallet.
 *
 * `preferred` is the wallet the app already holds a session for, and it wins
 * whenever the account still has it. Signing in again is how a lost Openfort
 * session is repaired, and it must come back to the same wallet: the funds,
 * the positions and the username are all on that one.
 *
 * Otherwise the OLDEST wins. A second wallet on an account is only ever an
 * accident (this account collected nine from a race since fixed), and the
 * money is on the first. Accounts with no `createdAt` keep the server's order.
 */
export function chooseWalletAction(
  wallets: { address: string; createdAt?: number }[],
  preferred?: string | null,
): { action: 'recover'; address: string } | { action: 'create' } {
  if (preferred && wallets.some((w) => w.address === preferred)) return { action: 'recover', address: preferred };
  const oldest = [...wallets].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))[0];
  return oldest ? { action: 'recover', address: oldest.address } : { action: 'create' };
}
