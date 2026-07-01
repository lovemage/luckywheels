import { Hono } from 'hono';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { SETTINGS_KEYS } from '../../../prisma/seed.js';

export const adminPrizesRoutes = new Hono();
const requirePrizesNav = requireAdminNav('prizes');

const CreateBody = z.object({
  rankLabel: z.string().min(1).max(20),
  name: z.string().min(1).max(40),
  description: z.string().max(200).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  cashAmount: z.number().int().min(0),
  weight: z.number().min(0),
  stock: z.number().int().min(0),
  segmentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isConsolation: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
const UpdateBody = CreateBody.partial();
const ReorderBody = z.object({ ids: z.array(z.string()).min(1) });

// --- helpers ---

async function clearOtherConsolation(
  tx: Prisma.TransactionClient,
  exceptId: string | null,
): Promise<void> {
  await tx.prize.updateMany({
    where: { isConsolation: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
    data: { isConsolation: false },
  });
}

async function setConsolationSetting(
  tx: Prisma.TransactionClient,
  value: string,
): Promise<void> {
  await tx.appSetting.upsert({
    where: { key: SETTINGS_KEYS.consolationPrizeId },
    create: { key: SETTINGS_KEYS.consolationPrizeId, value },
    update: { value },
  });
}

// --- routes ---

adminPrizesRoutes.get('/api/admin/prizes', ...requirePrizesNav, async (c) => {
  const items = await prisma.prize.findMany({
    orderBy: [{ wheelPosition: 'asc' }, { createdAt: 'asc' }],
  });
  return c.json({ items });
});

// IMPORTANT: /reorder must be registered BEFORE /:id so Hono matches the literal
// path first (otherwise PATCH /api/admin/prizes/reorder hits the :id handler).
adminPrizesRoutes.patch('/api/admin/prizes/reorder', ...requirePrizesNav, async (c) => {
  let body: z.infer<typeof ReorderBody>;
  try {
    body = ReorderBody.parse(await c.req.json());
  } catch {
    throw new AppError('PRIZE_REORDER_BODY_INVALID', 'invalid body', 400);
  }

  await prisma.$transaction(async (tx) => {
    const existing = await tx.prize.findMany({
      where: { id: { in: body.ids } },
      select: { id: true },
    });
    const known = new Set(existing.map((p) => p.id));
    for (const id of body.ids) {
      if (!known.has(id)) {
        throw new AppError('PRIZE_NOT_FOUND', `unknown prize id ${id}`, 404);
      }
    }
    for (let i = 0; i < body.ids.length; i++) {
      const id = body.ids[i]!;
      await tx.prize.update({ where: { id }, data: { wheelPosition: i } });
    }
    await audit(c, tx, {
      event: 'prize.reordered',
      targetType: 'prize',
      payloadAfter: { ids: body.ids },
    });
  });

  return c.json({ ok: true });
});

adminPrizesRoutes.get('/api/admin/prizes/:id', ...requirePrizesNav, async (c) => {
  const id = c.req.param('id');
  const prize = await prisma.prize.findUnique({ where: { id } });
  if (!prize) throw new AppError('PRIZE_NOT_FOUND', 'no such prize', 404);
  return c.json(prize);
});

adminPrizesRoutes.post('/api/admin/prizes', ...requirePrizesNav, async (c) => {
  let body: z.infer<typeof CreateBody>;
  try {
    body = CreateBody.parse(await c.req.json());
  } catch {
    throw new AppError('PRIZE_BODY_INVALID', 'invalid body', 400);
  }

  const created = await prisma.$transaction(async (tx) => {
    // Use the current max wheelPosition + 1 so new prizes append visually.
    const max = await tx.prize.aggregate({ _max: { wheelPosition: true } });
    const nextPos = (max._max.wheelPosition ?? -1) + 1;

    const willBeConsolation = body.isConsolation === true;
    if (willBeConsolation) {
      await clearOtherConsolation(tx, null);
    }

    const prize = await tx.prize.create({
      data: {
        rankLabel: body.rankLabel,
        name: body.name,
        description: body.description ?? null,
        imageUrl: body.imageUrl ?? null,
        cashAmount: body.cashAmount,
        weight: body.weight,
        stock: body.stock,
        segmentColor: body.segmentColor,
        ...(body.textColor !== undefined ? { textColor: body.textColor } : {}),
        ...(body.isConsolation !== undefined ? { isConsolation: body.isConsolation } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        wheelPosition: nextPos,
      },
    });

    if (willBeConsolation) {
      await setConsolationSetting(tx, prize.id);
    }

    await audit(c, tx, {
      event: 'prize.created',
      targetType: 'prize',
      targetId: prize.id,
      payloadAfter: prize as unknown as Prisma.JsonValue,
    });

    return prize;
  });

  return c.json(created);
});

adminPrizesRoutes.patch('/api/admin/prizes/:id', ...requirePrizesNav, async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof UpdateBody>;
  try {
    body = UpdateBody.parse(await c.req.json());
  } catch {
    throw new AppError('PRIZE_BODY_INVALID', 'invalid body', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    const before = await tx.prize.findUnique({ where: { id } });
    if (!before) throw new AppError('PRIZE_NOT_FOUND', 'no such prize', 404);

    // Compute only the keys that actually change so audit payloads stay small.
    const data: Prisma.PrizeUpdateInput = {};
    const changedBefore: Record<string, unknown> = {};
    const changedAfter: Record<string, unknown> = {};
    function maybe<K extends keyof typeof body>(key: K): void {
      const next = body[key];
      if (next === undefined) return;
      const cur = (before as unknown as Record<string, unknown>)[key as string];
      if (cur === next) return;
      (data as Record<string, unknown>)[key as string] = next;
      changedBefore[key as string] = cur;
      changedAfter[key as string] = next;
    }
    maybe('rankLabel'); maybe('name'); maybe('description'); maybe('imageUrl');
    maybe('cashAmount'); maybe('weight'); maybe('stock');
    maybe('segmentColor'); maybe('textColor');
    maybe('isConsolation'); maybe('enabled');

    // Consolation handling: enforce single-consolation invariant + settings link.
    const turningOn = body.isConsolation === true && before.isConsolation === false;
    const turningOff = body.isConsolation === false && before.isConsolation === true;
    if (turningOn) {
      await clearOtherConsolation(tx, id);
    }

    const after = Object.keys(data).length > 0
      ? await tx.prize.update({ where: { id }, data })
      : before;

    if (turningOn) {
      await setConsolationSetting(tx, id);
    } else if (turningOff) {
      await setConsolationSetting(tx, '');
    }

    if (Object.keys(changedAfter).length > 0) {
      await audit(c, tx, {
        event: 'prize.updated',
        targetType: 'prize',
        targetId: id,
        payloadBefore: changedBefore as Prisma.JsonValue,
        payloadAfter: changedAfter as Prisma.JsonValue,
      });
    }

    return after;
  });

  return c.json(updated);
});

adminPrizesRoutes.delete('/api/admin/prizes/:id', ...requirePrizesNav, async (c) => {
  const id = c.req.param('id');
  await prisma.$transaction(async (tx) => {
    const before = await tx.prize.findUnique({ where: { id } });
    if (!before) throw new AppError('PRIZE_NOT_FOUND', 'no such prize', 404);
    const refs = await tx.drawLog.count({ where: { prizeId: id } });
    if (refs > 0) {
      throw new AppError(
        'PRIZE_HAS_DRAW_LOGS',
        'prize has draw history; disable it instead of deleting',
        422,
      );
    }
    await tx.prize.delete({ where: { id } });

    // If this prize was the consolation pointer, clear the setting too.
    if (before.isConsolation) {
      await setConsolationSetting(tx, '');
    }

    await audit(c, tx, {
      event: 'prize.deleted',
      targetType: 'prize',
      targetId: id,
      payloadBefore: before as unknown as Prisma.JsonValue,
    });
  });
  return c.json({ ok: true });
});
