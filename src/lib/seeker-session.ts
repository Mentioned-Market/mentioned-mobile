// The rules for an account that IS a Seeker wallet: signed in with the Seed
// Vault rather than with Openfort, and trading from it directly.
//
// Two pure pieces live here. The message the wallet signs to sign in, and the
// transaction the wallet is shown when it signs a trade. Both are byte formats
// someone else checks (the website and the Seed Vault), so they are kept away
// from the screens and tested on their own.

const SIGN_IN_TITLE = 'Sign in to Mentioned';

/**
 * The message a wallet signs to sign in. `nowS` is unix seconds.
 *
 * The format is the website's (`verifyPhantomSignIn` in mentioned/lib/
 * walletAuth.ts), which accepts it for five minutes either side of its own
 * clock. It is the same message a browser wallet signs there, which is why
 * this login needed nothing new from the server.
 */
export function buildSeekerSignInMessage(nowS: number): string {
  return `${SIGN_IN_TITLE}\nTimestamp: ${Math.floor(nowS)}`;
}

const SIGNATURE_BYTES = 64;
const VERSION_FLAG = 0x80;

/**
 * How many signatures a compiled transaction message requires. It is the first
 * byte of the header, which a versioned message puts after its version byte.
 */
export function requiredSignatures(messageBytes: Uint8Array): number {
  const versioned = messageBytes.length > 0 && (messageBytes[0] & VERSION_FLAG) !== 0;
  const count = messageBytes[versioned ? 1 : 0];
  // More than 127 would need a two-byte length below, and no transaction that
  // fits in a packet has that many signers.
  if (!count || count >= VERSION_FLAG) throw new Error('Not a transaction message: it names no signers.');
  return count;
}

/**
 * The wire transaction for a message, with every signature slot empty.
 *
 * The app's signing seam hands a signer the message bytes alone (see
 * src/auth/signer.ts). An embedded wallet signs those as they are. The Seed
 * Vault must not: bytes signed as a "message" are shown to the person as text,
 * and a wallet is right to refuse a message that is really a transaction. So
 * the message is put back inside a transaction, which the wallet shows and
 * approves as one. Only the signature is taken from what comes back, so any
 * signature already on the real transaction (a sponsor's) is left alone.
 */
export function unsignedWireTransaction(messageBytes: Uint8Array): Uint8Array {
  const count = requiredSignatures(messageBytes);
  const out = new Uint8Array(1 + count * SIGNATURE_BYTES + messageBytes.length);
  out[0] = count;
  out.set(messageBytes, 1 + count * SIGNATURE_BYTES);
  return out;
}

/** True when the two byte strings are the same. */
export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Said when the person backed out of the wallet's approval screen during a trade. */
export const WALLET_CANCELLED = 'You cancelled in the wallet. Nothing was sent.';

/**
 * True when a wallet error means the person dismissed or declined the request,
 * as opposed to something having gone wrong.
 *
 * Backing out of the Seed Vault's approval screen on a Seeker surfaces as the
 * bare Java exception name, `java.util.concurrent.CancellationException`
 * (seen Oct 8 2026); a wallet that answers with a refusal says "declined" or
 * "not signed" instead. None of these is a sentence to show anyone.
 */
export function isWalletCancel(raw: string): boolean {
  return /CancellationException|cancell?ed|declined|not signed|user (rejected|denied)/i.test(raw);
}

/**
 * True when signing out should also forget the remembered Seeker wallet.
 *
 * The app remembers a Seeker wallet it has been shown, and when nobody is
 * signed in the Me tab shows that wallet as one to look at
 * (src/store/active-wallet.ts). For an account that IS the Seeker wallet, the
 * remembered wallet is the account, so after signing out the same name,
 * portfolio and positions stayed on screen under the sign-in card, as if the
 * sign-out had not worked. Forgetting it there is what makes signing out look
 * like signing out. A Seeker remembered by an embedded account, from a deposit
 * or a withdrawal, is a different wallet and is kept.
 */
export function forgetsSeekerOnSignOut(sessionWallet: string | null, rememberedSeeker: string | null): boolean {
  return !!sessionWallet && sessionWallet === rememberedSeeker;
}
