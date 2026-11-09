import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { endReasonFor, HIGH_SYMBOLS, hitRate, randomSymbols, ROOM_SIGNAL_SETS, roomSignalFor, roomSignalSets, seededRand, SIGNAL_SYMBOLS, strengthFor, topIdle } from '../../../src/assistant/signal.js';
import type { ScoreBoard } from '../../../src/assistant/board.js';
import type { SignalSettings } from '../../../src/assistant/settings.js';
import { planLabel } from '../../../src/assistant/pass.js';

const S: SignalSettings = { minScore: 70, rtpChangePoints: 5, maxPerRoom: 2, refreshCooldownSeconds: 30, strengthMin: 30, strengthMax: 90 };
const F = { listMaxAgeSeconds: 1800, detailMaxAgeSeconds: 10800 };
const now = new Date('2026-11-04T12:00:00Z');
const signal = { rtpAtIssue: new Prisma.Decimal('95.00'), unopenedAtIssue: 300, prev1AtIssue: 120 };
const room = (o: Record<string, unknown> = {}) => ({
  enabled: true,
  status: 'idle' as const,
  todayRtp: new Prisma.Decimal('96.00'),
  listCapturedAt: new Date(now.getTime() - 60_000),
  unopenedSpins: 320,
  prev1Spins: 120,
  ...o,
});

describe('randomSymbols', () => {
  it('picks 2–3 distinct game symbols with thresholds 3–6, at least one high symbol, hit rate 4–15%', () => {
    const high = HIGH_SYMBOLS as readonly string[];
    for (let i = 0; i < 300; i++) {
      const s = randomSymbols();
      expect(s.length).toBeGreaterThanOrEqual(2);
      expect(s.length).toBeLessThanOrEqual(3);
      expect(new Set(s.map((x) => x.symbol)).size).toBe(s.length);
      expect(s.some((x) => high.includes(x.symbol))).toBe(true);
      expect(hitRate(s)).toBeGreaterThanOrEqual(0.04);
      expect(hitRate(s)).toBeLessThanOrEqual(0.15);
      for (const x of s) {
        expect(SIGNAL_SYMBOLS).toContain(x.symbol);
        expect(x.count).toBeGreaterThanOrEqual(3);
        expect(x.count).toBeLessThanOrEqual(6);
      }
      // 依固定順序（高分符號在前）
      const order = s.map((x) => SIGNAL_SYMBOLS.indexOf(x.symbol));
      expect([...order].sort((a, b) => a - b)).toEqual(order);
    }
  });
});

describe('roomSignalFor', () => {
  const room = { id: 'room-459', prev1Spins: 120 };
  it('is stable for the same room, free-game state and Taipei day', () => {
    const a = roomSignalFor(room, new Date('2026-11-09T02:00:00Z'));
    const b = roomSignalFor(room, new Date('2026-11-09T15:00:00Z')); // 台北 23:00，同一天
    expect(b).toEqual(a);
  });
  it('changes after a free game (prev1 changes) or on the next Taipei day', () => {
    const a = roomSignalFor(room, new Date('2026-11-09T02:00:00Z'));
    expect(roomSignalFor({ ...room, prev1Spins: 88 }, new Date('2026-11-09T02:00:00Z')).key).not.toBe(a.key);
    expect(roomSignalFor(room, new Date('2026-11-09T16:30:00Z')).key).not.toBe(a.key); // 台北隔天 00:30
  });
  it('has a fixed series of sets per room and day; set 1 keeps the pre-series seed', () => {
    const at = new Date('2026-11-09T02:00:00Z');
    const sets = roomSignalSets(room, at);
    expect(sets).toHaveLength(ROOM_SIGNAL_SETS);
    expect(sets[0]).toEqual(roomSignalFor(room, at));
    expect(new Set(sets.map((x) => x.key)).size).toBe(ROOM_SIGNAL_SETS);
    expect(roomSignalSets(room, new Date('2026-11-09T10:00:00Z'))).toEqual(sets);
    // 自然開出免遊（prev1 變）或隔天：整串換新
    expect(roomSignalSets({ ...room, prev1Spins: 88 }, at)[2]!.key).not.toBe(sets[2]!.key);
  });
  it('seededRand stays within bounds', () => {
    const r = seededRand('x');
    for (let i = 0; i < 1000; i++) {
      const v = r(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThan(7);
    }
  });
});

describe('topIdle', () => {
  const r = (id: string, roomNo: string, status: string, score: number) =>
    ({ room: { id, roomNo, status }, score: { score }, premium: false }) as unknown as ScoreBoard['rooms'][number];
  it('matches the home TOP 5: idle only, display score desc, then room number', () => {
    const board = {
      rooms: [r('a', '010', 'idle', 90), r('b', '002', 'busy', 85), r('c', '003', 'idle', 80), r('d', '004', 'idle', 75),
        r('e', '005', 'idle', 70), r('f', '006', 'idle', 65), r('g', '007', 'idle', 60)],
      map: new Map(),
    } as ScoreBoard;
    const ids = topIdle(board).map((x) => x.room.id);
    expect(ids).toHaveLength(5);
    expect(ids).not.toContain('b');
    expect(ids).not.toContain('g');
  });
  it('ties on the display score (raw 93+ all show 98) fall back to room number, like the home list', () => {
    const board = { rooms: [r('a', '010', 'idle', 99), r('b', '003', 'idle', 94)], map: new Map() } as ScoreBoard;
    expect(topIdle(board).map((x) => x.room.id)).toEqual(['b', 'a']);
  });
});

describe('strengthFor', () => {
  it('maps score 0–100 onto the configured range', () => {
    expect(strengthFor(0, S)).toBe(30);
    expect(strengthFor(100, S)).toBe(90);
    expect(strengthFor(80, S)).toBe(78);
  });
});

describe('endReasonFor', () => {
  it('keeps the signal while the room is still idle and unchanged', () => {
    expect(endReasonFor(signal, room(), now, F, S)).toBeNull();
  });

  it('ends when the room is gone, disabled or stale', () => {
    expect(endReasonFor(signal, null, now, F, S)).toBe('room_unavailable');
    expect(endReasonFor(signal, room({ enabled: false }), now, F, S)).toBe('room_unavailable');
    expect(endReasonFor(signal, room({ listCapturedAt: new Date(now.getTime() - 3_600_000) }), now, F, S)).toBe('data_stale');
  });

  it('ends when the room was taken', () => {
    expect(endReasonFor(signal, room({ status: 'busy' }), now, F, S)).toBe('room_unavailable');
    expect(endReasonFor(signal, room({ status: 'locked' }), now, F, S)).toBe('room_unavailable');
  });

  it('detects a free-game round from the spin counters', () => {
    expect(endReasonFor(signal, room({ unopenedSpins: 12 }), now, F, S)).toBe('bonus_detected');
    expect(endReasonFor(signal, room({ prev1Spins: 333 }), now, F, S)).toBe('bonus_detected');
    // 細項還沒更新到（null）不判定
    expect(endReasonFor(signal, room({ unopenedSpins: null, prev1Spins: null }), now, F, S)).toBeNull();
  });

  it('ends when today RTP moved by the threshold', () => {
    expect(endReasonFor(signal, room({ todayRtp: new Prisma.Decimal('99.99') }), now, F, S)).toBeNull();
    expect(endReasonFor(signal, room({ todayRtp: new Prisma.Decimal('100.00') }), now, F, S)).toBe('rtp_changed');
    expect(endReasonFor(signal, room({ todayRtp: new Prisma.Decimal('90.00') }), now, F, S)).toBe('rtp_changed');
  });
});

describe('planLabel', () => {
  it('builds the copy from the plan values', () => {
    expect(planLabel({ points: 1, hours: 3 })).toBe('1 點積分兌換 3 小時');
    expect(planLabel({ points: 3, hours: 24 })).toBe('3 點積分兌換 24 小時（1 天）');
    expect(planLabel({ points: 5, hours: 72 })).toBe('5 點積分兌換 72 小時（3 天）');
  });
});
