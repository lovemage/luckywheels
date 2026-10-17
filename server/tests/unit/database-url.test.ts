import { describe, it, expect } from 'vitest';
import { withConnectionLimit } from '../../src/database-url.js';

describe('database pool size', () => {
  it('adds a bounded pool while preserving credentials and options', () => {
    const result = new URL(withConnectionLimit('postgresql://user:p%40ss@localhost/db?sslmode=require')!);
    expect(result.searchParams.get('connection_limit')).toBe('5');
    expect(result.searchParams.get('sslmode')).toBe('require');
    expect(result.password).toBe('p%40ss');
  });
  it('preserves explicit deployment overrides', () => {
    const url = 'postgres://u:p@localhost/db?connection_limit=3';
    expect(withConnectionLimit(url)).toBe(url);
  });
  it('leaves absent, invalid and other datasource URLs to Prisma', () => {
    for (const url of [undefined, '', 'invalid', 'file:./test.db']) {
      expect(withConnectionLimit(url)).toBe(url);
    }
  });
});
