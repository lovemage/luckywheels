import { useSyncExternalStore } from 'react';
import { sessionStore } from '../state/session.js';

export function useSession() {
  return useSyncExternalStore(sessionStore.subscribe, () => sessionStore.getState());
}
