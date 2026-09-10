// Mints a Shield encryption session for automatic embedded-wallet recovery.
//
// The RN SDK does not implement `createEncryptedSessionEndpoint` yet (its own
// types carry a TODO), so we call the route ourselves and hand the SDK a
// `getEncryptionSession` callback. That is the better shape for us anyway: the
// web route answers 409 LEGACY_PRIVY_ACCOUNT for a user whose funds live in
// Privy, and doing the call ourselves is what lets us turn that into a
// specific, recognisable error instead of a generic SDK failure.
import { OPENFORT } from '@/config';

/**
 * The server has no valid `NEXT_PUBLIC_OPENFORT_CUTOVER_AT`, so it cannot tell
 * a legacy Privy user from a new one and refuses to mint a NEW wallet rather
 * than risk giving a Privy user a second, empty one. Recovery of an existing
 * wallet still passes through. Nothing the app can do: the server has to be
 * configured and redeployed.
 */
export class WalletRoutingUnconfiguredError extends Error {
  constructor() {
    super('Sign-in is not switched on yet. The server cannot create new wallets until its wallet routing is configured.');
    this.name = 'WalletRoutingUnconfiguredError';
  }
}

/** The user predates the Openfort cutover; their wallet is in Privy. */
export class LegacyPrivyAccountError extends Error {
  constructor() {
    super('Your account is being upgraded. Use mentioned.market for now.');
    this.name = 'LegacyPrivyAccountError';
  }
}

export class EncryptionSessionError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EncryptionSessionError';
  }
}

const TIMEOUT_MS = 15_000;

// The SDK catches whatever this throws and reports a bare "Failed to create
// Solana wallet" with no cause attached, so the real reason is kept here for
// the UI to read back.
let lastError: Error | null = null;

export function lastEncryptionSessionError(): Error | null {
  return lastError;
}

export async function fetchEncryptionSession(accessToken: string): Promise<string> {
  lastError = null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(OPENFORT.encryptionSessionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accessToken }),
      signal: controller.signal,
    });

    let body: { session?: string; error?: string; code?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      // Non-JSON body: fall through to the status-based error below.
    }

    if (res.status === 409 && body.code === 'LEGACY_PRIVY_ACCOUNT') throw new LegacyPrivyAccountError();
    if (res.status === 503 && body.code === 'WALLET_ROUTING_UNCONFIGURED') throw new WalletRoutingUnconfiguredError();
    if (!res.ok) throw new EncryptionSessionError(res.status, body.error ?? `Encryption session failed (${res.status})`);
    if (!body.session) throw new EncryptionSessionError(res.status, 'Encryption session response had no session');
    return body.session;
  } catch (e) {
    lastError = e instanceof Error ? e : new Error(String(e));
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
