// What the phone remembers so a moment happens once: the wins already
// celebrated, and where the player stood on the weekly board last time they
// looked. Per wallet, so a second account on the same phone starts fresh.
// Persisted the way `prefs.ts` is; the rules live in `src/markets/moments.ts`.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { Standing } from '@/markets/moments';

type MomentsState = {
  /** Market keys already celebrated, per wallet. Absent: never seen here. */
  celebrated: Record<string, string[]>;
  standing: Record<string, Standing>;
  hydrated: boolean;
  setCelebrated: (wallet: string, keys: string[]) => void;
  setStanding: (wallet: string, standing: Standing) => void;
  setHydrated: () => void;
};

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useMoments = create<MomentsState>()(
  persist(
    (set) => ({
      celebrated: {},
      standing: {},
      hydrated: false,
      setCelebrated: (wallet, keys) => set((s) => ({ celebrated: { ...s.celebrated, [wallet]: keys } })),
      setStanding: (wallet, standing) => set((s) => ({ standing: { ...s.standing, [wallet]: standing } })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'mentioned.moments',
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ celebrated: s.celebrated, standing: s.standing }),
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);
