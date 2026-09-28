import sharp from 'sharp';

// Ad creatives are shown full-screen on phones: cap to a portrait phone canvas,
// never upscale, keep GIF animation, and honour EXIF rotation from phone photos.
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 1920;
const QUALITY = 82;

export async function toWebp(input: Uint8Array): Promise<Uint8Array> {
  const out = await sharp(input, { animated: true, limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: MAX_WIDTH, height: MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 4 })
    .toBuffer();
  return new Uint8Array(out);
}
