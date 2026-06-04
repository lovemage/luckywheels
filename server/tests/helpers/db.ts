import { prisma } from '../../src/db.js';

const TABLES = [
  'DrawLog',
  'Redemption',
  'Prize',
  'AppSetting',
  'AdminActionLog',
  'User',
] as const;

export async function resetDb(): Promise<void> {
  await prisma.$transaction(
    TABLES.map((t) => prisma.$executeRawUnsafe(`TRUNCATE "${t}" RESTART IDENTITY CASCADE`)),
  );
}
