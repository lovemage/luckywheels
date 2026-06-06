import { prisma } from '../db.js';
import { hashPassword } from './auth/password.js';

export async function bootstrapAdminIfRequested(): Promise<void> {
  const account = process.env.ADMIN_BOOTSTRAP_ACCOUNT ?? process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!account || !password) return;
  const existing = await prisma.adminUser.findFirst();
  if (existing) {
    console.log('[bootstrap] admin already exists, skipping bootstrap');
    return;
  }
  const created = await prisma.adminUser.create({
    data: {
      email: account,
      passwordHash: await hashPassword(password),
      role: 'admin',
      passwordChangedAt: new Date(),
    },
  });
  console.log(`[bootstrap] created initial admin ${created.email} (${created.id})`);
}
