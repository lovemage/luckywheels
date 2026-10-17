import { Readable } from 'node:stream';
import { setImmediate } from 'node:timers/promises';
import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/env.js', () => ({
  env: { BUCKET: 'test-bucket', ENDPOINT: 'https://storage.test.local' },
}));
vi.mock('../../src/storage/bucket.js', () => ({ getObject: vi.fn() }));

import { getObject } from '../../src/storage/bucket.js';
import { mediaProxyRoutes } from '../../src/routes/media-proxy.js';
import { formatError } from '../../src/errors.js';

const app = new Hono();
app.onError((err, c) => {
  const { body, status } = formatError(err);
  return c.json(body, status as 400 | 403 | 404 | 500);
});
app.route('/', mediaProxyRoutes);
const url = '/api/media-proxy?url=' + encodeURIComponent('https://storage.test.local/test-bucket/prize-images/test.png');

describe('media proxy streaming', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns before the upstream finishes and preserves bytes and headers', async () => {
    const source = new Readable({ read() {} });
    vi.mocked(getObject).mockResolvedValue({ body: source, contentType: 'image/png', contentLength: 6 });
    // The upstream has not sent any bytes or EOF yet.
    const response = await app.request(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe('6');
    expect(response.headers.get('cache-control')).toContain('immutable');
    source.push(Buffer.from('abc'));
    source.push(Buffer.from('def'));
    source.push(null);
    expect(await response.text()).toBe('abcdef');
  });

  it('applies backpressure and destroys upstream when the client cancels', async () => {
    let produced = 0;
    const source = new Readable({
      highWaterMark: 64 * 1024,
      read() {
        produced++;
        this.push(Buffer.alloc(64 * 1024));
      },
    });
    vi.mocked(getObject).mockResolvedValue({ body: source, contentType: 'image/png' });
    const response = await app.request(url);
    await setImmediate();
    expect(produced).toBeLessThanOrEqual(3);
    const settled = produced;
    await setImmediate();
    expect(produced).toBe(settled);
    await response.body!.cancel();
    expect(source.destroyed).toBe(true);
  });

  it('propagates upstream stream failures', async () => {
    const source = new Readable({ read() {} });
    vi.mocked(getObject).mockResolvedValue({ body: source });
    const response = await app.request(url);
    const read = response.text();
    source.destroy(new Error('storage disconnected'));
    await expect(read).rejects.toThrow('storage disconnected');
  });

  it('streams async iterables and closes them when cancelled', async () => {
    let closed = false;
    async function* chunks() {
      try {
        while (true) yield Buffer.from('image');
      } finally {
        closed = true;
      }
    }
    vi.mocked(getObject).mockResolvedValue({ body: chunks() });
    const response = await app.request(url);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('image');
    await reader.cancel();
    await setImmediate();
    expect(closed).toBe(true);
  });

  it('still rejects foreign storage URLs before accessing storage', async () => {
    const response = await app.request('/api/media-proxy?url=https://other.test/file.png');
    expect(response.status).toBe(403);
    expect(getObject).not.toHaveBeenCalled();
  });

  it('still returns 404 for missing objects', async () => {
    vi.mocked(getObject).mockRejectedValue(Object.assign(new Error('missing'), { name: 'NoSuchKey' }));
    expect((await app.request(url)).status).toBe(404);
  });
});
