import type { Context } from 'hono';
import type { Prisma, PrismaClient } from '@prisma/client';
import { writeAdminActionLog, type AdminActionLogInput } from '../../audit/log.js';

type Client = PrismaClient | Prisma.TransactionClient;

export async function audit(
  c: Context,
  client: Client,
  input: Omit<AdminActionLogInput, 'adminUserId' | 'ip' | 'userAgent'> & {
    adminUserId?: string | null;
  },
): Promise<void> {
  const admin = c.get('admin') as { id: string } | undefined;
  await writeAdminActionLog(client, {
    ...input,
    adminUserId: input.adminUserId ?? admin?.id ?? null,
    ip: c.req.header('x-forwarded-for') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
}
