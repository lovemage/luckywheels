import { Hono, type MiddlewareHandler } from 'hono';
import { z } from 'zod';
import type { CollectorAccount } from '@prisma/client';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { dataAssistantEnabled } from '../../assistant/feature.js';
import { decryptCredential, encryptCredential, parseCredentialsKey } from '../../assistant/credentials.js';
import {
  COLLECTOR_SETTING_KEYS,
  normalizeCasinoUrl,
  readCollectorSettings,
} from '../../collector/settings.js';

// 數據助手：ATG 採集管理（採集帳號、採集間隔／每輪細項台數、採集紀錄）。
// 帳號與密碼只寫不讀：API 回應與 AdminActionLog 只出現遮罩後的帳號，從不出現密碼。

export const adminAssistantCollectorRoutes = new Hono();
const BASE = '/api/admin/assistant/collector';

const requireFeature: MiddlewareHandler = async (_c, next) => {
  if (!dataAssistantEnabled()) throw new AppError('NOT_FOUND', 'not found', 404);
  await next();
};
const guard = [requireFeature, ...requireAdminNav('assistant')] as const;
adminAssistantCollectorRoutes.use(BASE, ...guard);
adminAssistantCollectorRoutes.use(`${BASE}/*`, ...guard);

const Settings = z.object({
  intervalMinutes: z.number().int().min(5).max(120),
  detailBatchSize: z.number().int().min(0).max(5000),
});
const AccountCreate = z.object({
  label: z.string().trim().min(1).max(60),
  casinoUrl: z.string().trim().min(1).max(500),
  account: z.string().trim().min(1).max(120),
  password: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
});
const AccountUpdate = AccountCreate.partial();

function credentialsKey(): Buffer {
  try {
    return parseCredentialsKey(process.env.COLLECTOR_CREDENTIALS_KEY);
  } catch {
    throw new AppError('COLLECTOR_KEY_NOT_CONFIGURED', 'COLLECTOR_CREDENTIALS_KEY is not configured', 409);
  }
}

function optionalKey(): Buffer | null {
  try { return parseCredentialsKey(process.env.COLLECTOR_CREDENTIALS_KEY); }
  catch { return null; }
}

function casinoOrigin(raw: string): string {
  try {
    return normalizeCasinoUrl(raw);
  } catch {
    throw new AppError('CASINO_URL_INVALID', 'casinoUrl must be an https URL without credentials', 400);
  }
}

export function maskAccount(account: string): string {
  if (account.length <= 2) return `${account[0] ?? ''}***`;
  if (account.length <= 4) return `${account.slice(0, 1)}***${account.slice(-1)}`;
  return `${account.slice(0, 2)}***${account.slice(-2)}`;
}

function present(row: CollectorAccount, key: Buffer | null) {
  let accountMasked: string | null = null;
  if (key) {
    try { accountMasked = maskAccount(decryptCredential(row.accountEnc, key)); }
    catch { accountMasked = null; }
  }
  return {
    id: row.id,
    label: row.label,
    casinoUrl: row.casinoUrl,
    accountMasked,
    enabled: row.enabled,
    lastUsedAt: row.lastUsedAt,
    lastErrorAt: row.lastErrorAt,
    lastError: row.lastError,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function parseBody<T extends z.ZodTypeAny>(schema: T, raw: Promise<unknown>): Promise<z.infer<T>> {
  try { return schema.parse(await raw); }
  catch { throw new AppError('COLLECTOR_BODY_INVALID', 'invalid body', 400); }
}

adminAssistantCollectorRoutes.get(BASE, async (c) => {
  const key = optionalKey();
  const [settings, accounts] = await Promise.all([
    readCollectorSettings(prisma),
    prisma.collectorAccount.findMany({ orderBy: { updatedAt: 'desc' } }),
  ]);
  // 與 collector 的 loadCredentials 相同規則：最近更新的 enabled 帳號
  const activeAccountId = accounts.find((a) => a.enabled)?.id ?? null;
  return c.json({
    keyConfigured: key !== null,
    settings,
    activeAccountId,
    accounts: accounts.map((a) => present(a, key)),
  });
});

adminAssistantCollectorRoutes.get(`${BASE}/runs`, async (c) => {
  const take = Math.min(Math.max(Math.trunc(Number(c.req.query('take'))) || 30, 1), 100);
  const [items, roomCount, detailedCount, lastSucceeded] = await Promise.all([
    prisma.collectorRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        startedAt: true,
        finishedAt: true,
        durationMs: true,
        roomsListed: true,
        roomsDetailed: true,
        errorCode: true,
        errorMessage: true,
      },
    }),
    prisma.room.count(),
    prisma.room.count({ where: { detailCapturedAt: { not: null } } }),
    prisma.collectorRun.findFirst({
      where: { status: 'succeeded' },
      orderBy: { startedAt: 'desc' },
      select: { finishedAt: true },
    }),
  ]);
  return c.json({
    items,
    rooms: { total: roomCount, detailed: detailedCount },
    lastSucceededAt: lastSucceeded?.finishedAt ?? null,
  });
});

adminAssistantCollectorRoutes.patch(`${BASE}/settings`, async (c) => {
  const body = await parseBody(Settings, c.req.json());
  const before = await readCollectorSettings(prisma);
  await prisma.$transaction(async (tx) => {
    for (const [field, key] of Object.entries(COLLECTOR_SETTING_KEYS)) {
      const value = String(body[field as keyof typeof body]);
      await tx.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
    }
    await audit(c, tx, {
      event: 'assistant.collector_settings_updated',
      targetType: 'app_setting',
      targetId: 'collector',
      payloadBefore: { ...before },
      payloadAfter: body,
    });
  });
  return c.json(body);
});

adminAssistantCollectorRoutes.post(`${BASE}/accounts`, async (c) => {
  const body = await parseBody(AccountCreate, c.req.json());
  const key = credentialsKey();
  const casinoUrl = casinoOrigin(body.casinoUrl);
  const admin = c.get('admin');
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.collectorAccount.create({
      data: {
        label: body.label,
        casinoUrl,
        accountEnc: encryptCredential(body.account, key),
        passwordEnc: encryptCredential(body.password, key),
        enabled: body.enabled,
        createdByAdminUserId: admin.id,
      },
    });
    await audit(c, tx, {
      event: 'assistant.collector_account_created',
      targetType: 'collector_account',
      targetId: created.id,
      payloadAfter: { label: created.label, casinoUrl, account: maskAccount(body.account), enabled: created.enabled },
    });
    return created;
  });
  return c.json(present(row, key), 201);
});

adminAssistantCollectorRoutes.patch(`${BASE}/accounts/:id`, async (c) => {
  const body = await parseBody(AccountUpdate, c.req.json());
  const id = c.req.param('id');
  const existing = await prisma.collectorAccount.findUnique({ where: { id } });
  if (!existing) throw new AppError('COLLECTOR_ACCOUNT_NOT_FOUND', 'collector account not found', 404);

  // 換網域時必須重新輸入密碼：否則可把網址改成自己的主機，讓 collector 把已儲存的密碼送過去
  const casinoUrl = body.casinoUrl === undefined ? undefined : casinoOrigin(body.casinoUrl);
  if (casinoUrl !== undefined && casinoUrl !== existing.casinoUrl && body.password === undefined) {
    throw new AppError('COLLECTOR_PASSWORD_REQUIRED', 'password is required when changing casinoUrl', 400);
  }

  const changesSecret = body.account !== undefined || body.password !== undefined;
  const key = changesSecret ? credentialsKey() : null;
  const data: Partial<Pick<CollectorAccount, 'label' | 'casinoUrl' | 'accountEnc' | 'passwordEnc' | 'enabled'>> = {};
  if (body.label !== undefined) data.label = body.label;
  if (casinoUrl !== undefined) data.casinoUrl = casinoUrl;
  if (body.enabled !== undefined) data.enabled = body.enabled;
  if (key && body.account !== undefined) data.accountEnc = encryptCredential(body.account, key);
  if (key && body.password !== undefined) data.passwordEnc = encryptCredential(body.password, key);

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.collectorAccount.update({ where: { id }, data });
    await audit(c, tx, {
      event: 'assistant.collector_account_updated',
      targetType: 'collector_account',
      targetId: id,
      payloadBefore: { label: existing.label, casinoUrl: existing.casinoUrl, enabled: existing.enabled },
      payloadAfter: {
        label: updated.label,
        casinoUrl: updated.casinoUrl,
        enabled: updated.enabled,
        accountChanged: body.account !== undefined,
        passwordChanged: body.password !== undefined,
      },
    });
    return updated;
  });
  return c.json(present(row, key ?? optionalKey()));
});

adminAssistantCollectorRoutes.delete(`${BASE}/accounts/:id`, async (c) => {
  const id = c.req.param('id');
  const existing = await prisma.collectorAccount.findUnique({ where: { id } });
  if (!existing) throw new AppError('COLLECTOR_ACCOUNT_NOT_FOUND', 'collector account not found', 404);
  await prisma.$transaction(async (tx) => {
    await tx.collectorAccount.delete({ where: { id } });
    await audit(c, tx, {
      event: 'assistant.collector_account_deleted',
      targetType: 'collector_account',
      targetId: id,
      payloadBefore: { label: existing.label, casinoUrl: existing.casinoUrl, enabled: existing.enabled },
    });
  });
  return c.json({ ok: true });
});
