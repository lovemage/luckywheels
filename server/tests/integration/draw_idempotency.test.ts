import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string, key?: string) {
  const t = await signSession({ userId: id });
  const h: Record<string, string> = { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
  if (key) h['idempotency-key'] = key;
  return h;
}

describe('POST /api/draw — idempotency (Redemption-scoped)', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('serial replay (single): same key, same user → one Redemption, single deduction', async () => {
    const u = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'abc-123');
    const r1 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);
    expect(b1.redemption.code).toBe(b2.redemption.code);
    expect(b1.draws[0].drawLogId).toBe(b2.draws[0].drawLogId);

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  }, 30000);

  it('serial replay (multi): one Redemption with 10 children, replay returns same set', async () => {
    const u = await createUser({ points: 60 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'multi-1');
    const r1 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'multi' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'multi' }) });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);
    expect(b1.draws).toHaveLength(10);
    expect(b2.draws).toHaveLength(10);
    expect(b1.draws.map((d: { drawLogId: string }) => d.drawLogId).sort()).toEqual(
      b2.draws.map((d: { drawLogId: string }) => d.drawLogId).sort(),
    );

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(10);   // exactly 10, not 20
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(12);  // 60 - 48
  }, 30000);

  it('cross-user same key: each user gets their own Redemption (ownership check)', async () => {
    const u1 = await createUser({ points: 50 });
    const u2 = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r1 = await app.request('/api/draw', { method: 'POST', headers: await H(u1.id, 'shared'), body: JSON.stringify({ tier: 'single' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: await H(u2.id, 'shared'), body: JSON.stringify({ tier: 'single' }) });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).not.toBe(b2.redemption.id);
    expect(b1.redemption.code).not.toBe(b2.redemption.code);
    expect(await prisma.redemption.count()).toBe(2);
  }, 30000);

  it('concurrent replay: two simultaneous requests with same key → exactly one deduction', async () => {
    const u = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'race-1');
    const [r1, r2] = await Promise.all([
      app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) }),
      app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 200]);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  }, 30000);
});
