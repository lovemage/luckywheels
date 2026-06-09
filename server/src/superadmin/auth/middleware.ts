import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../../errors.js';
import { controlClient } from '../clients.js';
import { verifySuperadminSession } from './jwt.js';
import { SUPERADMIN_SESSION_COOKIE } from './cookies.js';

declare module 'hono' {
  interface ContextVariableMap {
    superadmin: import('@prisma/client').AdminUser;
  }
}

// Gate: valid superadmin session cookie AND the AdminUser still exists in the
// control DB with role='superadmin'. The role check is what makes "superadmin"
// a real privilege tier (AdminUser.role was unused before this feature).
export const requireSuperadmin: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SUPERADMIN_SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'superadmin login required', 401);
  let payload;
  try { payload = await verifySuperadminSession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid superadmin session', 401); }
  const admin = await controlClient().adminUser.findUnique({ where: { id: payload.adminUserId } });
  if (!admin || admin.role !== 'superadmin') {
    throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  }
  c.set('superadmin', admin);
  await next();
};
