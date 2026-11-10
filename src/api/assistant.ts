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
  /** 後台可改的顯示文字 */
  display?: { brandName: string; topTitle: string };
  /** 積分兌換／用積分開通的開關與關閉時提示（後台可改） */
  exchange?: { enabled: boolean; closedMessage: string };
  serverTime: string;
  /** 前端加上：收到回應時的本機時間（ms），用來換算伺服器與本機的時間差 */
  receivedAt?: number;
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
  /** 未開通的預覽：房號已在伺服器端遮蔽 */
  masked?: boolean;
  serverTime: string;
}

export interface RecommendTier {
  minPrincipal: number;
  minScore: number;
  maxMultiplier: number;
  label: string;
  /** 各倍數的門檻（顯示分數）；索引 0 為 1 倍 */
  thresholds: number[];
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
  /** 分數未達門檻、因符合門檻的機台不足而補上 */
  belowThreshold: boolean;
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

/** 未開通也能看的精選空台預覽（房號遮蔽） */
export const fetchTeaserRooms = () => api<RoomsResponse>('/api/assistant/rooms/teaser');

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

// ── 訊號 ──
/** 戰神賽特 II 的盤面符號（server/src/assistant/signal.ts SIGNAL_SYMBOLS；scarab＝甲蟲、scarab_color＝彩甲） */
export type SignalSymbol =
  | 'eye'
  | 'cobra'
  | 'bow'
  | 'sickle'
  | 'scarab'
  | 'scarab_color'
  | 'gem_yellow'
  | 'gem_red'
  | 'gem_purple'
  | 'gem_blue'
  | 'gem_green';

export interface SignalView {
  id: string;
  /** 符號與盤面數量 */
  symbols: { symbol: SignalSymbol; count: number }[];
  /** 強度 %，由綁定機台的綜合分數換算 */
  strength: number;
  issuedAt: string;
}

export interface SignalResponse {
  game: { code: string; name: string };
  signal: SignalView | null;
  /** 這次讀取時自動換掉了舊訊號 */
  replaced: { reason: string; message: string } | null;
  /** 沒有可用訊號時的說明 */
  message: string | null;
  disclaimer: string;
  serverTime: string;
}

export const fetchSignal = () => api<SignalResponse>('/api/assistant/signal');

/** 「免遊結束，換一組」；冷卻中回 429 SIGNAL_REFRESH_COOLDOWN */
