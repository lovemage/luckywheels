import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../../errors.js';
import { prisma } from '../../db.js';
import { verifyAdminSession } from './jwt.js';
import { ADMIN_SESSION_COOKIE } from './cookies.js';

declare module 'hono' {
  interface ContextVariableMap {
    admin: import('@prisma/client').AdminUser;
  }
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'admin login required', 401);
  let payload;
  try { payload = await verifyAdminSession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid admin session', 401); }
  const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminUserId } });
  if (!admin) throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  c.set('admin', admin);
  await next();
};
