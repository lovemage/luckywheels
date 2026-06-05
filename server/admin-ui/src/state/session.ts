import { createStore } from 'zustand/vanilla';
import { useSyncExternalStore } from 'react';

interface SessionStore {
  expiredVisible: boolean;
  setExpired(): void;
  dismissExpired(): void;
}

const store = createStore<SessionStore>((set) => ({
  expiredVisible: false,
  setExpired: () => set({ expiredVisible: true }),
  dismissExpired: () => set({ expiredVisible: false }),
}));

export function useSession() {
  const expiredVisible = useSyncExternalStore(store.subscribe, () => store.getState().expiredVisible);
  return {
    expiredVisible,
    setExpired: store.getState().setExpired,
    dismissExpired: store.getState().dismissExpired,
  };
}

export const sessionStore = store;
