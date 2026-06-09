import { PrismaClient, type AdminUser } from '@prisma/client';
import { hashPassword } from '../src/admin/auth/password.js';

// Bootstrap a superadmin account (role='superadmin') in the control database.
// The superadmin console authenticates against this row. Reads process.env
// directly (NOT the shared src/env.ts) so it runs with only the site DB URL
// set — no need for the full app env.
//
//   npm run superadmin:create -- --account boss@x.com --password '...' [--site A] [--promote]

export interface CreateSuperadminInput {
  account: string;
  password: string;
  site: 'A' | 'B';
  promote: boolean;
}

function resolveUrl(site: 'A' | 'B'): string {
  const url = process.env[`SITE_${site}_DATABASE_URL`];
  if (!url) throw new Error(`SITE_${site}_DATABASE_URL is not set`);
  return url;
}

export async function createSuperadminAccount(
  client: PrismaClient,
  input: { account: string; password: string; promote?: boolean },
): Promise<{ admin: AdminUser; action: 'created' | 'promoted' | 'exists' }> {
  if (!input.account) throw new Error('account is required');
  if (!input.password) throw new Error('password is required');

  const existing = await client.adminUser.findUnique({ where: { email: input.account } });
  if (existing) {
    if (existing.role === 'superadmin') return { admin: existing, action: 'exists' };
    if (!input.promote) {
      throw new Error(
        `an admin with account ${input.account} already exists (role=${existing.role}); ` +
        `pass --promote to promote it to superadmin (this also resets its password to the one provided)`,
      );
    }
    const promoted = await client.adminUser.update({
      where: { id: existing.id },
      data: {
        role: 'superadmin',
        passwordHash: await hashPassword(input.password),
        passwordChangedAt: new Date(),
      },
    });
    return { admin: promoted, action: 'promoted' };
  }
  const created = await client.adminUser.create({
    data: {
      email: input.account,
      passwordHash: await hashPassword(input.password),
      role: 'superadmin',
      passwordChangedAt: new Date(),
    },
  });
  return { admin: created, action: 'created' };
}

function parseArgs(argv: string[]): CreateSuperadminInput {
  const args = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (!k || !k.startsWith('--')) continue;
    const key = k.replace(/^--/, '');
    const v = argv[i + 1];
    if (v && !v.startsWith('--')) { args.set(key, v); i++; }
    else flags.add(key);
  }
  const account = args.get('account') ?? args.get('email');
  const password = args.get('password');
  const siteArg = (args.get('site') ?? process.env.SUPERADMIN_CONTROL_SITE ?? 'A').toUpperCase();
  if (siteArg !== 'A' && siteArg !== 'B') {
    throw new Error('--site must be A or B');
  }
  if (!account || !password) {
    throw new Error('usage: npm run superadmin:create -- --account <account> --password <password> [--site A|B] [--promote]');
  }
  return { account, password, site: siteArg, promote: flags.has('promote') };
}

if (process.argv[1]?.endsWith('create-superadmin.ts') || process.argv[1]?.endsWith('create-superadmin.js')) {
  const input = parseArgs(process.argv);
  const client = new PrismaClient({ datasources: { db: { url: resolveUrl(input.site) } } });
  createSuperadminAccount(client, input)
    .then(({ admin, action }) => {
      console.log(`superadmin ${action}: ${admin.id} (${admin.email}) on site ${input.site}`);
      return client.$disconnect();
    })
    .catch(async (err) => {
      console.error(`error: ${(err as Error).message}`);
      await client.$disconnect();
      process.exit(1);
    });
}
