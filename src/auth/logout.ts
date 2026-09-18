// Signing out has two halves. The app's own session (the bearer and the
// wallet) is cleared by the session store; this is the other half, the
// Openfort SDK's session. Without it the SDK still reports the person as
// authenticated after a sign-out, and the sign-in screen, which derives its
// first step from that, opens on "set up wallet" instead of the choice of
// email, Google or X.
import { useOpenfortContext } from '@openfort/react-native';

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
