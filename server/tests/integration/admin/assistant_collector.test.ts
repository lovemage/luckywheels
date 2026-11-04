import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { decryptCredential, parseCredentialsKey } from '../../../src/assistant/credentials.js';
import { loadCredentials, readCollectorSettings } from '../../../src/collector/settings.js';
import { maskAccount } from '../../../src/admin/routes/assistant-collector.js';

const BASE = '/api/admin/assistant/collector';
const ACCOUNT = 'collector-user-01';
const PASSWORD = 'very-secret-pass';

async function headers() {
  const admin = await createAdmin();
  return adminHeaders(admin.id, admin.email);
}

async function call(path: string, h: Record<string, string>, method = 'GET', body?: unknown) {
  return app.request(`${BASE}${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
}

async function createAccount(h: Record<string, string>, overrides: Record<string, unknown> = {}) {
  return call('/accounts', h, 'POST', {
    label: '主要帳號',
    casinoUrl: 'https://casino.example/sty4_home.php?invite_code=x',
    account: ACCOUNT,
    password: PASSWORD,
    ...overrides,
  });
}

describe('admin assistant collector', { timeout: 60_000 }, () => {
  const saved = { flag: process.env.DATA_ASSISTANT_ENABLED, key: process.env.COLLECTOR_CREDENTIALS_KEY };

  beforeEach(async () => {
    await resetDb();
    process.env.DATA_ASSISTANT_ENABLED = 'true';
    process.env.COLLECTOR_CREDENTIALS_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    for (const [name, value] of [['DATA_ASSISTANT_ENABLED', saved.flag], ['COLLECTOR_CREDENTIALS_KEY', saved.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('is hidden when the feature flag is off, and /me reports the flag', async () => {
    const h = await headers();
    expect((await (await app.request('/api/admin/me', { headers: h })).json()).features).toEqual({ dataAssistant: true });
    process.env.DATA_ASSISTANT_ENABLED = 'false';
    expect((await call('', h)).status).toBe(404);
    expect((await (await app.request('/api/admin/me', { headers: h })).json()).features).toEqual({ dataAssistant: false });
  });

  it('requires the assistant nav permission', async () => {
    const sub = await prisma.adminUser.create({
      data: { email: 'sub@example.com', passwordHash: 'x', role: 'subadmin', isMain: false, allowedNavs: ['system'] },
    });
    const h = await adminHeaders(sub.id, sub.email);
    expect((await call('', h)).status).toBe(403);
    await prisma.adminUser.update({ where: { id: sub.id }, data: { allowedNavs: ['assistant'] } });
    expect((await call('', h)).status).toBe(200);
  });

  it('stores credentials encrypted and never returns or logs them', async () => {
    const h = await headers();
    const res = await createAccount(h);
    expect(res.status).toBe(201);
    const text = await res.text();
    expect(text).not.toContain(ACCOUNT);
    expect(text).not.toContain(PASSWORD);
    const created = JSON.parse(text);
    expect(created).toMatchObject({ casinoUrl: 'https://casino.example', accountMasked: 'co***01', enabled: true });

    const row = await prisma.collectorAccount.findUniqueOrThrow({ where: { id: created.id } });
    const key = parseCredentialsKey(process.env.COLLECTOR_CREDENTIALS_KEY);
    expect(decryptCredential(row.accountEnc, key)).toBe(ACCOUNT);
    expect(decryptCredential(row.passwordEnc, key)).toBe(PASSWORD);

    const list = await (await call('', h)).text();
    expect(list).not.toContain(PASSWORD);
    expect(JSON.parse(list)).toMatchObject({ keyConfigured: true, activeAccountId: created.id });

    const logs = JSON.stringify(await prisma.adminActionLog.findMany());
    expect(logs).toContain('assistant.collector_account_created');
    expect(logs).not.toContain(ACCOUNT);
    expect(logs).not.toContain(PASSWORD);

    // collector 讀得到後台設定的帳號
    expect(await loadCredentials(prisma)).toMatchObject({ accountId: created.id, account: ACCOUNT, password: PASSWORD });
  });

  it('updates the password alone without touching the account', async () => {
    const h = await headers();
    const { id } = await (await createAccount(h)).json();
    const res = await call(`/accounts/${id}`, h, 'PATCH', { password: 'new-pass' });
    expect(res.status).toBe(200);
    const creds = await loadCredentials(prisma);
    expect(creds).toMatchObject({ account: ACCOUNT, password: 'new-pass' });
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'assistant.collector_account_updated' } });
    expect(log.payloadAfter).toMatchObject({ accountChanged: false, passwordChanged: true });

    expect((await call(`/accounts/${id}`, h, 'PATCH', { enabled: false })).status).toBe(200);
    expect((await (await call('', h)).json()).activeAccountId).toBeNull();
    expect((await call(`/accounts/${id}`, h, 'DELETE')).status).toBe(200);
    expect(await prisma.collectorAccount.count()).toBe(0);
    expect((await call(`/accounts/${id}`, h, 'DELETE')).status).toBe(404);
  });

  it('requires the password again when the casino origin changes', async () => {
    const h = await headers();
    const { id } = await (await createAccount(h)).json();
    const moved = await call(`/accounts/${id}`, h, 'PATCH', { casinoUrl: 'https://attacker.example' });
    expect(moved.status).toBe(400);
    expect((await moved.json()).error.code).toBe('COLLECTOR_PASSWORD_REQUIRED');
    expect((await prisma.collectorAccount.findUniqueOrThrow({ where: { id } })).casinoUrl).toBe('https://casino.example');
    // 同網域（只換路徑）不需要密碼；換網域並附新密碼可以
    expect((await call(`/accounts/${id}`, h, 'PATCH', { casinoUrl: 'https://casino.example/other' })).status).toBe(200);
    const ok = await call(`/accounts/${id}`, h, 'PATCH', { casinoUrl: 'https://new.example', password: 'p2' });
    expect(ok.status).toBe(200);
    expect(await loadCredentials(prisma)).toMatchObject({ casinoUrl: 'https://new.example', password: 'p2' });
  });

  it('rejects bad input and a missing encryption key', async () => {
    const h = await headers();
    expect((await createAccount(h, { casinoUrl: 'http://casino.example' })).status).toBe(400);
    expect((await createAccount(h, { casinoUrl: 'https://u:p@casino.example' })).status).toBe(400);
    expect((await createAccount(h, { password: '' })).status).toBe(400);
    delete process.env.COLLECTOR_CREDENTIALS_KEY;
    const res = await createAccount(h);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('COLLECTOR_KEY_NOT_CONFIGURED');
    // 沒有金鑰時清單照常顯示，但無法解出遮罩帳號
    expect((await (await call('', h)).json()).keyConfigured).toBe(false);
  });

  it('edits collector settings with bounds', async () => {
    const h = await headers();
    expect((await call('/settings', h, 'PATCH', { intervalMinutes: 20, detailBatchSize: 800 })).status).toBe(200);
    expect(await readCollectorSettings(prisma)).toEqual({ intervalMinutes: 20, detailBatchSize: 800 });
    expect((await call('/settings', h, 'PATCH', { intervalMinutes: 1, detailBatchSize: 800 })).status).toBe(400);
    expect((await call('/settings', h, 'PATCH', { intervalMinutes: 20, detailBatchSize: 1.5 })).status).toBe(400);
    expect((await (await call('', h)).json()).settings).toEqual({ intervalMinutes: 20, detailBatchSize: 800 });
  });

  it('lists recent collector runs with room totals', async () => {
    const h = await headers();
    const provider = await prisma.gameProvider.create({ data: { code: 'atg', name: 'ATG' } });
    const game = await prisma.game.create({ data: { providerId: provider.id, code: 'golden-seth', name: '戰神賽特 II' } });
    await prisma.collectorRun.create({
      data: { gameId: game.id, status: 'succeeded', startedAt: new Date('2026-11-03T01:00:00Z'), finishedAt: new Date('2026-11-03T01:05:00Z'), roomsListed: 2 },
    });
    await prisma.collectorRun.create({
      data: { gameId: game.id, status: 'failed', startedAt: new Date('2026-11-03T02:00:00Z'), errorCode: 'LOGIN_FAILED' },
    });
    await prisma.room.createMany({
      data: [
        { gameId: game.id, roomNo: '001', sourceRoomId: 'a', detailCapturedAt: new Date() },
        { gameId: game.id, roomNo: '002', sourceRoomId: 'b' },
      ],
    });
    expect((await call('/runs?take=2.5', h)).status).toBe(200);
    const json = await (await call('/runs?take=5', h)).json();
    expect(json.items.map((r: { status: string }) => r.status)).toEqual(['failed', 'succeeded']);
    expect(json.rooms).toEqual({ total: 2, detailed: 1 });
    expect(json.lastSucceededAt).toBe('2026-11-03T01:05:00.000Z');
  });
});

describe('maskAccount', () => {
  it('keeps only a few characters', () => {
    expect(maskAccount('a')).toBe('a***');
    expect(maskAccount('abc')).toBe('a***c');
    expect(maskAccount('abcdef')).toBe('ab***ef');
  });
});
