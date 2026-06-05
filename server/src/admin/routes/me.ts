import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { audit } from '../audit/helper.js';

export const adminMeRoutes = new Hono();

const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

adminMeRoutes.patch('/api/admin/me/password', requireAdmin, async (c) => {
  let body: z.infer<typeof PasswordBody>;
  try { body = PasswordBody.parse(await c.req.json()); }
  catch { throw new AppError('PASSWORD_BODY_INVALID', 'invalid body', 400); }

  if (body.newPassword.length < 12) throw new AppError('NEW_PASSWORD_TOO_SHORT', 'min 12 chars', 400);
  if (body.newPassword === body.currentPassword) throw new AppError('NEW_PASSWORD_SAME_AS_OLD', 'new password must differ', 400);

  const adminUser = c.get('admin');
  const adminId = adminUser.id;
  const me = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  if (!await verifyPassword(body.currentPassword, me.passwordHash)) {
    throw new AppError('CURRENT_PASSWORD_WRONG', 'current password is wrong', 401);
  }

  const newHash = await hashPassword(body.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });
    await audit(c, tx, {
      event: 'admin.password_change',
      targetType: 'admin_user',
      targetId: adminId,
      payloadAfter: { passwordChangedAt: new Date().toISOString() },
    });
  });
  return c.json({ ok: true });
});
