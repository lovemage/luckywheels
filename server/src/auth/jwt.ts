import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const DEFAULT_TTL = 60 * 60 * 24 * 14; // 14d

export interface SessionPayload { userId: string; }

export async function signSession(
  payload: SessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? DEFAULT_TTL;
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  if (typeof payload.userId !== 'string') throw new Error('invalid session payload');
  return { userId: payload.userId };
}
