// What this phone remembers about chat: the players hidden from it, and the
// newest global message read, for the unread dot on Home. Persisted the way
// `prefs.ts` is. Hiding is local by design: it is the "block" a store asks a
// chat app to offer, and nobody else's view of the room changes.
import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

type ChatState = {
  hidden: string[];
  /** Newest global message id seen. Null until the first check, which only records it. */
  lastSeenGlobal: number | null;
  hide: (wallet: string) => void;
  unhideAll: () => void;
  seeGlobal: (id: number) => void;
};

const secureStorage = {
  getItem: (name: string) => SecureStore.getItemAsync(name),
  setItem: (name: string, value: string) => SecureStore.setItemAsync(name, value),
  removeItem: (name: string) => SecureStore.deleteItemAsync(name),
};

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      hidden: [],
      lastSeenGlobal: null,
      hide: (wallet) => set((s) => (s.hidden.includes(wallet) ? s : { hidden: [...s.hidden, wallet] })),
      unhideAll: () => set({ hidden: [] }),
      seeGlobal: (id) => set((s) => (s.lastSeenGlobal !== null && s.lastSeenGlobal >= id ? s : { lastSeenGlobal: id })),
    }),
    { name: 'mentioned.chat', storage: createJSONStorage(() => secureStorage) },
  ),
);
