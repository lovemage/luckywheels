import { describe, expect, it } from 'vitest';
import { DEFAULT_SCORE_WEIGHTS, normalizeWeights, scoreRooms, type ScoreInput } from '../../../src/assistant/scoring.js';
import { buildReasons, thresholdFor, tierFor, type RecommendTier } from '../../../src/assistant/recommend.js';
import type { RoomView } from '../../../src/assistant/rooms.js';

const room = (id: string, unopened: number | null, todayRtp: number | null, thirtyDayRtp: number | null, todayBet: number | null): ScoreInput => ({
  id,
  values: { unopened, todayRtp, thirtyDayRtp, todayBet },
});

const TIERS: RecommendTier[] = [
  { minPrincipal: 0, minScore: 60, maxMultiplier: 2 },
  { minPrincipal: 5000, minScore: 70, maxMultiplier: 3 },
  { minPrincipal: 10000, minScore: 80, maxMultiplier: 5 },
];

describe('scoreRooms', () => {
  it('gives 100 to a room that is best on every metric and 0 to the worst', () => {
    const s = scoreRooms(
      [room('best', 900, 50, 99, 9000), room('mid', 500, 90, 97, 5000), room('worst', 10, 300, 90, 100)],
      DEFAULT_SCORE_WEIGHTS,
    );
    expect(s.get('best')!.score).toBe(100);
    expect(s.get('mid')!.score).toBe(50);
    expect(s.get('worst')!.score).toBe(0);
  });

  it('uses ranks, so an extreme today RTP does not dominate', () => {
    const a = scoreRooms([room('a', 1, 1379.58, 1, 1), room('b', 2, 100, 2, 2)], DEFAULT_SCORE_WEIGHTS);
    const b = scoreRooms([room('a', 1, 101, 1, 1), room('b', 2, 100, 2, 2)], DEFAULT_SCORE_WEIGHTS);
    expect(a.get('b')!.score).toBe(b.get('b')!.score);
  });

  it('counts missing values as 0.5 and marks them without a percentile', () => {
    const s = scoreRooms([room('a', null, 100, null, null), room('b', null, 200, null, null)], DEFAULT_SCORE_WEIGHTS);
    // todayRtp：a 較低 → 1；其他三項各 0.5 → 0.25×1 + 0.75×0.5 = 0.625
    expect(s.get('a')!.score).toBe(63);
    expect(s.get('a')!.metrics.unopened.percentile).toBeNull();
  });

  it('averages ranks for ties and reports below/above shares', () => {
    const s = scoreRooms([room('a', 10, 1, 1, 1), room('b', 10, 1, 1, 1), room('c', 20, 1, 1, 1), room('d', 5, 1, 1, 1)], DEFAULT_SCORE_WEIGHTS);
    expect(s.get('a')!.metrics.unopened.percentile).toBeCloseTo(0.5);
    expect(s.get('c')!.metrics.unopened).toMatchObject({ percentile: 1, belowShare: 0.75, aboveShare: 0 });
  });

  it('normalizes weights and falls back to defaults when all are zero', () => {
    expect(normalizeWeights({ unopened: 1, todayRtp: 1, thirtyDayRtp: 1, todayBet: 1 }).unopened).toBe(0.25);
    expect(normalizeWeights({ unopened: 0, todayRtp: 0, thirtyDayRtp: 0, todayBet: 0 }).unopened).toBeCloseTo(0.35);
  });
});

describe('tiers and threshold', () => {
  it('picks the tier by principal with readable labels', () => {
    expect(tierFor(4999, TIERS)).toMatchObject({ tier: { minScore: 60 }, label: '5,000 以下' });
    expect(tierFor(5000, TIERS)).toMatchObject({ tier: { minScore: 70 }, label: '5,000–9,999' });
    expect(tierFor(100000, TIERS)).toMatchObject({ tier: { minScore: 80 }, label: '10,000 以上' });
  });

  it('adds the step score for every multiplier above 1x (2026-11-04)', () => {
    expect(thresholdFor(TIERS[1]!, 3, 3)).toBe(76); // 本金 8,000 選 3 倍
    expect(thresholdFor(TIERS[0]!, 1, 3)).toBe(60);
    expect(thresholdFor(TIERS[2]!, 5, 3)).toBe(92);
  });
});

describe('buildReasons', () => {
  const view = (o: Partial<RoomView>): RoomView => ({
    id: 'x', roomNo: '001', status: 'idle', todayRtp: '80.00', listCapturedAt: null, stale: false,
    unopenedSpins: 900, prev1Spins: 300, prev2Spins: 500, todayBet: '9000.00', thirtyDayBet: null,
    thirtyDayRtp: '99.00', detailCapturedAt: null, detailStale: false, ...o,
  });

  it('returns the two strongest favourable metrics plus the interval reason', () => {
    const s = scoreRooms(
      [room('x', 900, 80, 99, 9000), room('y', 100, 120, 95, 100), room('z', 50, 150, 90, 50)],
      DEFAULT_SCORE_WEIGHTS,
    );
    const reasons = buildReasons(view({}), s.get('x')!);
    expect(reasons).toEqual([
      '未開 900 轉，多於同遊戲 66% 的機台',
      '今日 RTP 80%，低於同遊戲 66% 的機台',
      '已超過前兩次平均開出間隔（400 轉）',
    ]);
  });

  it('does not invent reasons from missing or unfavourable data', () => {
    const s = scoreRooms([room('x', null, 300, null, null), room('y', null, 100, null, null)], DEFAULT_SCORE_WEIGHTS);
    expect(buildReasons(view({ unopenedSpins: null }), s.get('x')!)).toEqual([]);
  });
});
