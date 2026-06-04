import { describe, it, expect } from 'vitest';
import { pickPrize } from '../../../src/draw/pick.js';

const A = { id: 'a', weight: 1, stock: 1, enabled: true, isConsolation: false };
const B = { id: 'b', weight: 4, stock: 1, enabled: true, isConsolation: false };

describe('pickPrize', () => {
  it('returns first when roll is 0', () => {
    expect(pickPrize([A, B], () => 0).id).toBe('a');
  });
  it('weighted distribution', () => {
    expect(pickPrize([A, B], () => 0.5).id).toBe('b'); // 0.5 * 5 = 2.5 → b
  });
  it('skips disabled / out of stock', () => {
    const list = [
      { id: 'a', weight: 1, stock: 0, enabled: true, isConsolation: false },
      { id: 'b', weight: 1, stock: 1, enabled: false, isConsolation: false },
      { id: 'c', weight: 1, stock: 1, enabled: true, isConsolation: false },
    ];
    expect(pickPrize(list, () => 0.99).id).toBe('c');
  });
  it('throws on empty list', () => {
    expect(() => pickPrize([], () => 0)).toThrow(/NO_ACTIVE_PRIZE/);
  });
  it('throws when total weight is 0', () => {
    const zero = [{ id: 'z', weight: 0, stock: 5, enabled: true, isConsolation: false }];
    expect(() => pickPrize(zero, () => 0.5)).toThrow(/ZERO_WEIGHT/);
  });
});
