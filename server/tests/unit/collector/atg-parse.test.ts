import { describe, expect, it } from 'vitest';
import {
  pageOfRoomNo,
  parseAmount,
  parseDetail,
  parseListItems,
  parsePercent,
  statusFromIcon,
} from '../../../src/collector/atg/parse.js';

// 範例值取自 docs/plans/2026-11-02-atg-recon-report.md
describe('atg parse', () => {
  it('maps status icons', () => {
    expect(statusFromIcon('machinel_icon')).toBe('idle');
    expect(statusFromIcon('other_icon')).toBe('busy');
    expect(statusFromIcon('otherLock_icon')).toBe('locked');
    expect(statusFromIcon('unknown')).toBeNull();
    expect(statusFromIcon(null)).toBeNull();
  });

  it('parses percents and amounts', () => {
    expect(parsePercent('114.44%')).toBe('114.44');
    expect(parsePercent(' 92.3 % ')).toBe('92.30');
    expect(parsePercent('1,379.58%')).toBe('1379.58');
    expect(parsePercent('待確認')).toBeNull();
    expect(parseAmount('279,185.00')).toBe('279185.00');
    expect(parseAmount('132,214,952.99')).toBe('132214952.99');
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('12a')).toBeNull();
    expect(parsePercent('abc%')).toBeNull();
  });

  it('keeps amounts beyond 2^53 exact (string arithmetic, no floats)', () => {
    expect(parseAmount('9,999,999,999,999,999.99')).toBe('9999999999999999.99');
    expect(parseAmount('132,214,952.9')).toBe('132214952.90');
    expect(parseAmount('007')).toBe('7.00');
    expect(parsePercent('96.256%')).toBe('96.25');
  });

  it('parses list items and reports incomplete ones', () => {
    const { rooms, skipped } = parseListItems([
      { roomNo: '1001', rate: '92.31%', roomId: '306110', icon: 'machinel_icon' },
      { roomNo: '001', rate: '101.00%', roomId: '305110', icon: 'otherLock_icon' },
      { roomNo: '1002', rate: '', roomId: '306111', icon: 'other_icon' },
    ]);
    expect(rooms).toEqual([
      { roomNo: '1001', sourceRoomId: '306110', status: 'idle', todayRtp: '92.31' },
      { roomNo: '001', sourceRoomId: '305110', status: 'locked', todayRtp: '101.00' },
    ]);
    expect(skipped).toHaveLength(1);
  });

  it('computes the page of a room number', () => {
    expect(pageOfRoomNo('001')).toBe(1);
    expect(pageOfRoomNo('500')).toBe(1);
    expect(pageOfRoomNo('1001')).toBe(3);
    expect(pageOfRoomNo('2501')).toBe(6);
  });

  it('parses the detail panel (node paths captured 2026-11-02)', () => {
    const detail = parseDetail([
      { path: 'content/rowContent/row2/notOpenContent/title', text: '未開' },
      { path: 'content/rowContent/row2/notOpenContent/number', text: '109' },
      { path: 'content/rowContent/row2/previousOneContent/title', text: '前一' },
      { path: 'content/rowContent/row2/previousOneContent/number', text: '2' },
      { path: 'content/rowContent/row2/previousTwoContent/title', text: '前二' },
      { path: 'content/rowContent/row2/previousTwoContent/number', text: '4' },
      { path: 'content/infoRow/slotTableBlock/slotTableNumber', text: '1001' },
      { path: 'content/infoRow/table/scoreCol/hourMask/hour', text: '231,384.80' },
      { path: 'content/infoRow/table/scoreCol/dayMask/day', text: '132,214,952.99' },
      { path: 'content/infoRow/table/rateCol/hourMask/hour', text: '92.31%' },
      { path: 'content/infoRow/table/rateCol/dayMask/day', text: '94.45%' },
    ]);
    expect(detail).toEqual({
      roomNo: '1001',
      unopenedSpins: 109,
      prev1Spins: 2,
      prev2Spins: 4,
      todayBet: '231384.80',
      thirtyDayBet: '132214952.99',
      todayRtp: '92.31',
      thirtyDayRtp: '94.45',
    });
  });

  it('falls back to sibling numbers when prev nodes are renamed', () => {
    const detail = parseDetail([
      { path: 'p/slotTableNumber', text: '1001' },
      { path: 'p/prev/a/title', text: '前一' },
      { path: 'p/prev/a/n', text: '2' },
    ]);
    expect(detail?.prev1Spins).toBe(2);
  });

  it('parses prev spins written inline', () => {
    const detail = parseDetail([
      { path: 'p/slotTableNumber', text: '2815' },
      { path: 'p/a', text: '前一 17 轉開' },
      { path: 'p/b', text: '前二 63 轉開' },
    ]);
    expect(detail?.prev1Spins).toBe(17);
    expect(detail?.prev2Spins).toBe(63);
    expect(detail?.todayBet).toBeNull();
  });

  it('returns null without a room number', () => {
    expect(parseDetail([{ path: 'x', text: '1' }])).toBeNull();
  });
});
