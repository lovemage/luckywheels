import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../errors.js';
import { prisma } from '../db.js';
import { verifySession } from './jwt.js';
import { SESSION_COOKIE } from './cookies.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: import('@prisma/client').User;
  }
}

export const requireUser: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'login required', 401);
  let payload;
  try { payload = await verifySession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid session', 401); }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  c.set('user', user);
  await next();
};
