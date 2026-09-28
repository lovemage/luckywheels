import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors.js';
import { prisma } from '../../db.js';
import { requireAnyAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { putObject } from '../../storage/bucket.js';
import { toWebp } from '../../storage/webp.js';

export const adminUploadsRoutes = new Hono();
const requireUploadNav = requireAnyAdminNav(['prizes', 'system']);

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
// Originals that get re-encoded (form field convert=webp) may be larger; the stored WebP is small.
const MAX_CONVERT_BYTES = 10 * 1024 * 1024; // 10 MB

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

adminUploadsRoutes.post('/api/admin/uploads', ...requireUploadNav, async (c) => {
  let form: Record<string, unknown>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new AppError('UPLOAD_NO_FILE', 'expected multipart/form-data with a `file` field', 400);
  }
  const file = form['file'];
  if (!(file instanceof File)) {
    throw new AppError('UPLOAD_NO_FILE', 'file field missing', 400);
  }
  const contentType = file.type || 'application/octet-stream';
  if (!ALLOWED_MIME.has(contentType)) {
    throw new AppError('UPLOAD_MIME_REJECTED', `mime ${contentType} not allowed`, 415);
  }
  const convert = form['convert'] === 'webp';
  const maxBytes = convert ? MAX_CONVERT_BYTES : MAX_BYTES;
  if (file.size > maxBytes) {
    throw new AppError('UPLOAD_TOO_LARGE', `file ${file.size} bytes exceeds ${maxBytes}`, 413);
  }

  let bytes: Uint8Array = new Uint8Array(await file.arrayBuffer());
  let storedType = contentType;
  if (convert) {
    try {
      bytes = await toWebp(bytes);
    } catch {
      throw new AppError('UPLOAD_IMAGE_INVALID', 'image could not be decoded', 422);
    }
    storedType = 'image/webp';
  }

  // Keep the prize-images/ prefix: the media proxy allow-list only serves that prefix.
  const ext = MIME_EXT[storedType] ?? 'bin';
  const key = `prize-images/${randomUUID()}.${ext}`;

  const { url } = await putObject({ key, body: bytes, contentType: storedType });

  await audit(c, prisma, {
    event: 'admin.upload',
    targetType: 'upload',
    targetId: key,
    payloadAfter: { key, url, sizeBytes: file.size, storedBytes: bytes.byteLength, contentType, storedType },
  });

  return c.json({ url, key });
});
