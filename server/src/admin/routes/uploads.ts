import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import { AppError } from '../../errors.js';
import { prisma } from '../../db.js';
import { requireAnyAdminNav } from '../auth/middleware.js';
import { audit } from '../audit/helper.js';
import { putObject } from '../../storage/bucket.js';

export const adminUploadsRoutes = new Hono();
const requireUploadNav = requireAnyAdminNav(['prizes', 'system']);

const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

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
  if (file.size > MAX_BYTES) {
    throw new AppError('UPLOAD_TOO_LARGE', `file ${file.size} bytes exceeds ${MAX_BYTES}`, 413);
  }

  const ext = MIME_EXT[contentType] ?? 'bin';
  const key = `prize-images/${randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { url } = await putObject({ key, body: bytes, contentType });

  await audit(c, prisma, {
    event: 'admin.upload',
    targetType: 'upload',
    targetId: key,
    payloadAfter: { key, url, sizeBytes: file.size, contentType },
  });

  return c.json({ url, key });
});
