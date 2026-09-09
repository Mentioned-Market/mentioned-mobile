// Small persisted preferences (intro seen). SecureStore is already the app's
// persistence layer, and this is a few bytes.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type PrefsState = {
  introSeen: boolean;
  hydrated: boolean;
  setIntroSeen: (v: boolean) => void;
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
      hydrated: false,
      setIntroSeen: (introSeen) => set({ introSeen }),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'mentioned.prefs',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ introSeen: s.introSeen }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
