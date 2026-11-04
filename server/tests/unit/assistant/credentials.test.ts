import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptCredential, encryptCredential, parseCredentialsKey } from '../../../src/assistant/credentials.js';

const key = randomBytes(32);

describe('collector credentials', () => {
  it('round-trips, including non-ASCII and symbols', () => {
    for (const plain of ['abc12345', 'p@ss#$ word', '密碼測試']) {
      expect(decryptCredential(encryptCredential(plain, key), key)).toBe(plain);
    }
  });

  it('uses a fresh IV each time', () => {
    expect(encryptCredential('same', key)).not.toBe(encryptCredential('same', key));
  });

  it('rejects a wrong key or tampered ciphertext', () => {
    const stored = encryptCredential('secret', key);
    expect(() => decryptCredential(stored, randomBytes(32))).toThrow();
    const parts = stored.split(':');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptCredential(parts.join(':'), key)).toThrow();
  });

  it('parses base64 and hex keys, rejects wrong length or missing', () => {
    expect(parseCredentialsKey(key.toString('base64'))).toEqual(key);
    expect(parseCredentialsKey(key.toString('hex'))).toEqual(key);
    expect(() => parseCredentialsKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
    expect(() => parseCredentialsKey(undefined)).toThrow(/not set/);
  });
});
