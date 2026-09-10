// Exchanges a verified Openfort identity for a Mentioned session.
//
// The web route verifies the Openfort access token server side and binds the
// session to the exact wallet the client claims, so a caller can never get a
// session for someone else's wallet. It currently returns the session token
// only as an httpOnly cookie; `sessionToken` here stays null until the web
// adds it to the body for mobile clients. Sign-in still tells us the thing
// that matters today: that a token minted by the React Native SDK verifies.
import { API_BASE } from '@/config';

export type ServerSignIn = {
  wallet: string;
  /** Null until the web returns the token in the body for `client: 'mobile'`. */
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

export async function signInWithServer(params: { token: string; wallet: string; ref?: string | null }): Promise<ServerSignIn> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'openfort',
        token: params.token,
        wallet: params.wallet,
        // Both are ignored by the current web build. They are what the mobile
        // sign-in change will read, and sending them now costs nothing.
        client: 'mobile',
        ...(params.ref ? { ref: params.ref } : {}),
      }),
      signal: controller.signal,
    });

    let body: { ok?: boolean; wallet?: string; sessionToken?: string; error?: string; code?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Non-JSON body; the status below is what we report.
    }

    if (!res.ok) throw new SignInError(res.status, body.error ?? `Sign-in failed (${res.status})`, body.code);
    if (!body.wallet) throw new SignInError(res.status, 'Sign-in succeeded but returned no wallet');
    // Fail loudly rather than letting the app act as a different wallet.
    if (body.wallet !== params.wallet) {
      throw new SignInError(res.status, `Server bound the session to ${body.wallet}, not the wallet we signed in with`);
    }

    return { wallet: body.wallet, sessionToken: body.sessionToken ?? null };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Picks the wallet to sign in with, mirroring the web's
 * ensureOpenfortSolanaWallet: recover an existing wallet, and only create one
 * when there genuinely is none, so a returning user never ends up with a
 * second empty wallet.
 */
export function chooseWalletAction(wallets: { address: string }[]): { action: 'recover'; address: string } | { action: 'create' } {
  const existing = wallets[0];
  return existing ? { action: 'recover', address: existing.address } : { action: 'create' };
}
