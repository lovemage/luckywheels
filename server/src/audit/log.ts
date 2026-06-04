import { Prisma, type PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

export interface AdminActionLogInput {
  adminUserId?: string | null;
  event: string;
  targetType?: string | null;
  targetId?: string | null;
  payloadBefore?: Prisma.JsonValue;
  payloadAfter?: Prisma.JsonValue;
  ip?: string | null;
  userAgent?: string | null;
  note?: string | null;
}

export async function writeAdminActionLog(
  client: Client,
  input: AdminActionLogInput,
): Promise<void> {
  await client.adminActionLog.create({
    data: {
      adminUserId: input.adminUserId ?? null,
      event: input.event,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      payloadBefore: input.payloadBefore as Prisma.InputJsonValue ?? Prisma.JsonNull,
      payloadAfter: input.payloadAfter as Prisma.InputJsonValue ?? Prisma.JsonNull,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      note: input.note ?? null,
    },
  });
}
