import { describe, it, expect } from 'vitest';
import { app } from '../../../src/index.js';

describe('admin SPA scaffold', () => {
  it('GET /admin/ serves the SPA index.html (or a placeholder)', async () => {
    const r = await app.request('/admin/');
    expect(r.status).toBe(200);
    const text = await r.text();
    expect(text).toContain('<div id="root">');
  });

  it('GET /admin/somewhere/else also serves the same SPA (catch-all)', async () => {
    const r = await app.request('/admin/users/123');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('<div id="root">');
  });

  it('GET /api/admin/health returns ok without auth', async () => {
    const r = await app.request('/api/admin/health');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
  });
});
