// Bringing the embedded Solana wallet back, without the SDK hook's blind spot.
//
// `useEmbeddedSolanaWallet().setActive` refuses with "no embedded Solana
// wallets available" unless the hook's own fetch has returned the wallet, and
// that fetch does nothing at all while the SDK's embedded state is
// UNAUTHENTICATED or NONE. After a relaunch that is exactly the state it is
// in, so the hook waits for a list that waits for a state that only a
// recovery would establish: a standstill, seen on Sep 18 2026 as a claim
// screen reading "Connecting your wallet" for ever.
//
// The client has no such guard. Recovering through it is what the hook's own
// setActive does underneath (openfort-js `embeddedWallet.recover`), so this
// takes that step first and leaves the hook to catch up.
import { AccountTypeEnum, ChainTypeEnum, EmbeddedState, RecoveryMethod, type Openfort } from '@openfort/openfort-js';

import { currentAccessToken } from '@/auth/access-token';
import { fetchEncryptionSession } from '@/auth/encryption-session';

/**
 * Make the SDK's embedded signer ready for `accountId`, if it is not already.
 *
 * Recovery is AUTOMATIC for this app (no seed phrase, no password), which
 * means the key is unwrapped with a Shield encryption session minted by the
 * website for this access token. Nothing secret reaches the app.
 */
export async function ensureEmbeddedSigner(client: Openfort, accountId: string): Promise<void> {
  if ((await client.embeddedWallet.getEmbeddedState()) === EmbeddedState.READY) return;
  const encryptionSession = await fetchEncryptionSession(await currentAccessToken());
  await client.embeddedWallet.recover({
    account: accountId,
    recoveryParams: { recoveryMethod: RecoveryMethod.AUTOMATIC, encryptionSession },
  });
}

/** The part of `useEmbeddedSolanaWallet()` this needs, on any of its statuses. */
export type SolanaHookState = {
  status: string;
  wallets: { address: string }[];
  /** Absent on some of the SDK's transient statuses. */
  activeWallet?: { address: string } | null;
  setActive: (options: { address: string }) => Promise<void>;
};

/** Thrown when the signed-in account simply does not hold that wallet. */
export class WalletNotOnAccountError extends Error {
  constructor(address: string) {
    super(`This account does not hold the wallet ${address}.`);
    this.name = 'WalletNotOnAccountError';
  }
}

/** Openfort is still catching up; the caller should offer another go. */
export class WalletStillLoadingError extends Error {
  constructor() {
    super('Openfort is still loading your wallet. Try again in a moment.');
    this.name = 'WalletStillLoadingError';
  }
}

/** SDK statuses during which a `setActive` would fight work already in flight. */
const BUSY = ['connecting', 'reconnecting', 'fetching-wallets', 'creating'];

/**
 * Make `address` the wallet that signs, from whatever state the SDK is in.
 *
 * `hook` is a getter, not a value: the hook returns a fresh object on every
 * SDK change and a captured one never updates.
 *
 * Being "connected" is not enough on its own. An account can hold several
 * wallets (this one grew nine, eight of them from a race since fixed), and
 * the SDK may connect any of them. A transaction paid for by one wallet and
 * signed by another is rejected by the chain, so the wanted wallet being the
 * active one is the whole point of this function.
 */
export async function activateWallet(opts: { client: Openfort; address: string; hook: () => SolanaHookState; timeoutMs?: number }): Promise<void> {
  const { client, address, hook, timeoutMs = 20_000 } = opts;
  const active = () => {
    const h = hook();
    return h.status === 'connected' && h.activeWallet?.address === address;
  };
  if (active()) return;

  const list = await client.embeddedWallet.list({ chainType: ChainTypeEnum.SVM, accountType: AccountTypeEnum.EOA, limit: 100 });
  const account = list.find((a) => a.address === address);
  if (!account) throw new WalletNotOnAccountError(address);
  await ensureEmbeddedSigner(client, account.id);

  // Only the hook can hand out a signing provider, and it will only activate
  // a wallet its own fetch has returned, which the recovery above is what
  // unblocks. So wait for it to list the wallet, then hand over.
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (active()) return;
    const h = hook();
    if (!BUSY.includes(h.status) && h.wallets.some((w) => w.address === address)) {
      await h.setActive({ address });
      return;
    }
    if (Date.now() >= deadline) throw new WalletStillLoadingError();
    await new Promise((r) => setTimeout(r, 150));
  }
}
