// Small persisted preferences (intro seen, a referral code waiting for the
// next sign-in). SecureStore is already the app's persistence layer, and this
// is a few bytes.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PrefsState = {
  introSeen: boolean;
  /** From a `/ref/<code>` link. Sent once, with the next sign-in, then cleared. */
  pendingRef: string | null;
  hydrated: boolean;
  setIntroSeen: (v: boolean) => void;
  setPendingRef: (code: string | null) => void;
  setHydrated: () => void;
};

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const usePrefs = create<PrefsState>()(
  persist(
    (set) => ({
      introSeen: false,
      pendingRef: null,
      hydrated: false,
      setIntroSeen: (introSeen) => set({ introSeen }),
      setPendingRef: (pendingRef) => set({ pendingRef }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'mentioned.prefs',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ introSeen: s.introSeen, pendingRef: s.pendingRef }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
