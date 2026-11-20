import { describe, expect, it } from 'vitest';
import { inMidnightGuard, MIDNIGHT_GUARD_MINUTES, taipeiDayStart } from '../../../src/assistant/board.js';

describe('taipeiDayStart', () => {
  it('台北 00:00 = 前一天 UTC 16:00', () => {
    expect(taipeiDayStart(new Date('2026-11-20T03:00:00Z')).toISOString()).toBe('2026-11-19T16:00:00.000Z');
  });
  it('UTC 已換日但台北還沒（不會發生）／台北已換日但 UTC 還沒', () => {
    // 台北 2026-11-21 00:10 = UTC 2026-11-20 16:10
    expect(taipeiDayStart(new Date('2026-11-20T16:10:00Z')).toISOString()).toBe('2026-11-20T16:00:00.000Z');
    // 台北 2026-11-20 23:59 = UTC 2026-11-20 15:59
    expect(taipeiDayStart(new Date('2026-11-20T15:59:00Z')).toISOString()).toBe('2026-11-19T16:00:00.000Z');
  });
});

describe('inMidnightGuard', () => {
  it(`台北 00:00 起 ${MIDNIGHT_GUARD_MINUTES} 分鐘內為保護時段`, () => {
    expect(inMidnightGuard(new Date('2026-11-20T16:00:00Z'))).toBe(true); // 00:00
    expect(inMidnightGuard(new Date('2026-11-20T16:29:59Z'))).toBe(true); // 00:29:59
    expect(inMidnightGuard(new Date('2026-11-20T16:30:00Z'))).toBe(false); // 00:30
    expect(inMidnightGuard(new Date('2026-11-20T15:59:59Z'))).toBe(false); // 23:59:59
  });
});
