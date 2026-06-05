import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { verifyPassword } from '../auth/password.js';
import { signAdminSession } from '../auth/jwt.js';
import {
  ADMIN_SESSION_COOKIE,
  setAdminSessionCookie,
  clearAdminSessionCookie,
} from '../auth/cookies.js';
import { requireAdmin } from '../auth/middleware.js';
import {
  recordLoginFailure,
  isLoginLocked,
} from '../auth/rate-limit.js';
import { audit } from '../audit/helper.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminAuthRoutes = new Hono();

adminAuthRoutes.post('/api/admin/auth/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? '0.0.0.0';

  if (isLoginLocked(ip)) {
    throw new AppError('LOGIN_RATE_LIMITED', 'too many failed attempts, try again later', 429);
  }

  let body: z.infer<typeof LoginSchema>;
  try { body = LoginSchema.parse(await c.req.json()); }
  catch { throw new AppError('LOGIN_INVALID', 'email + password required', 400); }

  const admin = await prisma.adminUser.findUnique({ where: { email: body.email } });
  const okPassword = admin ? await verifyPassword(body.password, admin.passwordHash) : false;

  if (!admin || !okPassword) {
    recordLoginFailure(ip);
    await audit(c, prisma, {
      event: 'admin.login_failed',
      targetType: 'admin',
      targetId: admin?.id ?? null,
      payloadAfter: { emailTried: body.email },
    });
    throw new AppError('BAD_CREDENTIALS', 'invalid email or password', 401);
  }

  const token = await signAdminSession({ adminUserId: admin.id, email: admin.email });
  setAdminSessionCookie(c, token);

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  c.set('admin', updated);
  await audit(c, prisma, {
    event: 'admin.login_succeeded',
    targetType: 'admin',
    targetId: admin.id,
  });

  return c.body(null, 200);
});

adminAuthRoutes.post('/api/admin/auth/logout', (c) => {
  clearAdminSessionCookie(c);
  return c.body(null, 204);
});

adminAuthRoutes.get('/api/admin/me', requireAdmin, (c) => {
  const a = c.get('admin');
  return c.json({
    id: a.id,
    email: a.email,
    role: a.role,
    lastLoginAt: a.lastLoginAt,
    passwordChangedAt: a.passwordChangedAt,
  });
});
