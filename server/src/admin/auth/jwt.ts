import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../env.js';

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);
const ISSUER = 'luckywheels-admin';
const AUDIENCE = 'luckywheels-admin-ui';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AdminSessionPayload {
  adminUserId: string;
  email: string;
}

export async function signAdminSession(
  payload: AdminSessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
  return new SignJWT({ adminUserId: payload.adminUserId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof payload.adminUserId !== 'string' || typeof payload.email !== 'string') {
    throw new Error('invalid admin session payload');
  }
  return { adminUserId: payload.adminUserId, email: payload.email };
}
