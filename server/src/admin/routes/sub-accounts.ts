import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { hashPassword } from '../auth/password.js';
import { ADMIN_NAV_KEYS, requireAdmin, requireMainAdmin } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';

export const adminSubAccountsRoutes = new Hono();

const NavKey = z.enum(ADMIN_NAV_KEYS);
const CreateBody = z.object({
  account: z.string().min(1).max(120),
  password: z.string().min(1).max(200),
  allowedNavs: z.array(NavKey).default([]),
});
const UpdateBody = z.object({
  account: z.string().min(1).max(120).optional(),
  password: z.string().min(1).max(200).optional(),
  allowedNavs: z.array(NavKey).optional(),
});

adminSubAccountsRoutes.use('/api/admin/sub-accounts/*', requireAdmin, requireMainAdmin);
adminSubAccountsRoutes.use('/api/admin/sub-accounts', requireAdmin, requireMainAdmin);

adminSubAccountsRoutes.get('/api/admin/sub-accounts', async (c) => {
  const items = await prisma.adminUser.findMany({
    where: { isMain: false },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      allowedNavs: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return c.json({ items });
});

adminSubAccountsRoutes.post('/api/admin/sub-accounts', async (c) => {
  let body: z.infer<typeof CreateBody>;
  try { body = CreateBody.parse(await c.req.json()); }
  catch { throw new AppError('SUB_ACCOUNT_BODY_INVALID', 'invalid body', 400); }

  const admin = c.get('admin');
  const passwordHash = await hashPassword(body.password);
  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.create({
        data: {
          email: body.account,
          passwordHash,
          role: 'subadmin',
          isMain: false,
          allowedNavs: body.allowedNavs,
          createdByAdminUserId: admin.id,
        },
        select: {
          id: true,
          email: true,
          allowedNavs: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await audit(c, tx, {
        event: 'admin.sub_account_created',
        targetType: 'admin_user',
        targetId: row.id,
        payloadAfter: { account: row.email, allowedNavs: row.allowedNavs },
      });
      return row;
    });
    return c.json(created, 201);
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError('SUB_ACCOUNT_TAKEN', 'account already exists', 409);
    }
    throw err;
  }
});

adminSubAccountsRoutes.patch('/api/admin/sub-accounts/:id', async (c) => {
  let body: z.infer<typeof UpdateBody>;
  try { body = UpdateBody.parse(await c.req.json()); }
  catch { throw new AppError('SUB_ACCOUNT_BODY_INVALID', 'invalid body', 400); }

  const id = c.req.param('id');
  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing || existing.isMain) throw new AppError('SUB_ACCOUNT_NOT_FOUND', 'sub account not found', 404);

  const data: { email?: string; passwordHash?: string; allowedNavs?: string[] } = {};
  if (body.account !== undefined) data.email = body.account;
  if (body.allowedNavs !== undefined) data.allowedNavs = body.allowedNavs;
  if (body.password !== undefined) data.passwordHash = await hashPassword(body.password);

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.adminUser.update({
        where: { id },
        data,
        select: {
          id: true,
          email: true,
          allowedNavs: true,
          lastLoginAt: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      await audit(c, tx, {
        event: 'admin.sub_account_updated',
        targetType: 'admin_user',
        targetId: id,
        payloadBefore: { account: existing.email, allowedNavs: existing.allowedNavs },
        payloadAfter: {
          account: row.email,
          allowedNavs: row.allowedNavs,
          passwordChanged: body.password !== undefined,
        },
      });
      return row;
    });
    return c.json(updated);
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError('SUB_ACCOUNT_TAKEN', 'account already exists', 409);
    }
    throw err;
  }
});

adminSubAccountsRoutes.delete('/api/admin/sub-accounts/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.adminUser.findUnique({ where: { id } });
  if (!existing || existing.isMain) throw new AppError('SUB_ACCOUNT_NOT_FOUND', 'sub account not found', 404);

  await prisma.$transaction(async (tx) => {
    await tx.adminUser.delete({ where: { id } });
    await audit(c, tx, {
      event: 'admin.sub_account_deleted',
      targetType: 'admin_user',
      targetId: id,
      payloadBefore: { account: existing.email, allowedNavs: existing.allowedNavs },
    });
  });
  return c.json({ ok: true });
});
