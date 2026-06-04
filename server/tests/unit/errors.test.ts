// server/tests/unit/errors.test.ts
import { describe, it, expect } from 'vitest';
import { AppError, formatError } from '../../src/errors.js';

describe('formatError', () => {
  it('serializes AppError', () => {
    const out = formatError(new AppError('USER_BLACKLISTED', 'suspended', 403));
    expect(out).toEqual({
      status: 403,
      body: { error: { code: 'USER_BLACKLISTED', message: 'suspended' } },
    });
  });
  it('does not leak internals for unknown errors', () => {
    const out = formatError(new Error('boom-secret'));
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
    expect(out.body.error.message).not.toMatch(/boom-secret/);
  });
});
