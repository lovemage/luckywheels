import { randomBytes } from 'node:crypto';

// Crockford Base32 alphabet (excludes I, L, O, U to avoid look-alike confusion)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function generateRedemptionCode(): string {
  // 12 chars × 5 bits per char = 60 bits of entropy; randomBytes(15) gives 120 bits, we use 8
  const buf = randomBytes(12);
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) {
    chars.push(ALPHABET[buf[i]! % 32]!);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export function isValidRedemptionCode(s: string): boolean {
  return CODE_RE.test(s);
}
