import { randomBytes } from 'node:crypto';

// Android App 的 LINE 登入交接碼。
// App 用 Chrome Custom Tab 走 LINE OAuth（才能用 LINE App 一鍵登入），但 Custom Tab 與 App 內的
// WebView 不共用 cookie，所以登入成功後不直接發 session，而是發一個交接碼帶回 App，
// 由 App 的 WebView 呼叫 /api/app/redeem 換成自己的 session cookie。
//
// 交接碼：32 bytes 隨機值、只能用一次、2 分鐘內有效。存在記憶體即可：
// 會員只會在幾秒內使用；服務重啟造成的失效，只會讓會員重按一次登入。

export const HANDOFF_TTL_MS = 2 * 60_000;
const MAX_PENDING = 5000;

interface Pending {
  userId: string;
  expiresAt: number;
}

const pending = new Map<string, Pending>();

function sweep(now: number): void {
  for (const [code, p] of pending) if (p.expiresAt <= now) pending.delete(code);
}

export function issueHandoffCode(userId: string, now = Date.now()): string {
  sweep(now);
  // 防止被大量請求撐爆記憶體：超過上限時丟掉最舊的（Map 依插入順序）
  while (pending.size >= MAX_PENDING) {
    const oldest = pending.keys().next().value;
    if (oldest === undefined) break;
    pending.delete(oldest);
  }
  const code = randomBytes(32).toString('base64url');
  pending.set(code, { userId, expiresAt: now + HANDOFF_TTL_MS });
  return code;
}

/** 取出並作廢交接碼；不存在、已用過或已過期都回 null */
export function redeemHandoffCode(code: string, now = Date.now()): string | null {
  const p = pending.get(code);
  if (!p) return null;
  pending.delete(code);
  return p.expiresAt > now ? p.userId : null;
}

/** 測試用 */
export function resetHandoffCodes(): void {
  pending.clear();
}
