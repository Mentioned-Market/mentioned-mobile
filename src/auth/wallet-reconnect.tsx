// Reconnects the embedded wallet after a cold start, and keeps the wallet that
// signs equal to the wallet the session is for.
//
// The Openfort SDK restores the login on its own, but not the wallet: after a
// relaunch its embedded state is not ready, so nothing has a signer and every
// trade button says "sign in" to a person who is signed in. The website
// recovers the wallet on load for the same reason
// (ensureOpenfortSolanaWallet); this is that, for the app. Renders nothing.
//
// It also handles the case an account with several wallets creates: the SDK
// can connect one the session is not for, which would sign transactions the
// chain rejects. `activateWallet` is what settles that, and what happened is
// published to `useWalletLink`, because a recovery that cannot succeed has to
// be told apart from one still running.
//
// A session on Privy (an account made before the move to Openfort) is left
// alone entirely: Openfort holds no wallet for it and no session, so every
// step here would report a failure that is not one. src/auth/privy.tsx
// reports on those sessions instead.
import { useEmbeddedSolanaWallet, useOpenfortClient, useUser } from '@openfort/react-native';
import { useEffect, useRef } from 'react';

import { WalletNotOnAccountError, activateWallet } from '@/auth/recover-wallet';
import { useSession } from '@/store/session';
import { useWalletLink } from '@/store/wallet-link';

/**
 * How long the SDK gets to restore its own session before the app decides it
 * has none. It reports `isAuthenticated: false` for the first moments of
 * every launch, so this cannot be acted on immediately.
 */
const RESTORE_MS = 8_000;

export function WalletReconnect() {
  const { isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const client = useOpenfortClient();
  // Null for a Privy session, which every effect below then leaves alone.
  const sessionWallet = useSession((s) => (s.provider === 'openfort' ? s.wallet : null));
  const attempt = useWalletLink((s) => s.attempt);
  const begin = useWalletLink((s) => s.begin);
  const settled = useWalletLink((s) => s.settled);
  const failed = useWalletLink((s) => s.failed);
  const needsSignIn = useWalletLink((s) => s.needsSignIn);

  // The hook hands back a new object on every SDK change, so the recovery is
  // given a getter rather than a captured snapshot.
  const solanaRef = useRef(solana);
  useEffect(() => {
    solanaRef.current = solana;
  });

  /** The (wallet, attempt) already acted on, so one attempt means one call. */
  const tried = useRef('');
  const onSessionWallet = solana.status === 'connected' && !!sessionWallet && solana.activeWallet?.address === sessionWallet;

  useEffect(() => {
    if (!isAuthenticated || !sessionWallet || onSessionWallet) return;
    const key = `${sessionWallet}:${attempt}`;
    if (tried.current === key) return;
    tried.current = key;
    begin();
    activateWallet({ client, address: sessionWallet, hook: () => solanaRef.current })
      .then(settled)
      .catch((e: unknown) => {
        console.log('[wallet] reconnect failed', e);
        failed(e instanceof WalletNotOnAccountError ? 'That wallet is not on this account. Sign in again.' : 'Could not connect your wallet.');
      });
  }, [isAuthenticated, sessionWallet, onSessionWallet, attempt, client, begin, settled, failed]);

  useEffect(() => {
    if (onSessionWallet) settled();
  }, [onSessionWallet, settled]);

  // An app session with no Openfort session behind it. Reads carry on, so
  // nothing else notices; signing cannot, and a retry would never help, so it
  // is reported as its own state rather than as a failure to connect.
  useEffect(() => {
    if (!sessionWallet || isAuthenticated) return;
    const timer = setTimeout(needsSignIn, RESTORE_MS);
    return () => clearTimeout(timer);
  }, [sessionWallet, isAuthenticated, needsSignIn]);

  return null;
}
