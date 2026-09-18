// Reconnects the embedded wallet after a cold start.
//
// The Openfort SDK restores the login on its own, but the wallet only comes
// back as "connected" by itself when its Shield state is already ready, which
// after a relaunch it usually is not. Until someone calls `setActive`, the
// wallet reads as disconnected, the trade hook has no signer, and every trade
// button says "sign in" to a person who is signed in. The website recovers the
// wallet on load for the same reason (ensureOpenfortSolanaWallet); this is
// that, for the app. Renders nothing.
import { useEmbeddedSolanaWallet, useUser } from '@openfort/react-native';
import { useEffect, useRef } from 'react';

import { useSession } from '@/store/session';

export function WalletReconnect() {
  const { isAuthenticated } = useUser();
  const solana = useEmbeddedSolanaWallet();
  const sessionWallet = useSession((s) => s.wallet);
  // One attempt per wallet per mount. A failure is left alone: the sign-in
  // screen is where recovery problems are explained, not a silent retry loop.
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !sessionWallet || attempted.current === sessionWallet) return;
    if (solana.status !== 'disconnected') return;
    // The hook's list fills in asynchronously; only act once the session's
    // wallet is in it, so this can never create or pick a different wallet.
    const listed = solana.wallets.some((w) => w.address === sessionWallet);
    if (!listed) return;
    attempted.current = sessionWallet;
    solana.setActive({ address: sessionWallet }).catch((e: unknown) => {
      console.log('[wallet] reconnect failed', e);
    });
  }, [isAuthenticated, sessionWallet, solana]);

  return null;
}
