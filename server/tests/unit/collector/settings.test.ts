import { describe, expect, it } from 'vitest';
import { normalizeCasinoUrl } from '../../../src/collector/settings.js';

describe('normalizeCasinoUrl', () => {
  it('returns the origin of an https URL', () => {
    expect(normalizeCasinoUrl('https://www.ds8899.net/sty4_home.php?invite_code=su001&c=3')).toBe('https://www.ds8899.net');
  });

  it('rejects non-https, embedded credentials and garbage without echoing the input', () => {
    for (const bad of ['http://www.ds8899.net', 'https://user:secret@www.ds8899.net', 'not a url secret-token']) {
      try {
        normalizeCasinoUrl(bad);
        expect.unreachable();
      } catch (err) {
        expect(err).toMatchObject({ code: 'CREDENTIALS_INVALID' });
        expect((err as Error).message).not.toMatch(/secret|ds8899/);
      }
    }
  });
});
