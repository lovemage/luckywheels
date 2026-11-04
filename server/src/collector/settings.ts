import type { PrismaClient } from '@prisma/client';
import { decryptCredential, parseCredentialsKey } from '../assistant/credentials.js';
import { CollectorError, type Credentials } from './errors.js';

// collector 的執行設定與帳號來源。設定在 AppSetting（後台可改），讀不到或格式錯誤時用預設值。

export interface CollectorSettings {
  intervalMinutes: number;
  detailBatchSize: number;
}

export const COLLECTOR_SETTING_DEFAULTS: CollectorSettings = { intervalMinutes: 10, detailBatchSize: 1000 };

export const COLLECTOR_SETTING_KEYS = {
  intervalMinutes: 'atgCollectIntervalMinutes',
  detailBatchSize: 'atgDetailBatchSize',
} as const;

export async function readCollectorSettings(prisma: PrismaClient): Promise<CollectorSettings> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: Object.values(COLLECTOR_SETTING_KEYS) } } });
  const get = (key: string, fallback: number, min: number) => {
    const n = Number(rows.find((r) => r.key === key)?.value);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
  };
  return {
    intervalMinutes: get(COLLECTOR_SETTING_KEYS.intervalMinutes, COLLECTOR_SETTING_DEFAULTS.intervalMinutes, 1),
    detailBatchSize: get(COLLECTOR_SETTING_KEYS.detailBatchSize, COLLECTOR_SETTING_DEFAULTS.detailBatchSize, 0),
  };
}

export interface LoadedCredentials extends Credentials {
  /** 來自 DB 時為 CollectorAccount.id，來自環境變數時為 null */
  accountId: string | null;
}

/**
 * 娛樂城網址只接受 https 且不含帳密（user:pass@host），只回傳 origin。
 * 錯誤訊息不帶原始字串：會寫進 CollectorRun.errorMessage 與後台可見的 lastError。
 */
export function normalizeCasinoUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CollectorError('CREDENTIALS_INVALID', '娛樂城網址格式錯誤');
  }
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new CollectorError('CREDENTIALS_INVALID', '娛樂城網址必須是 https，且不可包含帳號密碼');
  }
  return url.origin;
}

/**
 * 優先使用後台設定的帳號（最近更新的 enabled 帳號）；DB 沒有時才用環境變數（本機開發）。
 * DB 有帳號卻無法解密（金鑰未設定或不符）時直接報 CREDENTIALS_INVALID，不改用環境變數，避免默默用錯帳號。
 */
export async function loadCredentials(prisma: PrismaClient, env = process.env): Promise<LoadedCredentials | null> {
  const row = await prisma.collectorAccount.findFirst({ where: { enabled: true }, orderBy: { updatedAt: 'desc' } });
  if (row) {
    let account: string;
    let password: string;
    try {
      const key = parseCredentialsKey(env.COLLECTOR_CREDENTIALS_KEY);
      account = decryptCredential(row.accountEnc, key);
      password = decryptCredential(row.passwordEnc, key);
    } catch {
      throw new CollectorError('CREDENTIALS_INVALID', '無法解密採集帳號：COLLECTOR_CREDENTIALS_KEY 未設定或與儲存時不同');
    }
    return { accountId: row.id, casinoUrl: normalizeCasinoUrl(row.casinoUrl), account, password };
  }
  const strip = (v: string | undefined) => v?.trim().replace(/^['"]|['"]$/g, '');
  const casinoUrl = strip(env.ATG_COLLECTOR_CASINO_URL);
  const account = strip(env.ATG_COLLECTOR_ACCOUNT);
  const password = strip(env.ATG_COLLECTOR_PASSWORD);
  return casinoUrl && account && password
    ? { accountId: null, casinoUrl: normalizeCasinoUrl(casinoUrl), account, password }
    : null;
}
