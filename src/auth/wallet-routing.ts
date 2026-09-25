// Which wallet provider a sign-in belongs on: Openfort for everyone new,
// Privy for accounts that predate the move.
//
// The rule is the web's (lib/walletRouting.ts, contexts/WalletContext.tsx),
// and the server makes the call, never the app. Every sign-in starts on
// Openfort. When the identity matches a Privy account made before the cutover
// and has no Openfort wallet, /api/openfort/encryption-session answers 409
// LEGACY_PRIVY_ACCOUNT rather than mint a second, empty wallet, and the app
// hands the person to Privy. Privy is never offered as a button of its own:
// tapping it would create exactly the Privy account the move is ending.
//
// The app goes one step further than the web. It logs in to Privy with
// `disableSignup`, so Privy itself refuses an identity it has never seen,
// where the web can only reject that account at the session step after
// Privy has already made it. If that ever happens, or the server refuses a
// Privy account made after the cutover (409 PRIVY_SIGNUP_CLOSED), the person
// is sent back to the normal sign-in.
import { lastEncryptionSessionError, LegacyPrivyAccountError } from '@/auth/encryption-session';
import { SignInError } from '@/auth/sign-in';

export type WalletProvider = 'openfort' | 'privy';

/**
 * `use-privy`: this identity already has an account with the previous
 * provider, so sign in there. `use-openfort`: it does not, so use the normal
 * sign-in.
 */
export type Handoff = 'use-privy' | 'use-openfort';

/** Privy error codes for "no Privy account for this identity". */
const NO_PRIVY_ACCOUNT = ['signup_disabled', 'user_does_not_exist'];

/**
 * The handoff a sign-in error calls for, or null when it is an ordinary
 * failure to show as it is.
 *
 * The Openfort SDK catches whatever the encryption-session callback throws
 * and reports "Failed to create Solana wallet" in its place, so the legacy
 * case is also read back from the last encryption-session error.
 *
 * That read-back comes LAST. The last error outlives the Openfort attempt, so
 * checking it first would turn Privy's "no account here" into another trip to
 * Privy, and the person would bounce between the two for ever.
 */
export function handoffFor(e: unknown): Handoff | null {
  if (e instanceof SignInError && e.code === 'PRIVY_SIGNUP_CLOSED') return 'use-openfort';
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string' && NO_PRIVY_ACCOUNT.includes(code)) return 'use-openfort';
  if (e instanceof LegacyPrivyAccountError || lastEncryptionSessionError() instanceof LegacyPrivyAccountError) return 'use-privy';
  return null;
}

/** The fields of a Privy linked account this reads. Loose, like the API. */
export type PrivyLinkedAccountLike = {
  type?: unknown;
  chain_type?: unknown;
  connector_type?: unknown;
  address?: unknown;
  wallet_index?: unknown;
};

/**
 * The Privy embedded Solana wallet to sign in with.
 *
 * Only an embedded wallet counts: it is the one the app can sign with, and
 * the one holding the funds. An external wallet a user once linked (Phantom,
 * say) is skipped. `preferred`, the wallet the app already has a session
 * for, wins whenever the account still holds it; otherwise the first HD index,
 * which is the wallet Privy created at signup.
 */
export function privySolanaWallet(accounts: readonly PrivyLinkedAccountLike[] | null | undefined, preferred?: string | null): string | null {
  const embedded = (accounts ?? []).filter(
    (a): a is PrivyLinkedAccountLike & { address: string } =>
      a?.type === 'wallet' && a.chain_type === 'solana' && a.connector_type === 'embedded' && typeof a.address === 'string' && a.address.length > 0,
  );
  if (preferred && embedded.some((a) => a.address === preferred)) return preferred;
  const index = (a: PrivyLinkedAccountLike) => (typeof a.wallet_index === 'number' ? a.wallet_index : Number.MAX_SAFE_INTEGER);
  return [...embedded].sort((a, b) => index(a) - index(b))[0]?.address ?? null;
}
