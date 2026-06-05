import { describe, it, expect } from 'vitest';
import { publicUrl } from '../../../src/storage/bucket.js';
import { AppError } from '../../../src/errors.js';

// These unit tests are env-agnostic: they pass endpoint + bucket explicitly
// rather than relying on process.env, because env.ts validates eagerly at
// module load and tests/setup.ts has already populated DATABASE_URL etc.
describe('publicUrl', () => {
  it('joins endpoint + bucket + key without double slashes (no trailing slash)', () => {
    expect(publicUrl('foo/bar.png', { endpoint: 'https://x.com', bucket: 'b' }))
      .toBe('https://x.com/b/foo/bar.png');
  });

  it('joins endpoint + bucket + key without double slashes (trailing slash on endpoint)', () => {
    expect(publicUrl('foo.png', { endpoint: 'https://x.com/', bucket: 'b' }))
      .toBe('https://x.com/b/foo.png');
  });

  it('throws BUCKET_NOT_CONFIGURED when explicit endpoint or bucket is empty', () => {
    // Bypasses env.ts entirely by passing explicit empty strings, which
    // exercise the same `if (!endpoint || !bucket)` guard that fires in
    // production when the Bucket Railway env-vars aren't wired up.
    expect(() => publicUrl('foo.png', { endpoint: '', bucket: 'b' })).toThrow(AppError);
    try {
      publicUrl('foo.png', { endpoint: '', bucket: 'b' });
    } catch (e) {
      expect((e as AppError).code).toBe('BUCKET_NOT_CONFIGURED');
      expect((e as AppError).status).toBe(500);
    }
  });
});
