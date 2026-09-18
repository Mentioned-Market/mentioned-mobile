// How the embedded wallet's recovery is going (see src/auth/wallet-reconnect.tsx).
//
// A store rather than a prop or a context because two unrelated places need
// it: the one component that performs the recovery, at the root, and every
// screen that needs a signer. Without it a failed recovery is
// indistinguishable from one still in progress, and a screen says
// "connecting" for ever.
import { create } from 'zustand';

type Status =
  /** Connected, or nothing to do yet. */
  | 'idle'
  /** A recovery is in flight. */
  | 'connecting'
  /** It will not happen without another try. */
  | 'failed'
  /**
   * The app holds a session but Openfort does not: its own session has gone
   * (expired, or a refresh that failed while offline). Reads still work on the
   * app's bearer, so the person looks signed in, but nothing can be signed
   * until they sign in again. No amount of retrying fixes it.
   */
  | 'needs-sign-in';

type WalletLinkState = {
  status: Status;
  message: string | null;
  /** Bumped by anything asking for another go. Watched by the reconnector. */
  attempt: number;
  begin: () => void;
  settled: () => void;
  failed: (message: string) => void;
  needsSignIn: () => void;
  retry: () => void;
};

export const useWalletLink = create<WalletLinkState>()((set) => ({
  status: 'idle',
  message: null,
  attempt: 0,
  // Each setter returns the current state unchanged when nothing moves, so a
  // repeated call does not wake every subscriber.
  begin: () => set((s) => (s.status === 'connecting' ? s : { ...s, status: 'connecting', message: null })),
  settled: () => set((s) => (s.status === 'idle' && s.message === null ? s : { ...s, status: 'idle', message: null })),
  failed: (message) => set((s) => (s.status === 'failed' || s.status === 'needs-sign-in' ? s : { ...s, status: 'failed', message })),
  needsSignIn: () => set((s) => (s.status === 'needs-sign-in' ? s : { ...s, status: 'needs-sign-in', message: 'Sign in again to use your wallet.' })),
  retry: () => set((s) => ({ ...s, status: 'connecting', message: null, attempt: s.attempt + 1 })),
}));
