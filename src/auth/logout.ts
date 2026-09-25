// Signing out has two halves. The app's own session (the bearer and the
// wallet) is cleared by the session store; this is the other half, the
// Openfort SDK's session. Without it the SDK still reports the person as
// authenticated after a sign-out, and the sign-in screen, which derives its
// first step from that, opens on "set up wallet" instead of the choice of
// email, Google or X.
import { useOpenfortContext } from '@openfort/react-native';
import { useCallback } from 'react';

import { usePrivyAuth } from '@/auth/privy';
import { isOpenfortConfigured } from '@/config';

const noop = async () => undefined;

/** Ends the Openfort session. A no-op in a build without Openfort keys. */
export function useOpenfortLogout(): () => Promise<void> {
  // `isOpenfortConfigured` is a build-time constant, so this call is either
  // always made or never made, and the hook order is stable.
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const ctx = isOpenfortConfigured ? useOpenfortContext() : null;
  return ctx?.logout ?? noop;
}

/**
 * Ends both providers' sessions, whichever the person was on. A legacy
 * account signs in to Privy after Openfort turns it away, and either SDK left
 * signed in sends the next sign-in straight past the choice of method. Each
 * half is tried regardless of the other, and neither failure is fatal: the
 * app's own session is cleared by the caller either way.
 */
export function useProviderLogout(): () => Promise<void> {
  const logoutOpenfort = useOpenfortLogout();
  const { logout: logoutPrivy } = usePrivyAuth();
  return useCallback(async () => {
    const results = await Promise.allSettled([logoutOpenfort(), logoutPrivy()]);
    for (const r of results) if (r.status === 'rejected') console.log('[sign-out] provider logout failed', r.reason);
  }, [logoutOpenfort, logoutPrivy]);
}
