import { fetch } from 'undici';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { AppError } from '../errors.js';

// ───────── signed state (HMAC via STATE_SECRET) ─────────

const stateSecret = new TextEncoder().encode(env.STATE_SECRET);

export async function signState(value: string, opts: { ttlSeconds?: number } = {}): Promise<string> {
  const ttl = opts.ttlSeconds ?? 600;
  return new SignJWT({ s: value })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('luckywheels-state')
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(stateSecret);
}

export async function verifyState(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, stateSecret, { issuer: 'luckywheels-state' });
  if (typeof payload.s !== 'string') throw new Error('invalid state');
  return payload.s;
}

// ───────── LINE OAuth REST ─────────

export interface LineTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token: string;
  token_type: 'Bearer';
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export function buildAuthorizeUrl(opts: { state: string; nonce: string }): string {
  const u = new URL(`${env.LINE_AUTH_BASE}/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.LINE_CHANNEL_ID);
  u.searchParams.set('redirect_uri', env.LINE_REDIRECT_URI);
  u.searchParams.set('state', opts.state);
  u.searchParams.set('nonce', opts.nonce);
  u.searchParams.set('scope', 'profile openid');
  return u.toString();
}

export async function exchangeCodeForToken(code: string): Promise<LineTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.LINE_REDIRECT_URI,
    client_id: env.LINE_CHANNEL_ID,
    client_secret: env.LINE_CHANNEL_SECRET,
  });
  const res = await fetch(`${env.LINE_API_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new AppError('LINE_TOKEN_EXCHANGE', 'failed to exchange code', 502);
  return (await res.json()) as LineTokenResponse;
}

export async function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  const res = await fetch(`${env.LINE_PROFILE_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new AppError('LINE_PROFILE', 'failed to fetch profile', 502);
  return (await res.json()) as LineProfile;
}

// LINE's id_token (when channel uses default HS256) is signed with the channel secret.
export async function verifyLineIdToken(
  idToken: string,
  opts: { nonce: string },
): Promise<{ sub: string; nonce?: string }> {
  const key = new TextEncoder().encode(env.LINE_CHANNEL_SECRET);
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, key, {
      issuer: env.LINE_ISSUER,
      audience: env.LINE_CHANNEL_ID,
    }));
  } catch {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token signature/iss/aud invalid', 502);
  }
  if (payload.nonce !== opts.nonce) {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'nonce mismatch', 502);
  }
  if (typeof payload.sub !== 'string') {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token missing sub', 502);
  }
  return { sub: payload.sub, nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined };
}
