// 綜合分數（計劃 M3 草案，2026-11-03 定案）。純函式，不碰 DB。
//
// - 只計算同一遊戲、列表層未逾時的房間（呼叫端負責篩選）
// - 每個指標換成「在這群房間中的百分位」（0–1，mid-rank），避免極端值（例：今日 RTP 1379%）拉高分數
// - 缺值（細項還沒抓到或已逾時）以 0.5 計，且不產生推薦理由
// - 分數 = round(100 × Σ 權重 × 百分位)，權重自動正規化（後台可調 assistantScoreWeights）

export const SCORE_METRICS = ['unopened', 'todayRtp', 'thirtyDayRtp', 'todayBet'] as const;
export type ScoreMetric = (typeof SCORE_METRICS)[number];

export type ScoreWeights = Record<ScoreMetric, number>;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = { unopened: 35, todayRtp: 25, thirtyDayRtp: 20, todayBet: 20 };

/** 指標方向：true＝數值越高越好；false＝越低越好（今日 RTP 偏低） */
const HIGHER_IS_BETTER: Record<ScoreMetric, boolean> = {
  unopened: true,
  todayRtp: false,
  thirtyDayRtp: true,
  todayBet: true,
};

export interface ScoreInput {
  id: string;
  values: Record<ScoreMetric, number | null>;
}

export interface MetricScore {
  value: number | null;
  /** 方向調整後的百分位（0–1；越高越有利）。缺值時為 null（計分時以 0.5 計） */
  percentile: number | null;
  /** 嚴格小於此值的房間比例（0–1）；缺值時為 null */
  belowShare: number | null;
  /** 嚴格大於此值的房間比例（0–1）；缺值時為 null */
  aboveShare: number | null;
  /** 正規化權重 × 百分位（缺值用 0.5） */
  contribution: number;
}

export interface RoomScore {
  score: number;
  metrics: Record<ScoreMetric, MetricScore>;
}

class Ranker {
  private readonly sorted: number[];
  constructor(values: (number | null)[]) {
    this.sorted = values.filter((v): v is number => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
  }
  get size() {
    return this.sorted.length;
  }
  /** 第一個 >= v 的位置 */
  private lower(v: number) {
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid]! < v) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  /** 第一個 > v 的位置 */
  private upper(v: number) {
    let lo = 0, hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.sorted[mid]! <= v) lo = mid + 1; else hi = mid;
    }
    return lo;
  }
  stats(v: number) {
    const n = this.sorted.length;
    const less = this.lower(v);
    const equal = this.upper(v) - less;
    const greater = n - less - equal;
    // mid-rank 百分位：最小值 0、最大值 1，同值取平均名次；只有一筆時為 0.5
    const percentile = n <= 1 ? 0.5 : (less + (equal - 1) / 2) / (n - 1);
    return { percentile, belowShare: less / n, aboveShare: greater / n };
  }
}

export function normalizeWeights(w: ScoreWeights): ScoreWeights {
  const total = SCORE_METRICS.reduce((s, m) => s + Math.max(0, w[m]), 0);
  if (!(total > 0)) return normalizeWeights(DEFAULT_SCORE_WEIGHTS);
  return Object.fromEntries(SCORE_METRICS.map((m) => [m, Math.max(0, w[m]) / total])) as ScoreWeights;
}

export function scoreRooms(rooms: ScoreInput[], weights: ScoreWeights): Map<string, RoomScore> {
  const w = normalizeWeights(weights);
  const rankers = Object.fromEntries(
    SCORE_METRICS.map((m) => [m, new Ranker(rooms.map((r) => r.values[m]))]),
  ) as Record<ScoreMetric, Ranker>;

  const out = new Map<string, RoomScore>();
  for (const room of rooms) {
    let total = 0;
    const metrics = {} as Record<ScoreMetric, MetricScore>;
    for (const m of SCORE_METRICS) {
      const value = room.values[m];
      if (value === null || !Number.isFinite(value)) {
        metrics[m] = { value: null, percentile: null, belowShare: null, aboveShare: null, contribution: w[m] * 0.5 };
      } else {
        const s = rankers[m].stats(value);
        const percentile = HIGHER_IS_BETTER[m] ? s.percentile : 1 - s.percentile;
        metrics[m] = { value, percentile, belowShare: s.belowShare, aboveShare: s.aboveShare, contribution: w[m] * percentile };
      }
      total += metrics[m].contribution;
    }
    out.set(room.id, { score: Math.round(100 * total), metrics });
  }
  return out;
}
