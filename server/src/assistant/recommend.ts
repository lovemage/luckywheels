import { Prisma, type PrismaClient } from '@prisma/client';
import type { RoomView } from './rooms.js';
import type { RoomScore, ScoreMetric } from './scoring.js';
import { loadScoreBoard } from './board.js';
import { MAX_TARGET_MULTIPLIER, type FreshnessSettings, type RecommendSettings, type RecommendTier } from './settings.js';

export { MAX_TARGET_MULTIPLIER, readRecommendSettings, type RecommendSettings, type RecommendTier } from './settings.js';

// 本金推薦（計劃 M3 草案，2026-11-03／11-04 定案）。
// 輸入本金＋今日目標倍數 → 本金級距決定分數門檻與最高倍數 → 門檻 = 級距分數 +（倍數 − 1）× 每倍加分
// → 未逾時的空台、分數 ≥ 門檻 → 依分數取前 N 間，每間附 2–3 條由實際數據產生的理由。
// 措辭只能是「排序參考」，不得暗示中獎機率、預測或保證獲利（計劃 1.2）。

export const RECOMMEND_DISCLAIMER = '排序參考，不代表遊戲結果';

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });

export function tierFor(principal: number, tiers: RecommendTier[]): { tier: RecommendTier; label: string } {
  let i = 0;
  while (i + 1 < tiers.length && principal >= tiers[i + 1]!.minPrincipal) i++;
  const tier = tiers[i]!;
  const next = tiers[i + 1];
  let label: string;
  if (tiers.length === 1) label = '不限金額';
  else if (i === 0) label = `${fmt(next!.minPrincipal)} 以下`;
  else if (!next) label = `${fmt(tier.minPrincipal)} 以上`;
  else label = `${fmt(tier.minPrincipal)}–${fmt(next.minPrincipal - 1)}`;
  return { tier, label };
}

/** 門檻 = 級距分數 +（目標倍數 − 1）× 每倍加分（以 1 倍為基準；2026-11-04 定案） */
export const thresholdFor = (tier: RecommendTier, multiplier: number, step: number) =>
  tier.minScore + (multiplier - 1) * step;

const pct = (share: number) => Math.floor(share * 100);

/** 每間 2–3 條：貢獻最大且確實有利（百分位 ≥ 0.5）的兩個指標，加上「超過前兩次平均開出間隔」 */
export function buildReasons(room: RoomView, s: RoomScore): string[] {
  const candidates: { contribution: number; text: string }[] = [];
  const add = (m: ScoreMetric, text: (v: number, ms: RoomScore['metrics'][ScoreMetric]) => string | null) => {
    const ms = s.metrics[m];
    if (ms.value === null || ms.percentile === null || ms.percentile < 0.5) return;
    const t = text(ms.value, ms);
    if (t) candidates.push({ contribution: ms.contribution, text: t });
  };
  add('unopened', (v, ms) => `未開 ${fmt(v)} 轉，多於同遊戲 ${pct(ms.belowShare!)}% 的機台`);
  add('todayRtp', (v, ms) => `今日 RTP ${fmt(v)}%，低於同遊戲 ${pct(ms.aboveShare!)}% 的機台`);
  add('thirtyDayRtp', (v, ms) => `近 30 天 RTP ${fmt(v)}%，高於同遊戲 ${pct(ms.belowShare!)}% 的機台`);
  add('todayBet', (v, ms) => `今日下注 ${fmt(v)}，熱度前 ${pct(ms.aboveShare!) + 1}%`);

  const reasons = candidates
    .sort((a, b) => b.contribution - a.contribution)
    .slice(0, 2)
    .map((c) => c.text);

  const unopened = s.metrics.unopened.value;
  if (unopened !== null && room.prev1Spins !== null && room.prev2Spins !== null) {
    const avg = Math.round((room.prev1Spins + room.prev2Spins) / 2);
    if (avg > 0 && unopened > avg) reasons.push(`已超過前兩次平均開出間隔（${fmt(avg)} 轉）`);
  }
  return reasons.slice(0, 3);
}

export interface RecommendItem {
  room: RoomView;
  score: number;
  /** 未逾時空台中分數前 premiumPercent%（精品） */
  premium: boolean;
  reasons: string[];
}

export interface RecommendResult {
  tier: { label: string; minScore: number; maxMultiplier: number };
  threshold: number;
  items: RecommendItem[];
  /** 情境句：本金、目標、級距與門檻 */
  context: string;
  minBetAdvice: string;
  disclaimer: string;
}

export class MultiplierNotAllowedError extends Error {
  constructor(readonly maxMultiplier: number) {
    super(`multiplier exceeds tier maximum ${maxMultiplier}`);
  }
}

export async function recommend(
  prisma: PrismaClient,
  gameId: string,
  input: { principal: number; multiplier: number },
  now: Date,
  f: FreshnessSettings,
  settings: RecommendSettings,
): Promise<RecommendResult> {
  const { tier, label } = tierFor(input.principal, settings.tiers);
  if (input.multiplier > tier.maxMultiplier) throw new MultiplierNotAllowedError(tier.maxMultiplier);
  const threshold = thresholdFor(tier, input.multiplier, settings.multiplierStepScore);

  const board = await loadScoreBoard(prisma, gameId, now, f, settings.weights, settings.premiumPercent);
  // board 已依分數排序
  const idle = board.rooms.filter((x) => x.room.status === 'idle');

  const items = idle
    .filter((x) => x.score.score >= threshold)
    .slice(0, settings.count)
    .map((x) => ({
      room: x.room,
      score: x.score.score,
      premium: x.premium,
      reasons: buildReasons(x.room, x.score),
    }));

  return {
    tier: { label, minScore: tier.minScore, maxMultiplier: tier.maxMultiplier },
    threshold,
    items,
    context: `本金 ${fmt(input.principal)}、目標 ${input.multiplier} 倍，符合 ${label} 級距門檻 ${threshold} 分`,
    minBetAdvice: `建議單注 ${fmt(settings.minBetAdvice)} 元以上`,
    disclaimer: RECOMMEND_DISCLAIMER,
  };
}

export async function logRecommendation(
  prisma: PrismaClient,
  userId: string,
  gameId: string,
  input: { principal: number; multiplier: number },
  result: RecommendResult,
): Promise<void> {
  await prisma.recommendationLog.create({
    data: {
      userId,
      gameId,
      principal: input.principal,
      multiplier: input.multiplier,
      threshold: result.threshold,
      resultCount: result.items.length,
      results: result.items.map((i) => ({ roomId: i.room.id, roomNo: i.room.roomNo, score: i.score, reasons: i.reasons })) as Prisma.InputJsonValue,
    },
  });
}
