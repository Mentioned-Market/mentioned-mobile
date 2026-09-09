// Viewed wallet (v0 "view as your Seeker wallet"). Persisted in SecureStore so
// the MWA auth token survives relaunches and a second connect shows no dialog.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type WalletState = {
  viewedAddress: string | null;
  authToken: string | null;
  hydrated: boolean;
  setHydrated: () => void;
  setWallet: (address: string, authToken: string) => void;
  clear: () => void;
};

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      viewedAddress: null,
      authToken: null,
      hydrated: false,
      setHydrated: () => set({ hydrated: true }),
      setWallet: (viewedAddress, authToken) => set({ viewedAddress, authToken }),
      clear: () => set({ viewedAddress: null, authToken: null }),
    }),
    {
      name: 'mentioned.wallet',
      version: 1, // v0 stored the raw base64 address; drop anything older
      migrate: (state, version) => (version < 1 ? { viewedAddress: null, authToken: null } : (state as object)),
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ viewedAddress: s.viewedAddress, authToken: s.authToken }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated();
      },
    },
  ),
);
