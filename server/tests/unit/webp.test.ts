import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { toWebp } from '../../src/storage/webp.js';

async function png(width: number, height: number): Promise<Uint8Array> {
  const buf = await sharp({ create: { width, height, channels: 3, background: '#d4a017' } }).png().toBuffer();
  return new Uint8Array(buf);
}

describe('toWebp', () => {
  it('converts to webp', async () => {
    const out = await toWebp(await png(400, 600));
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(400);
  });

  it('shrinks oversized images to fit 1080x1920 without distortion', async () => {
    const meta = await sharp(await toWebp(await png(2160, 2160))).metadata();
    expect(meta.width).toBe(1080);
    expect(meta.height).toBe(1080);
  });

  it('rejects non-image bytes', async () => {
    await expect(toWebp(new TextEncoder().encode('not an image'))).rejects.toThrow();
  });
});
