import { PrismaClient } from '@prisma/client';
import { withConnectionLimit } from './database-url.js';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? new PrismaClient({
    datasourceUrl: withConnectionLimit(process.env.DATABASE_URL),
    log: ['error', 'warn'],
  });

globalThis.__prisma = prisma;
