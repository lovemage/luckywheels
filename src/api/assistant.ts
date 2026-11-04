import { api } from './client.js';

// 數據助手會員端 API（server/src/routes/assistant.ts）

export interface TimePlan {
  points: number;
  hours: number;
  /** 後端依方案產生的說明文字，例：「3 點積分兌換 24 小時（1 天）」 */
  label: string;
}

export interface AssistantPass {
  active: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  remainingSeconds: number;
}

export interface AssistantMe {
  points: number;
  pass: AssistantPass;
  plans: TimePlan[];
  serverTime: string;
}

export interface GameView {
  id: string;
  code: string;
  name: string;
  provider: { code: string; name: string };
  roomCount: number;
  updatedAt: string | null;
  stale: boolean;
}

export interface RoomView {
  id: string;
  roomNo: string;
  status: 'idle' | 'busy' | 'locked' | null;
  todayRtp: string | null;
  listCapturedAt: string | null;
  stale: boolean;
  unopenedSpins: number | null;
  prev1Spins: number | null;
  prev2Spins: number | null;
  todayBet: string | null;
  thirtyDayBet: string | null;
  thirtyDayRtp: string | null;
  detailCapturedAt: string | null;
  detailStale: boolean;
}

export interface ScoredRoom extends RoomView {
  score: number | null;
  premium: boolean;
}

export interface RoomsResponse {
  game: GameView;
  items: ScoredRoom[];
  total: number;
  serverTime: string;
}

export interface RecommendTier {
  minPrincipal: number;
  minScore: number;
  maxMultiplier: number;
  label: string;
}

export interface RecommendConfig {
  tiers: RecommendTier[];
  multiplierStepScore: number;
  maxMultiplier: number;
  count: number;
  minBetAdvice: string;
  disclaimer: string;
}

export interface RecommendItem {
  room: RoomView;
  score: number;
  premium: boolean;
  reasons: string[];
}

export interface RecommendResponse {
  game: GameView;
  input: { principal: number; multiplier: number };
  tier: { label: string; minScore: number; maxMultiplier: number };
  threshold: number;
  items: RecommendItem[];
  context: string;
  minBetAdvice: string;
  disclaimer: string;
  serverTime: string;
}

export interface ExchangeRecord {
  id: string;
  kind: 'points_to_time' | 'admin_adjust';
  pointsSpent: number;
  pointsBefore: number;
  pointsAfter: number;
  hours: number;
  expiresBefore: string | null;
  expiresAfter: string;
  note: string | null;
  createdAt: string;
}

export interface ExchangeResponse {
  exchange: ExchangeRecord;
  replayed: boolean;
  points: number;
  pass: AssistantPass;
}

export const fetchAssistantMe = () => api<AssistantMe>('/api/assistant/me');

export const fetchTopRooms = (pageSize = 5) =>
  api<RoomsResponse>(`/api/assistant/rooms?sort=score&status=idle&pageSize=${pageSize}`);

export const fetchRecommendConfig = () => api<RecommendConfig>('/api/assistant/recommend/config');

export const postRecommend = (principal: number, multiplier: number) =>
  api<RecommendResponse>('/api/assistant/recommend', {
    method: 'POST',
    body: JSON.stringify({ principal, multiplier }),
  });

export const postExchange = (plan: TimePlan, idempotencyKey: string) =>
  api<ExchangeResponse>('/api/assistant/exchange', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify({ points: plan.points, expectedHours: plan.hours }),
  });

export const fetchExchanges = () => api<{ items: ExchangeRecord[] }>('/api/assistant/exchanges');
