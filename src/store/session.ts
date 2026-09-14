// The Mentioned session: which wallet the app is acting as, and the bearer
// token once the web returns one. Persisted in SecureStore so a relaunch does
// not force a fresh sign-in.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { FLAVOR } from '@/config';

type SessionState = {
  wallet: string | null;
  /** Null while the web only sets the session as a cookie. */
  token: string | null;
  hydrated: boolean;
  setSession: (wallet: string, token: string | null) => void;
  clear: () => void;
  setHydrated: () => void;
};

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      wallet: null,
      token: null,
      hydrated: false,
      setSession: (wallet, token) => set({ wallet, token }),
      clear: () => set({ wallet: null, token: null }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      // One stored session per deployment. A bearer is signed by the server that
      // issued it, so dev's token sent to staging only ever answers 401, and the
      // app would look signed in while every account call quietly failed.
      // Production keeps the original key, so an installed release is unaffected.
      name: FLAVOR === 'production' ? 'mentioned.session' : `mentioned.session.${FLAVOR}`,
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ wallet: s.wallet, token: s.token }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
