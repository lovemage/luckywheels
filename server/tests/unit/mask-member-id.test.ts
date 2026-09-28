import { describe, it, expect } from 'vitest';
import { maskMemberId, parseDemoEntries } from '../../src/routes/winners.js';

describe('maskMemberId', () => {
  it('keeps two leading and two trailing characters of longer ids', () => {
    expect(maskMemberId('ab12345')).toBe('ab***45');
  });

  it('keeps less of short ids', () => {
    expect(maskMemberId('abcd')).toBe('a***d');
    expect(maskMemberId('ab')).toBe('a***');
  });

  it('masks CJK nicknames by code point', () => {
    expect(maskMemberId('王小明')).toBe('王***明');
  });

  it('falls back when empty', () => {
    expect(maskMemberId(null)).toBe('***');
    expect(maskMemberId('  ')).toBe('***');
  });
});

describe('parseDemoEntries', () => {
  it('keeps well-formed entries only', () => {
    const raw = JSON.stringify([
      { memberId: 'jx123456', rankLabel: '三獎' },
      { memberId: '', rankLabel: '三獎' },
      { rankLabel: '二獎' },
    ]);
    expect(parseDemoEntries(raw)).toEqual([{ memberId: 'jx123456', rankLabel: '三獎' }]);
  });

  it('returns [] for invalid JSON or non-arrays', () => {
    expect(parseDemoEntries('not json')).toEqual([]);
    expect(parseDemoEntries('{"a":1}')).toEqual([]);
    expect(parseDemoEntries(undefined)).toEqual([]);
  });
});
