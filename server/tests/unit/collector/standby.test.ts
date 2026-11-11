import { describe, expect, it } from 'vitest';
import { parseStandbyMinutes, shouldStandBy } from '../../../src/collector/standby.js';

describe('parseStandbyMinutes', () => {
  it('accepts positive integers and floors decimals', () => {
    expect(parseStandbyMinutes('30')).toBe(30);
    expect(parseStandbyMinutes(' 45 ')).toBe(45);
    expect(parseStandbyMinutes('12.9')).toBe(12);
  });

  it('treats unset, zero, negative and garbage as disabled', () => {
    for (const raw of [undefined, '', '0', '-5', 'abc']) expect(parseStandbyMinutes(raw)).toBe(0);
  });
});

describe('shouldStandBy', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const none = new Set<string>();

  it('stands by while another collector succeeded within the window', () => {
    expect(shouldStandBy({ runId: 'a', at: new Date('2026-11-11T11:31:00Z') }, none, 30, now)).toBe(true);
  });

  it('takes over when the last success is too old or missing', () => {
    expect(shouldStandBy({ runId: 'a', at: new Date('2026-11-11T11:30:00Z') }, none, 30, now)).toBe(false);
    expect(shouldStandBy(null, none, 30, now)).toBe(false);
  });

  it('keeps collecting while the latest success is its own run', () => {
    expect(shouldStandBy({ runId: 'mine', at: new Date('2026-11-11T11:50:00Z') }, new Set(['mine']), 30, now)).toBe(false);
  });

  it('returns to standby once another collector succeeds again', () => {
    expect(shouldStandBy({ runId: 'primary', at: new Date('2026-11-11T11:55:00Z') }, new Set(['mine']), 30, now)).toBe(true);
  });
});
