import { PrismaClient } from '@prisma/client';
import { superadminEnv, type Site } from './env.js';

// One PrismaClient per site, built lazily with a per-connection datasource
// override. Both site databases were migrated from the SAME prisma schema, so
// the one generated client can talk to either. This is the only place in the
// codebase that uses the `datasources` constructor override — the normal
// server binds a single client to process.env.DATABASE_URL (see src/db.ts).
const clients = new Map<Site, PrismaClient>();

export function clientFor(site: Site): PrismaClient {
  const existing = clients.get(site);
  if (existing) return existing;
  const { siteUrls } = superadminEnv();
  const client = new PrismaClient({
    log: ['error', 'warn'],
    datasources: { db: { url: siteUrls[site] } },
  });
  clients.set(site, client);
  return client;
}

/** The database that stores superadmin credentials (role='superadmin'). */
export function controlClient(): PrismaClient {
  return clientFor(superadminEnv().controlSite);
}

export async function disconnectAll(): Promise<void> {
  await Promise.all([...clients.values()].map((c) => c.$disconnect()));
  clients.clear();
}
