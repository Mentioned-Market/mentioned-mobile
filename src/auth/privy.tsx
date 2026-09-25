// Privy, kept for accounts made before the move to Openfort.
//
// Everything Privy-shaped the app touches is here, so the rest of the app
// deals in a wallet address and a raw signer and never imports the SDK. Like
// the Openfort provider it is inert without its keys: a build without them
// renders its children untouched, and a legacy account is told to use the
// website instead (see src/app/sign-in.tsx).
//
// Two settings matter for money. `createOnLogin: 'off'` means Privy never
// makes a wallet: a legacy account already has one, and a new wallet would
// be an empty duplicate. And every login passes `disableSignup`, so Privy
// refuses an identity it has never seen instead of creating an account for
// it (see src/auth/wallet-routing.ts for why that matters).
import { PrivyProvider, useEmbeddedSolanaWallet, useLoginWithEmail, useLoginWithOAuth, usePrivy } from '@privy-io/expo';
import { useEffect, useMemo, type ReactNode } from 'react';

import type { OpenfortRawSign } from '@/auth/signer';
import type { PrivyLinkedAccountLike } from '@/auth/wallet-routing';
import { isPrivyConfigured, PRIVY } from '@/config';
import { useSession } from '@/store/session';
import { useWalletLink } from '@/store/wallet-link';
import { rawSignWithPrivy, type PrivySolanaProvider } from '@/trade/privy-signer';

/**
 * Where Privy's browser login returns. The same route Openfort's uses, which
 * sends expo-router back to the sign-in screen rather than an unmatched page.
 */
const OAUTH_REDIRECT = '/oauth/callback';

/**
 * How long Privy gets to restore its own session on launch before the app
 * decides it has none. Matches the Openfort reconnector.
 */
const RESTORE_MS = 8_000;

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  if (!isPrivyConfigured) return <>{children}</>;
  return (
    <PrivyProvider
      appId={PRIVY.appId}
      clientId={PRIVY.clientId}
      config={{ embedded: { solana: { createOnLogin: 'off' }, ethereum: { createOnLogin: 'off' } } }}
    >
      <PrivyWalletWatch />
      {children}
    </PrivyProvider>
  );
}

export type PrivyUserLike = { linked_accounts?: readonly PrivyLinkedAccountLike[] } | null | undefined;

export type PrivyAuth = {
  /** False in a build without the Privy keys; every call below then throws. */
  configured: boolean;
  /** True once the SDK has restored (or failed to restore) its session. */
  ready: boolean;
  user: PrivyUserLike;
  getAccessToken: () => Promise<string | null>;
  logout: () => Promise<void>;
  sendEmailCode: (email: string) => Promise<void>;
  loginWithEmailCode: (email: string, code: string) => Promise<PrivyUserLike>;
  loginWithOAuth: (provider: 'google' | 'twitter') => Promise<PrivyUserLike>;
};

const unconfigured = async (): Promise<never> => {
  throw new Error('Privy is not configured in this build.');
};

const INERT: PrivyAuth = {
  configured: false,
  ready: true,
  user: null,
  getAccessToken: async () => null,
  logout: async () => undefined,
  sendEmailCode: unconfigured,
  loginWithEmailCode: unconfigured,
  loginWithOAuth: unconfigured,
};

/**
 * The Privy calls the app uses, as one object.
 *
 * `isPrivyConfigured` is a build-time constant, so these hooks are either
 * always called or never called and the hook order is stable. They must not
 * be called at all without the provider, which is only mounted with the keys.
 */
export function usePrivyAuth(): PrivyAuth {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return isPrivyConfigured ? useConfiguredPrivyAuth() : INERT;
}

function useConfiguredPrivyAuth(): PrivyAuth {
  const { user, isReady, getAccessToken, logout } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { login } = useLoginWithOAuth();
  return useMemo(
    () => ({
      configured: true,
      ready: isReady,
      user,
      getAccessToken,
      logout,
      sendEmailCode: async (email) => void (await sendCode({ email })),
      loginWithEmailCode: (email, code) => loginWithCode({ email, code, disableSignup: true }),
      loginWithOAuth: (provider) => login({ provider, redirectUri: OAUTH_REDIRECT, disableSignup: true }),
    }),
    [user, isReady, getAccessToken, logout, sendCode, loginWithCode, login],
  );
}

/**
 * A signer for the session's wallet when the session is on Privy, or null.
 *
 * Null until Privy is signed in and lists that exact wallet. An account can
 * hold more than one, and a transaction paid for by one wallet and signed by
 * another is rejected by the chain, so any other wallet does not count.
 */
export function usePrivySigner(): OpenfortRawSign | null {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return isPrivyConfigured ? useConfiguredPrivySigner() : null;
}

function useConfiguredPrivySigner(): OpenfortRawSign | null {
  const { user } = usePrivy();
  const solana = useEmbeddedSolanaWallet();
  const wallet = useSession((s) => s.wallet);
  const provider = useSession((s) => s.provider);
  const match = provider === 'privy' && user ? solana.wallets?.find((w) => w.address === wallet) : undefined;
  return useMemo(
    () => (match ? rawSignWithPrivy(async () => (await match.getProvider()) as unknown as PrivySolanaProvider) : null),
    [match],
  );
}

/**
 * Publishes a Privy session's wallet state to `useWalletLink`, the way
 * WalletReconnect does for Openfort, so screens tell "connecting" apart from
 * "sign in again". Privy reconnects its wallet by itself (each signing request
 * recovers it if needed), so there is nothing to drive here, only to report.
 * Renders nothing.
 */
function PrivyWalletWatch() {
  const { user, isReady } = usePrivy();
  const solana = useEmbeddedSolanaWallet();
  const wallet = useSession((s) => s.wallet);
  const onPrivy = useSession((s) => s.provider) === 'privy';
  const begin = useWalletLink((s) => s.begin);
  const settled = useWalletLink((s) => s.settled);
  const failed = useWalletLink((s) => s.failed);
  const needsSignIn = useWalletLink((s) => s.needsSignIn);

  const listed = !!wallet && !!solana.wallets?.some((w) => w.address === wallet);
  const error = solana.status === 'error' ? solana.error : null;

  useEffect(() => {
    if (!onPrivy || !wallet || !user) return;
    if (listed) settled();
    else if (error) failed('Could not connect your wallet.');
    else begin();
  }, [onPrivy, wallet, user, listed, error, begin, settled, failed]);

  // A Mentioned session with no Privy session behind it: reads carry on,
  // signing cannot, and only a sign-in fixes it.
  useEffect(() => {
    if (!onPrivy || !wallet || user || !isReady) return;
    const timer = setTimeout(needsSignIn, RESTORE_MS);
    return () => clearTimeout(timer);
  }, [onPrivy, wallet, user, isReady, needsSignIn]);

  return null;
}
