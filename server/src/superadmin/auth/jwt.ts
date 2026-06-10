import { SignJWT, jwtVerify } from 'jose';
import { superadminEnv } from '../env.js';

const ISSUER = 'luckywheels-superadmin';
const AUDIENCE = 'luckywheels-superadmin-ui';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

// Resolved lazily so importing this module without the superadmin env set
// (e.g. in the normal server's test suite) does not throw at import time.
function secret(): Uint8Array {
  return new TextEncoder().encode(superadminEnv().jwtSecret);
}

export interface SuperadminSessionPayload {
  adminUserId: string;
  email: string;
}

export async function signSuperadminSession(
  payload: SuperadminSessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
  return new SignJWT({ adminUserId: payload.adminUserId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret());
}

export async function verifySuperadminSession(token: string): Promise<SuperadminSessionPayload> {
  const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE });
  if (typeof payload.adminUserId !== 'string' || typeof payload.email !== 'string') {
    throw new Error('invalid superadmin session payload');
  }
  return { adminUserId: payload.adminUserId, email: payload.email };
}
