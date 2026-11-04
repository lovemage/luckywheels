import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// CollectorAccount 的帳號／密碼加密（AES-256-GCM）。
// 金鑰來自環境變數 COLLECTOR_CREDENTIALS_KEY（32 bytes，base64 或 64 字元 hex），只放在
// luckywheels 與 atg-collector 兩個服務；DB 裡只有密文。由呼叫端傳入金鑰，因為 collector
// 不載入會員站的 env.ts。
//
// 密文格式：v1:<iv base64>:<authTag base64>:<ciphertext base64>

const VERSION = 'v1';

export function parseCredentialsKey(raw: string | undefined): Buffer {
  if (!raw) throw new Error('COLLECTOR_CREDENTIALS_KEY is not set');
  const key = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('COLLECTOR_CREDENTIALS_KEY must be 32 bytes (base64 or 64-char hex)');
  return key;
}

export function encryptCredential(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64'), cipher.getAuthTag().toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptCredential(stored: string, key: Buffer): string {
  const [version, iv, tag, ciphertext] = stored.split(':');
  if (version !== VERSION || !iv || !tag || ciphertext === undefined) {
    throw new Error('Unsupported credential format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
