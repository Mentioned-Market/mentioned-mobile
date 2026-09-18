// Openfort provider, wired to be inert when the publishable keys are absent.
//
// The web behaves the same way: with the keys unset the provider renders its
// children untouched. That keeps a build without keys fully usable read-only
// rather than crashing on launch, which matters because the keys are supplied
// per flavour at build time.
import { OpenfortProvider, RecoveryMethod, useUser } from '@openfort/react-native';
import { useEffect, type ReactNode } from 'react';

import { currentAccessToken, registerAccessTokenGetter } from '@/auth/access-token';
import { fetchEncryptionSession } from '@/auth/encryption-session';
import { WalletReconnect } from '@/auth/wallet-reconnect';
import { isOpenfortConfigured, OPENFORT } from '@/config';

/**
 * Publishes the SDK's access-token getter so the encryption-session callback
 * can reach it. Mounted inside the provider, renders nothing.
 */
function AccessTokenBridge() {
  const { getAccessToken } = useUser();
  useEffect(() => {
    registerAccessTokenGetter(getAccessToken);
  }, [getAccessToken]);
  return null;
}

export function OpenfortAuthProvider({ children }: { children: ReactNode }) {
  if (!isOpenfortConfigured) return <>{children}</>;

  return (
    <OpenfortProvider
      publishableKey={OPENFORT.publishableKey}
      walletConfig={{
        shieldPublishableKey: OPENFORT.shieldPublishableKey,
        // No seed phrase: Shield holds the share and recovery is automatic.
        recoveryMethod: RecoveryMethod.AUTOMATIC,
        getEncryptionSession: async () => {
          // Logged because the SDK swallows the cause and reports only
          // "Failed to create Solana wallet".
          try {
            const token = await currentAccessToken();
            const session = await fetchEncryptionSession(token);
            console.log('[openfort] encryption session minted, length', session.length);
            return session;
          } catch (e) {
            console.log('[openfort] encryption session FAILED', e);
            throw e;
          }
        },
      }}
    >
      <AccessTokenBridge />
      <WalletReconnect />
      {children}
    </OpenfortProvider>
  );
}
