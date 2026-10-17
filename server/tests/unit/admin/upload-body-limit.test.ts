import { Hono, type MiddlewareHandler } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Exercise the actual route without connecting to a database or storage.
vi.mock('../../../src/admin/auth/middleware.js', () => ({
  requireAnyAdminNav: () => [((_, next) => next()) as MiddlewareHandler],
}));
vi.mock('../../../src/db.js', () => ({ prisma: {} }));
vi.mock('../../../src/admin/audit/helper.js', () => ({ audit: vi.fn() }));
vi.mock('../../../src/storage/bucket.js', () => ({ putObject: vi.fn() }));
vi.mock('../../../src/storage/webp.js', () => ({ toWebp: vi.fn() }));

import { adminUploadsRoutes } from '../../../src/admin/routes/uploads.js';
import { putObject } from '../../../src/storage/bucket.js';
import { toWebp } from '../../../src/storage/webp.js';
import { formatError } from '../../../src/errors.js';

const app = new Hono();
app.onError((err, c) => {
  const { body, status } = formatError(err);
  return c.json(body, status as 400 | 413 | 415 | 422 | 500);
});
app.route('/', adminUploadsRoutes);

describe('upload body limits', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects an oversized Content-Length before reading the request', async () => {
    const response = await app.request('/api/admin/uploads', {
      method: 'POST',
      headers: { 'content-length': String(11 * 1024 * 1024) },
      body: 'not parsed',
    });
    expect(response.status).toBe(413);
    expect((await response.json()).error.code).toBe('UPLOAD_TOO_LARGE');
    expect(putObject).not.toHaveBeenCalled();
  });

  it('stops reading a chunked upload at the limit', async () => {
    let chunks = 0;
    const body = new ReadableStream({
      pull(controller) {
        chunks++;
        if (chunks > 100) controller.close();
        else controller.enqueue(new Uint8Array(1024 * 1024));
      },
    }, { highWaterMark: 0 });
    const request = new Request('http://localhost/api/admin/uploads', {
      method: 'POST', body, duplex: 'half',
    } as RequestInit & { duplex: 'half' });
    const response = await app.request(request);
    expect(response.status).toBe(413);
    expect(chunks).toBe(11);
    expect(putObject).not.toHaveBeenCalled();
  });

  it('accepts a 10 MB conversion file plus multipart fields', async () => {
    vi.mocked(toWebp).mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.mocked(putObject).mockResolvedValue({ key: 'test', url: 'https://storage.test/test' });
    const form = new FormData();
    form.append('file', new File([new Uint8Array(10 * 1024 * 1024)], 'test.png', { type: 'image/png' }));
    form.append('convert', 'webp');
    const response = await app.request('/api/admin/uploads', { method: 'POST', body: form });
    expect(response.status).toBe(200);
    expect(toWebp).toHaveBeenCalledOnce();
    expect(putObject).toHaveBeenCalledOnce();
  });

  it('still rejects non-converted files above 5 MB', async () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'test.png', { type: 'image/png' }));
    const response = await app.request('/api/admin/uploads', { method: 'POST', body: form });
    expect(response.status).toBe(413);
    expect(putObject).not.toHaveBeenCalled();
  });
});
