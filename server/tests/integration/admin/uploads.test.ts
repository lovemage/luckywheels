import { describe, it, expect, beforeEach } from 'vitest';
import { installS3Mock, resetS3Calls, s3Calls } from '../../helpers/s3-mock.js';

// Must run BEFORE importing app / bucket — vi.mock is hoisted by Vitest.
installS3Mock();

import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { resetClientForTests } from '../../../src/storage/bucket.js';

function pngBytes(): Uint8Array {
  // 8-byte PNG signature + a few junk bytes. Enough to upload; tests don't
  // decode the image, they just check size + content-type pass through.
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3]);
}

function makeForm(name: string, mime: string, body: Uint8Array): FormData {
  const fd = new FormData();
  // Blob accepts Uint8Array directly; this also avoids the ArrayBufferLike
  // vs ArrayBuffer DOM lib mismatch under noUncheckedIndexedAccess.
  fd.append('file', new File([body], name, { type: mime }));
  return fd;
}

describe('POST /api/admin/uploads', () => {
  beforeEach(async () => {
    await resetDb();
    resetS3Calls();
    resetClientForTests();
  });

  it('401 without admin session', async () => {
    const r = await app.request('/api/admin/uploads', {
      method: 'POST',
      body: makeForm('a.png', 'image/png', pngBytes()),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('valid PNG upload returns { url, key }, records putObject + audit log', async () => {
    const admin = await createAdmin();
    const headers = await adminHeaders(admin.id, admin.email);
    delete (headers as Record<string, string>)['content-type']; // let FormData set the boundary

    const r = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers,
      body: makeForm('hero.png', 'image/png', pngBytes()),
    });
    expect(r.status).toBe(200);
    const json = await r.json() as { url: string; key: string };
    expect(json.key).toMatch(/^prize-images\/.+\.png$/);
    expect(json.url).toContain(json.key);
    expect(s3Calls.puts).toHaveLength(1);
    expect(s3Calls.puts[0]?.Key).toBe(json.key);
    expect(s3Calls.puts[0]?.ContentType).toBe('image/png');

    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { event: 'admin.upload' } });
    expect(log.targetId).toBe(json.key);
    expect(log.payloadAfter).toMatchObject({
      key: json.key,
      url: json.url,
      contentType: 'image/png',
    });
  });

  it('wrong MIME (text/plain) → 415 UPLOAD_MIME_REJECTED', async () => {
    const admin = await createAdmin();
    const headers = await adminHeaders(admin.id, admin.email);
    delete (headers as Record<string, string>)['content-type'];

    const r = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers,
      body: makeForm('a.txt', 'text/plain', new Uint8Array([1, 2, 3])),
    });
    expect(r.status).toBe(415);
    expect((await r.json()).error.code).toBe('UPLOAD_MIME_REJECTED');
    expect(s3Calls.puts).toHaveLength(0);
  });

  it('> 5MB → 413 UPLOAD_TOO_LARGE', async () => {
    const admin = await createAdmin();
    const headers = await adminHeaders(admin.id, admin.email);
    delete (headers as Record<string, string>)['content-type'];

    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    const r = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers,
      body: makeForm('big.png', 'image/png', big),
    });
    expect(r.status).toBe(413);
    expect((await r.json()).error.code).toBe('UPLOAD_TOO_LARGE');
    expect(s3Calls.puts).toHaveLength(0);
  });

  it('missing file field → 400 UPLOAD_NO_FILE', async () => {
    const admin = await createAdmin();
    const headers = await adminHeaders(admin.id, admin.email);
    delete (headers as Record<string, string>)['content-type'];

    const fd = new FormData();
    fd.append('not-file', 'oops');
    const r = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers,
      body: fd,
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('UPLOAD_NO_FILE');
  });
});
