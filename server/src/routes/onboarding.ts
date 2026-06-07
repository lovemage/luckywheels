import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';

const NicknameSchema = z.string().min(2).max(12).refine((v) => v.trim().length > 0, {
  message: 'nickname must contain non-whitespace',
});
const CodeSchema = z.string().min(1);

const BodySchema = z.object({
  nickname: NicknameSchema,
  code: CodeSchema,
});

export const onboardingRoutes = new Hono();

onboardingRoutes.post('/api/onboarding/profile', requireUser, async (c) => {
  const user = c.get('user');

  let body: { nickname: string; code: string };
  try {
    body = BodySchema.parse(await c.req.json());
  } catch (err) {
    const issues = (err as z.ZodError)?.issues ?? [];
    const failedFields = new Set(issues.map((i) => i.path[0]));
    if (failedFields.has('nickname')) {
      throw new AppError('NICKNAME_INVALID', 'nickname must be 2–12 chars and not all whitespace', 400);
    }
    throw new AppError('ENTERTAINMENT_CODE_INVALID', 'code must not be empty', 400);
  }

  if (user.entertainmentMemberCode && user.entertainmentMemberCode !== body.code) {
    throw new AppError('ENTERTAINMENT_CODE_ALREADY_BOUND', 'user already bound a different code', 409);
  }

  const isFirstCodeBind = user.entertainmentMemberCode === null;

  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: body.nickname,
        entertainmentMemberCode: body.code,
        entertainmentCodeBoundAt: isFirstCodeBind ? new Date() : undefined,
        ...(isFirstCodeBind && user.accountType === 'verified' ? { accountType: 'pending' as const } : {}),
      },
    });
    return c.json({
      nickname: updated.nickname,
      entertainmentMemberCode: updated.entertainmentMemberCode,
      accountType: updated.accountType,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError('ENTERTAINMENT_CODE_TAKEN', 'this code is already bound to another account', 409);
    }
    throw err;
  }
});
