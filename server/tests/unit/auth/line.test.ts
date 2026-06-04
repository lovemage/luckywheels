import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchLineProfile,
  verifyLineIdToken,
} from '../../../src/auth/line.js';
import { startMockLine, stopMockLine, MOCK_NONCE } from '../../helpers/mock-line.js';
import { env } from '../../../src/env.js';

describe('LINE OAuth client', () => {
  beforeEach(() => startMockLine());
  afterEach(() => stopMockLine());

  it('builds authorize URL with state + nonce + scope', () => {
    const u = new URL(buildAuthorizeUrl({ state: 'st', nonce: 'no' }));
    expect(u.origin + u.pathname).toBe(`${env.LINE_AUTH_BASE}/authorize`);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe(env.LINE_CHANNEL_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(env.LINE_REDIRECT_URI);
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('nonce')).toBe('no');
    expect(u.searchParams.get('scope')).toBe('profile openid');
  });

  it('exchanges code for token', async () => {
    const tk = await exchangeCodeForToken('test_code');
    expect(tk.access_token).toBe('mock_access_token');
    expect(tk.id_token).toBeTruthy();
  });

  it('throws AppError on bad code', async () => {
    await expect(exchangeCodeForToken('bad_code')).rejects.toMatchObject({ code: 'LINE_TOKEN_EXCHANGE' });
  });

  it('fetches profile', async () => {
    const p = await fetchLineProfile('mock_access_token');
    expect(p).toEqual({ userId: 'U_mocked', displayName: 'Mocked Member', pictureUrl: 'https://profile.line/p.png' });
  });

  it('verifies id_token issuer + audience + nonce', async () => {
    const tk = await exchangeCodeForToken('test_code');
    const claims = await verifyLineIdToken(tk.id_token!, { nonce: MOCK_NONCE });
    expect(claims.sub).toBe('U_mocked');
  });

  it('rejects id_token with mismatched nonce', async () => {
    const tk = await exchangeCodeForToken('test_code');
    await expect(verifyLineIdToken(tk.id_token!, { nonce: 'wrong' })).rejects.toMatchObject({
      code: 'LINE_ID_TOKEN_INVALID',
    });
  });
});
