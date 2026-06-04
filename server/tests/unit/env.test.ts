import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../src/env.js';

const baseValid = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/db',
  PORT: '3001',
  PUBLIC_FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRET: 'a'.repeat(32),
  STATE_SECRET: 'b'.repeat(32),
  JWT_ISSUER: 'luckywheels',
  JWT_AUDIENCE: 'front',
  LINE_CHANNEL_ID: '1234567890',
  LINE_CHANNEL_SECRET: 'c'.repeat(32),
  LINE_REDIRECT_URI: 'http://127.0.0.1:3001/api/auth/line/callback',
  LINE_AUTH_BASE: 'https://access.line.me/oauth2/v2.1',
  LINE_API_BASE: 'https://api.line.me/oauth2/v2.1',
  LINE_PROFILE_BASE: 'https://api.line.me/v2',
  LINE_ISSUER: 'https://access.line.me',
};

describe('parseEnv', () => {
  it('accepts valid env', () => {
    const env = parseEnv(baseValid);
    expect(env.PORT).toBe(3001);
  });
  it('rejects short JWT_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
  it('rejects short STATE_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, STATE_SECRET: 'short' })).toThrow(/STATE_SECRET/);
  });
  it('requires JWT_SECRET != STATE_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, STATE_SECRET: baseValid.JWT_SECRET })).toThrow(/distinct/);
  });
  it('rejects invalid DATABASE_URL', () => {
    expect(() => parseEnv({ ...baseValid, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});
