import { prisma } from '../src/db.js';
import { hashPassword } from '../src/admin/auth/password.js';

export interface CreateAdminInput {
  account: string;
  password: string;
}

export async function createAdminAccount(input: CreateAdminInput): Promise<{ id: string; email: string }> {
  if (!input.account) throw new Error('account is required');
  if (!input.password) throw new Error('password is required');
  const existing = await prisma.adminUser.findUnique({ where: { email: input.account } });
  if (existing) throw new Error(`admin with account ${input.account} already exists`);
  const created = await prisma.adminUser.create({
    data: {
      email: input.account,
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
  const account = args.get('account') ?? args.get('email');
  const password = args.get('password');
  if (!account || !password) {
    throw new Error('usage: npm run admin:create -- --account <account> --password <password>');
  }
  return { account, password };
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
