import type { MiddlewareHandler } from 'hono';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { requireMemberAssistant } from './preview.js';

// 會員端助手 API 的共同守門：旗標關閉（或預覽模式下沒有預覽 cookie）時一律 404；會員條件與抽獎相同（黑名單 → 未完成綁定 → 待審核）。
// 付費資料（遊戲、房間、推薦、訊號）另外要求使用期限內（requireAssistantPass）；兌換與 /me 不需要。

const requireActiveMember: MiddlewareHandler = async (c, next) => {
  const user = c.get('user');
  if (user.accountType === 'blacklisted') throw new AppError('USER_BLACKLISTED', 'this account is suspended', 403);
  if (!user.nickname || !user.entertainmentMemberCode) {
    throw new AppError('ONBOARDING_REQUIRED', 'must complete onboarding first', 403);
  }
  if (user.accountType === 'pending') throw new AppError('ACCOUNT_PENDING_APPROVAL', 'member approval is pending', 403);
  await next();
};

export const requireAssistantMember = [requireMemberAssistant, requireUser, requireActiveMember] as const;

/** 未開通或已過期 → 403 ASSISTANT_EXPIRED（前端導向兌換頁） */
export const requireAssistantPass: MiddlewareHandler = async (c, next) => {
  const pass = await prisma.assistantPass.findUnique({ where: { userId: c.get('user').id }, select: { expiresAt: true } });
  if (!pass || pass.expiresAt <= new Date()) {
    throw new AppError('ASSISTANT_EXPIRED', 'assistant pass is not active', 403);
  }
  await next();
};
