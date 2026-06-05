import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import {
  createUser, createPrize, createRedemption, createDrawLog, seedDefaultSettings,
} from '../../helpers/factories.js';
import { SETTINGS_KEYS } from '../../../prisma/seed.js';

const validBody = {
  rankLabel: '七獎',
  name: '迷你獎',
  description: 'tiny',
  cashAmount: 10,
  weight: 5,
  stock: 99,
  segmentColor: '#abcdef',
};

describe('admin Prize CRUD', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDefaultSettings();
  });

  it('401 without session on list', async () => {
    const r = await app.request('/api/admin/prizes');
    expect(r.status).toBe(401);
  });

  it('list returns empty array when DB has no prizes', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/prizes', {
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(200);
    const json = await r.json() as { items: unknown[] };
    expect(json.items).toEqual([]);
  });

  it('list returns prizes ordered by wheelPosition asc', async () => {
    const admin = await createAdmin();
    // Create in a non-positional order; wheelPosition should drive the result order.
    const a = await prisma.prize.create({ data: { rankLabel: 'A', name: 'a', wheelPosition: 2, segmentColor: '#111111' } });
    const b = await prisma.prize.create({ data: { rankLabel: 'B', name: 'b', wheelPosition: 0, segmentColor: '#222222' } });
    const cc = await prisma.prize.create({ data: { rankLabel: 'C', name: 'c', wheelPosition: 1, segmentColor: '#333333' } });
    const r = await app.request('/api/admin/prizes', {
      headers: await adminHeaders(admin.id, admin.email),
    });
    const json = await r.json() as { items: { id: string }[] };
    expect(json.items.map((p) => p.id)).toEqual([b.id, cc.id, a.id]);
  });

  it('list includes disabled prizes', async () => {
    const admin = await createAdmin();
    await prisma.prize.create({ data: { rankLabel: 'A', name: 'a', enabled: false, segmentColor: '#111111' } });
    const r = await app.request('/api/admin/prizes', {
      headers: await adminHeaders(admin.id, admin.email),
    });
    const json = await r.json() as { items: { enabled: boolean }[] };
    expect(json.items).toHaveLength(1);
    expect(json.items[0]?.enabled).toBe(false);
  });

  it('create works, returns the row, writes prize.created audit', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/prizes', {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    expect(r.status).toBe(200);
    const row = await r.json() as { id: string; rankLabel: string; segmentColor: string };
    expect(row.rankLabel).toBe('七獎');
    expect(row.segmentColor).toBe('#abcdef');
    const inDb = await prisma.prize.findUnique({ where: { id: row.id } });
    expect(inDb).not.toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'prize.created' } });
    expect(log.targetId).toBe(row.id);
  });

  it('partial update only changes specified field', async () => {
    const admin = await createAdmin();
    const p = await createPrize({ cashAmount: 500, weight: 12 });
    const r = await app.request(`/api/admin/prizes/${p.id}`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'changed-only' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.prize.findUnique({ where: { id: p.id } });
    expect(refreshed!.name).toBe('changed-only');
    expect(refreshed!.cashAmount).toBe(500);
    expect(refreshed!.weight).toBe(12);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'prize.updated' } });
    expect(log.payloadAfter).toMatchObject({ name: 'changed-only' });
    expect(log.payloadBefore).toMatchObject({ name: 'test prize' });
  });

  it('delete refused when DrawLog references prize → 422 PRIZE_HAS_DRAW_LOGS, still in DB', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const prize = await createPrize();
    const red = await createRedemption({ userId: user.id });
    await createDrawLog({ userId: user.id, redemptionId: red.id, prizeId: prize.id });
    const r = await app.request(`/api/admin/prizes/${prize.id}`, {
      method: 'DELETE',
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('PRIZE_HAS_DRAW_LOGS');
    expect(await prisma.prize.findUnique({ where: { id: prize.id } })).not.toBeNull();
  });

  it('delete works when no DrawLog references the prize', async () => {
    const admin = await createAdmin();
    const prize = await createPrize();
    const r = await app.request(`/api/admin/prizes/${prize.id}`, {
      method: 'DELETE',
      headers: await adminHeaders(admin.id, admin.email),
    });
    expect(r.status).toBe(200);
    expect(await prisma.prize.findUnique({ where: { id: prize.id } })).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'prize.deleted' } });
    expect(log.targetId).toBe(prize.id);
  });

  it('setting isConsolation=true on A clears it on B and updates app_settings.consolationPrizeId', async () => {
    const admin = await createAdmin();
    const b = await createPrize({ isConsolation: true });
    // Mirror the seeded settings pointer to b so we can observe it move.
    await prisma.appSetting.update({
      where: { key: SETTINGS_KEYS.consolationPrizeId },
      data: { value: b.id },
    });
    const a = await createPrize({ isConsolation: false });

    const r = await app.request(`/api/admin/prizes/${a.id}`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ isConsolation: true }),
    });
    expect(r.status).toBe(200);
    const refreshedA = await prisma.prize.findUnique({ where: { id: a.id } });
    const refreshedB = await prisma.prize.findUnique({ where: { id: b.id } });
    expect(refreshedA!.isConsolation).toBe(true);
    expect(refreshedB!.isConsolation).toBe(false);
    const setting = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.consolationPrizeId } });
    expect(setting!.value).toBe(a.id);
  });

  it('reorder updates wheelPosition by array index; rejects unknown id', async () => {
    const admin = await createAdmin();
    const p1 = await createPrize();
    const p2 = await createPrize();
    const p3 = await createPrize();
    const reversed = [p3.id, p2.id, p1.id];
    const r = await app.request('/api/admin/prizes/reorder', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ ids: reversed }),
    });
    expect(r.status).toBe(200);
    const after = await prisma.prize.findMany({ orderBy: { wheelPosition: 'asc' } });
    expect(after.map((p) => p.id)).toEqual(reversed);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'prize.reordered' } });
    expect(log.payloadAfter).toMatchObject({ ids: reversed });

    const bad = await app.request('/api/admin/prizes/reorder', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ ids: [p1.id, 'nonexistent-id-xyz'] }),
    });
    expect(bad.status).toBe(404);
    expect((await bad.json()).error.code).toBe('PRIZE_NOT_FOUND');
  });

  it('rejects invalid hex color → 400', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/prizes', {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, segmentColor: 'red' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('PRIZE_BODY_INVALID');
  });

  it('rejects negative cashAmount → 400', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/prizes', {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, cashAmount: -10 }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('PRIZE_BODY_INVALID');
  });
});
