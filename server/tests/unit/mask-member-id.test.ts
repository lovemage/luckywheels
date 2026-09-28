import { describe, it, expect } from 'vitest';
import { maskMemberId } from '../../src/routes/winners.js';

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
