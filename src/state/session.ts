import { createStore } from 'zustand/vanilla';

export type Phase = 'loading' | 'anonymous' | 'onboarding' | 'ready' | 'blacklisted';

export interface MeProfile {
  id: string;
  lineUserId: string;
  displayName: string;
  pictureUrl: string | null;
  vipLevel: number;
  points: number;
  accountType: 'verified' | 'test' | 'blacklisted';
  nickname: string | null;
  entertainmentMemberCode: string | null;
  lifetimeDrawCount: number;
}

interface SessionState {
  phase: Phase;
  me: MeProfile | null;
  setLoading(): void;
  setAnonymous(): void;
  setMe(me: MeProfile): void;
}

function derivePhase(me: MeProfile): Phase {
  if (me.accountType === 'blacklisted') return 'blacklisted';
  if (!me.nickname || !me.entertainmentMemberCode) return 'onboarding';
  return 'ready';
}

const store = createStore<SessionState>((set) => ({
  phase: 'loading',
  me: null,
  setLoading: () => set({ phase: 'loading' }),
  setAnonymous: () => set({ phase: 'anonymous', me: null }),
  setMe: (me) => set({ phase: derivePhase(me), me }),
}));

export const sessionStore = store;
