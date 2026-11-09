import { api } from './client.js';

// 數據助手：推薦與訊號設定（assistant 權限）、兌換管理與會員使用期限（exchange 權限）

export type ScoreMetric = 'unopened' | 'todayRtp' | 'thirtyDayRtp' | 'todayBet';

export interface RecommendTier {
  minPrincipal: number;
  minScore: number;
  maxMultiplier: number;
}

export interface AssistantSettings {
  recommend: {
    weights: Record<ScoreMetric, number>;
    tiers: RecommendTier[];
    multiplierStepScore: number;
    count: number;
    minBetAdvice: number;
    premiumPercent: number;
    poolSize: number;
    avoidMinutes: number;
  };
  freshness: { listMaxAgeSeconds: number; detailMaxAgeSeconds: number };
  display: { brandName: string; topTitle: string };
  signal: {
    minScore: number;
    rtpChangePoints: number;
    maxPerRoom: number;
    refreshCooldownSeconds: number;
    strengthMin: number;
    strengthMax: number;
  };
}

export type SignalEndReason = 'member_refresh' | 'bonus_detected' | 'rtp_changed' | 'room_unavailable' | 'data_stale' | 'left_top' | 'day_changed';

export interface AdminSignal {
  id: string;
  userId: string;
  userName: string | null;
  roomNo: string;
  /** 2026-11-09 起為 { symbol, count }；之前的舊訊號為 { symbol, multiplier } */
  symbols: { symbol: string; count?: number; multiplier?: number }[];
  strength: number;
  scoreAtIssue: number;
  rtpAtIssue: string;
  issuedAt: string;
  endedAt: string | null;
  endReason: SignalEndReason | null;
}

export interface TimePlan {
  points: number;
  hours: number;
  label: string;
}

export interface ExchangeRecord {
  id: string;
  kind: 'points_to_time' | 'admin_adjust';
  pointsSpent: number;
  pointsBefore: number | null;
  pointsAfter: number | null;
  hours: number;
  expiresBefore: string | null;
  expiresAfter: string;
  note: string | null;
  createdAt: string;
  userId: string;
  userName: string | null;
  adminAccount: string | null;
}

export interface PassView {
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
}

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

export const fetchAssistantSettings = (): Promise<AssistantSettings> => api('/api/admin/assistant/settings');
export const updateAssistantSettings = (body: AssistantSettings): Promise<AssistantSettings> =>
  api('/api/admin/assistant/settings', json('PUT', body));

export const fetchSignals = (take = 50): Promise<{ items: AdminSignal[] }> => api(`/api/admin/assistant/signals?take=${take}`);

export interface ExchangeAccess {
  enabled: boolean;
  closedMessage: string;
}

export const fetchExchangeAccess = (): Promise<ExchangeAccess> => api('/api/admin/assistant/exchange/access');
export const updateExchangeAccess = (body: ExchangeAccess): Promise<ExchangeAccess> =>
  api('/api/admin/assistant/exchange/access', json('PUT', body));

export const fetchTimePlans = (): Promise<{ plans: TimePlan[] }> => api('/api/admin/assistant/exchange/plans');
export const updateTimePlans = (plans: { points: number; hours: number }[]): Promise<{ plans: TimePlan[] }> =>
  api('/api/admin/assistant/exchange/plans', json('PUT', { plans }));

export const fetchExchangeRecords = (opts: { userId?: string; take?: number } = {}): Promise<{ items: ExchangeRecord[] }> => {
  const q = new URLSearchParams({ take: String(opts.take ?? 50) });
  if (opts.userId) q.set('userId', opts.userId);
  return api(`/api/admin/assistant/exchange/records?${q}`);
};

export const fetchMemberPass = (userId: string): Promise<{ pass: PassView }> => api(`/api/admin/assistant/members/${userId}/pass`);
export const adjustMemberPass = (userId: string, body: { hours: number; note?: string }): Promise<{ pass: PassView }> =>
  api(`/api/admin/assistant/members/${userId}/pass-adjust`, json('POST', body));
