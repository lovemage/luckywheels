import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../../errors.js';
import { verifyPassword } from '../../admin/auth/password.js';
import { recordLoginFailure, isLoginLocked } from '../../admin/auth/rate-limit.js';
import { writeAdminActionLog } from '../../audit/log.js';
import { controlClient } from '../clients.js';
import { signSuperadminSession } from '../auth/jwt.js';
import {
  setSuperadminSessionCookie,
  clearSuperadminSessionCookie,
} from '../auth/cookies.js';
import { requireSuperadmin } from '../auth/middleware.js';
import { superadminEnv, SITES } from '../env.js';

const LoginSchema = z.object({
  account: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
  password: z.string().min(1),
}).refine((v) => v.account || v.email);

export const superadminAuthRoutes = new Hono();

superadminAuthRoutes.post('/api/superadmin/auth/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? '0.0.0.0';
  if (isLoginLocked(ip)) {
    throw new AppError('LOGIN_RATE_LIMITED', 'too many failed attempts, try again later', 429);
  }

  let body: z.infer<typeof LoginSchema>;
  try { body = LoginSchema.parse(await c.req.json()); }
  catch { throw new AppError('LOGIN_INVALID', 'account + password required', 400); }

  const account = body.account ?? body.email!;
  const client = controlClient();
  const admin = await client.adminUser.findUnique({ where: { email: account } });
  const okPassword = admin ? await verifyPassword(body.password, admin.passwordHash) : false;
  const isSuper = admin?.role === 'superadmin';

  if (!admin || !okPassword || !isSuper) {
    recordLoginFailure(ip);
    await writeAdminActionLog(client, {
      event: 'superadmin.login_failed',
      targetType: 'admin',
      targetId: admin?.id ?? null,
      ip,
      userAgent: c.req.header('user-agent') ?? null,
      payloadAfter: { accountTried: account, roleOk: isSuper },
    });
    throw new AppError('BAD_CREDENTIALS', 'invalid account or password', 401);
  }

  const token = await signSuperadminSession({ adminUserId: admin.id, email: admin.email });
  setSuperadminSessionCookie(c, token);

  const updated = await client.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });
  c.set('superadmin', updated);

  await writeAdminActionLog(client, {
    adminUserId: admin.id,
    event: 'superadmin.login_succeeded',
    targetType: 'admin',
    targetId: admin.id,
    ip,
    userAgent: c.req.header('user-agent') ?? null,
  });

  return c.json({ ok: true });
});

superadminAuthRoutes.post('/api/superadmin/auth/logout', (c) => {
  clearSuperadminSessionCookie(c);
  return c.body(null, 204);
});

superadminAuthRoutes.get('/api/superadmin/me', requireSuperadmin, (c) => {
  const a = c.get('superadmin');
  const cfg = superadminEnv();
  return c.json({
    id: a.id,
    account: a.email,
    email: a.email,
    role: a.role,
    lastLoginAt: a.lastLoginAt,
    passwordChangedAt: a.passwordChangedAt,
    controlSite: cfg.controlSite,
    sites: SITES.map((s) => ({ site: s, label: cfg.labels[s] })),
  });
});
