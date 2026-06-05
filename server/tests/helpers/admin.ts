import { prisma } from '../../src/db.js';
import { hashPassword } from '../../src/admin/auth/password.js';
import { signAdminSession } from '../../src/admin/auth/jwt.js';
import { ADMIN_SESSION_COOKIE } from '../../src/admin/auth/cookies.js';

let a = 0;

export async function createAdmin(opts: { email?: string; password?: string } = {}) {
  a += 1;
  const email = opts.email ?? `admin${a}@example.com`;
  const password = opts.password ?? 'test-password-12';
  return prisma.adminUser.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
    },
  });
}

export async function createAdminWithPassword(password: string, opts: { email?: string } = {}) {
  a += 1;
  const email = opts.email ?? `admin${a}-pw@example.com`;
  return prisma.adminUser.create({
    data: { email, passwordHash: await hashPassword(password), role: 'admin' },
  });
}

export async function adminHeaders(adminUserId: string, email: string) {
  const token = await signAdminSession({ adminUserId, email });
  return {
    cookie: `${ADMIN_SESSION_COOKIE}=${token}`,
    'content-type': 'application/json',
  };
}
