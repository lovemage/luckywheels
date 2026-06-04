import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — concurrency', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('stock race: 5 concurrent draws → no 500s, exactly stock-many win, rest fall back to consolation', async () => {
    const limited = await createPrize({ weight: 1_000_000, cashAmount: 100, stock: 2 });
    const consolation = await createPrize({ weight: 1, cashAmount: 0, isConsolation: true });

    const users = await Promise.all(Array.from({ length: 5 }, () => createUser({ points: 50 })));
    const responses = await Promise.all(users.map(async (u) =>
      app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) }),
    ));

    for (const r of responses) expect(r.status).toBe(200);

    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const b of bodies) {
      expect(b.draws?.[0]?.prize?.id).toBeDefined();   // every response carries a sub-draw with prize
      expect(b.points).toBe(44);                        // 50 - 6, no double-charge
    }

    const winnersOfLimited = bodies.filter((b) => b.draws[0].prize.id === limited.id);
    const winnersOfConsolation = bodies.filter((b) => b.draws[0].prize.id === consolation.id);
    expect(winnersOfLimited.length).toBe(2);            // stock cap = exactly 2
    expect(winnersOfConsolation.length).toBe(3);        // rest fell back to consolation
    expect(winnersOfLimited.length + winnersOfConsolation.length).toBe(5);

    const finalLimited = await prisma.prize.findUnique({ where: { id: limited.id } });
    expect(finalLimited?.stock).toBe(0);                // exhausted, not negative
    expect(await prisma.drawLog.count()).toBe(5);
    expect(await prisma.redemption.count()).toBe(5);    // one Redemption per request
  }, 60000);

  it('system-totals race: 10 concurrent draws preserve totalDrawCount / totalPayoutAmount / totalPointsBurned', async () => {
    await createPrize({ weight: 1, cashAmount: 100 });
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser({ points: 50 })));
    const responses = await Promise.all(users.map(async (u) =>
      app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) }),
    ));
    for (const r of responses) expect(r.status).toBe(200);

    // Atomic under FOR UPDATE; each draw added (drawCount +1, payout +100, burned +6)
    const totalsDraw   = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalDrawCount } });
    const totalsPayout = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalPayoutAmount } });
    const totalsBurn   = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalPointsBurned } });
    expect(Number(totalsDraw?.value)).toBe(10);
    expect(Number(totalsPayout?.value)).toBe(1000);
    expect(Number(totalsBurn?.value)).toBe(60);
  }, 60000);

  it('multi-tier sub-draw stock race within a single batch: stock cap on shared prize', async () => {
    // One user, tier=multi, single prize with stock=3. Multi runs 10 sub-picks against it;
    // expectation: first 3 win the prize, sub-draws 4..10 fall back to consolation.
    await createPrize({ weight: 1_000_000, cashAmount: 100, stock: 3 });
    const consolation = await createPrize({ weight: 1, isConsolation: true });
    const u = await createUser({ points: 60 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });
    expect(r.status).toBe(200);
    const body = await r.json();
    const drewLimited = body.draws.filter((d: { prize: { id: string } }) => d.prize.id !== consolation.id).length;
    const drewConsolation = body.draws.filter((d: { prize: { id: string } }) => d.prize.id === consolation.id).length;
    expect(drewLimited).toBeLessThanOrEqual(3);
    expect(drewLimited + drewConsolation).toBe(10);
  }, 30000);
});
