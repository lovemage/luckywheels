import { describe, expect, it } from 'vitest';
import { pickSpread } from '../../../src/assistant/recommend.js';

// 候選池已依分數排序：r1 最高分
const pool = Array.from({ length: 10 }, (_, i) => ({ room: { id: `r${i + 1}` }, score: 100 - i }));
const ids = (xs: { room: { id: string } }[]) => xs.map((x) => x.room.id);

describe('pickSpread', () => {
  it('returns the whole pool, in score order, when it is not larger than count', () => {
    expect(ids(pickSpread(pool.slice(0, 3), 5, new Map()))).toEqual(['r1', 'r2', 'r3']);
  });

  it('picks count rooms from the pool and keeps score order', () => {
    const picked = pickSpread(pool, 4, new Map());
    expect(picked).toHaveLength(4);
    const order = picked.map((x) => pool.indexOf(x));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('spreads different requests over the pool', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) for (const id of ids(pickSpread(pool, 3, new Map()))) seen.add(id);
    expect(seen.size).toBeGreaterThan(6);
  });

  it('avoids recently recommended rooms while enough others remain', () => {
    const recent = new Map(['r1', 'r2', 'r3', 'r4', 'r5'].map((id, i) => [id, 1000 + i]));
    for (let i = 0; i < 20; i++) {
      expect(ids(pickSpread(pool, 5, recent)).sort()).toEqual(['r10', 'r6', 'r7', 'r8', 'r9']);
    }
  });

  it('falls back to the least recently recommended rooms when the pool runs short', () => {
    // r1 最久以前被推薦、r3 最近
    const recent = new Map([['r1', 1000], ['r2', 2000], ['r3', 3000]]);
    expect(ids(pickSpread(pool.slice(0, 4), 3, recent, () => 0))).toEqual(['r1', 'r2', 'r4']);
  });
});
