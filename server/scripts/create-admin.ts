import { prisma } from '../src/db.js';
import { hashPassword } from '../src/admin/auth/password.js';

export interface CreateAdminInput {
  email: string;
  password: string;
}

export async function createAdminAccount(input: CreateAdminInput): Promise<{ id: string; email: string }> {
  if (input.password.length < 12) {
    throw new Error('password must be at least 12 characters');
  }
  const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (existing) throw new Error(`admin with email ${input.email} already exists`);
  const created = await prisma.adminUser.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: 'admin',
      passwordChangedAt: new Date(),
    },
  });
  return { id: created.id, email: created.email };
}

function parseArgs(argv: string[]): CreateAdminInput {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k && v) args.set(k.replace(/^--/, ''), v);
  }
  const email = args.get('email');
  const password = args.get('password');
  if (!email || !password) {
    throw new Error('usage: npm run admin:create -- --email <email> --password <password>');
  }
  return { email, password };
}

if (process.argv[1]?.endsWith('create-admin.ts') || process.argv[1]?.endsWith('create-admin.js')) {
  const input = parseArgs(process.argv);
  createAdminAccount(input)
    .then(({ id, email }) => {
      console.log(`created admin ${id} (${email})`);
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(`error: ${(err as Error).message}`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
