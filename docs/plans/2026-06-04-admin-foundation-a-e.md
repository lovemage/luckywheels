# Admin Foundation + Module A + Module E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Admin web console's daily-ops surface — admin login + audit attribution, member list / detail / points / blacklist / account-type / test-settings / entertainment-code-rebind / draw-history, redemption list / detail / status switching, change password, and action-logs viewer — sufficient for the operations team to claim Redemption codes, dispatch points, and read audit history without touching the database.

**Architecture:** Same Hono server as `docs/plans/2026-06-03-backend-core.md`. A separate Vite-built React SPA in `server/admin-ui/` (`base: '/admin/'`) is served via Hono `serveStatic` at `/admin/*` (catch-all → `index.html`). Auth uses email + bcrypt and a JWT in the `lw_admin_session` cookie (distinct from member `lw_session`). All write endpoints call an `audit(c, ...)` helper that auto-fills attribution and writes `admin_action_logs` rows **in the same transaction** as the business mutation. No role tier enforcement in MVP. SPA uses React Query for server state and a fetch wrapper that surfaces 401 → global session-expired modal.

**Tech Stack:** Node 22, TypeScript 5.6, Hono 4, Prisma 5, Postgres 16, vitest 2, zod 3, jose 5 (JWT), bcryptjs 2 (admin password hash), React 19, Vite 7, react-router 7, @tanstack/react-query 5, @testing-library/react 16 + happy-dom 15 (component tests).

**Reference:**
- `docs/specs/2026-06-04-admin-backend-design.md` — design spec
- `docs/plans/2026-06-03-backend-core.md` — backend-core plan; Plan 1 of Admin assumes the Hono server, Prisma schema, `AdminActionLog` model + `writeAdminActionLog` helper (backend-core Task 6), `AppError`, and `env` loader already exist.
- `docs/fullstack-spec.md` — schema + API contracts

**Out of scope (deferred):**
- Module B (game rules / prizes / settings) — Plan 2
- Module C (bottom_tabs) — Plan 2
- Module D (templates upload + history) — Plan 2
- Admin LINE OAuth, 2FA, role tiers, password reset for other admins, CSV export, real-time updates
- Member-facing frontend (separate plan)

**Pre-flight requirements:**
- backend-core plan implemented (or its scaffold present): Hono server boots, Prisma client + `AdminActionLog` table available, `writeAdminActionLog(client, input)` helper exists at `server/src/audit/log.ts`, `env` loader at `server/src/env.ts` is extensible.
- `.env` adds `ADMIN_JWT_SECRET` (≥ 32 chars, distinct from `JWT_SECRET` and `STATE_SECRET`).
- Optional: `ADMIN_PUBLIC_ORIGIN=http://127.0.0.1:5174` for SPA dev with `vite dev`.

---

## File Structure

```
server/
  package.json                     # +bcryptjs, +@types/bcryptjs (dev)
  .env.example                     # +ADMIN_JWT_SECRET, +ADMIN_PUBLIC_ORIGIN
  src/
    env.ts                         # +ADMIN_JWT_SECRET / +ADMIN_PUBLIC_ORIGIN
    index.ts                       # mount /admin/* static + admin routes
    admin/
      auth/
        cookies.ts                 # ADMIN_SESSION_COOKIE + helpers
        jwt.ts                     # signAdminSession / verifyAdminSession
        rate-limit.ts              # per-IP failure bucket (in-memory)
        middleware.ts              # requireAdmin
        password.ts                # hash / verify (bcrypt)
      audit/
        helper.ts                  # audit(c, input) bound to ctx + tx
      routes/
        auth.ts                    # POST /api/admin/auth/login + logout + GET /api/admin/me
        users.ts                   # GET list + GET detail + PATCH bits + POST points + GET draw-history
        redemptions.ts             # GET list + GET detail + PATCH status
        me.ts                      # PATCH /api/admin/me/password
        action-logs.ts             # GET cursor-paginated + filters
  scripts/
    create-admin.ts                # npm run admin:create
  admin-ui/
    package.json
    tsconfig.json
    tsconfig.node.json
    vite.config.ts
    index.html
    src/
      main.tsx
      App.tsx                      # router root
      api/
        client.ts                  # fetch wrapper with global 401 handler
        users.ts                   # typed hooks
        redemptions.ts
        me.ts
        logs.ts
      components/
        AppShell.tsx
        AuthGuard.tsx
        SessionExpiredModal.tsx
        Modal.tsx
        ConfirmModal.tsx
        DoubleConfirmModal.tsx
        Table.tsx
        StatusBadge.tsx
        AccountTypeBadge.tsx
        CodeChip.tsx
        JsonDiff.tsx
        MemberSearch.tsx
      routes/
        Login.tsx
        Dashboard.tsx
        Members.tsx
        MemberDetail.tsx
        Redemptions.tsx
        RedemptionDetail.tsx
        Profile.tsx
        Logs.tsx
      state/
        session.ts
    tests/
      unit/                        # @testing-library/react + happy-dom via vitest
        ConfirmModal.test.tsx
        SessionExpiredModal.test.tsx
        Login.test.tsx
        MemberSearch.test.tsx
  tests/
    helpers/
      admin.ts                     # createAdmin / adminHeaders helpers
    unit/
      admin/
        jwt.test.ts
        rate-limit.test.ts
        audit.test.ts
        password.test.ts
    integration/
      admin/
        auth.test.ts
        users_list.test.ts
        users_detail.test.ts
        users_points.test.ts
        users_account_type.test.ts
        users_test_settings.test.ts
        users_blacklist.test.ts
        users_entertainment_code.test.ts
        users_draw_history.test.ts
        redemptions_list.test.ts
        redemptions_detail.test.ts
        redemptions_status.test.ts
        me_password.test.ts
        action_logs.test.ts
```

---

## Task 1: admin-ui Vite scaffold + Hono `/admin/*` serveStatic

Stands up the Admin SPA workspace and wires Hono to serve its built bundle. Dev mode supports either of: (a) Vite dev server on its own port with CORS, or (b) `npm run build` then serve from `dist/`.

**Files:**
- Create: `server/admin-ui/package.json`
- Create: `server/admin-ui/tsconfig.json`
- Create: `server/admin-ui/tsconfig.node.json`
- Create: `server/admin-ui/vite.config.ts`
- Create: `server/admin-ui/index.html`
- Create: `server/admin-ui/src/main.tsx`
- Create: `server/admin-ui/src/App.tsx`
- Modify: `server/package.json` (add `admin-ui:build` / `admin-ui:dev` scripts; bcryptjs not yet)
- Modify: `server/src/env.ts` (`ADMIN_PUBLIC_ORIGIN` optional env)
- Modify: `server/src/index.ts` (mount `/admin/*` serveStatic with catch-all)
- Test: `server/tests/integration/admin/_scaffold.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/_scaffold.test.ts
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
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/_scaffold.test.ts
```

Expected: FAIL (no /admin route mounted).

- [ ] **Step 3: Create `server/admin-ui/package.json`**

```json
{
  "name": "@luckywheels/admin-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "@tanstack/react-query": "^5.62.0",
    "react": "^19.2.0",
    "react-dom": "^19.2.0",
    "react-router": "^7.0.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.1.0",
    "@types/react": "^19.2.16",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "happy-dom": "^15.0.0",
    "typescript": "^5.6.0",
    "vite": "^7.2.6",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 4: Create `server/admin-ui/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["vite/client", "@testing-library/react"]
  },
  "include": ["src", "tests"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 5: Create `server/admin-ui/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "composite": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 6: Create `server/admin-ui/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['tests/**/*.test.{ts,tsx}'],
    setupFiles: [],
  },
});
```

- [ ] **Step 7: Create `server/admin-ui/index.html`**

```html
<!doctype html>
<html lang="zh-TW">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lucky Wheels Admin</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Create `server/admin-ui/src/main.tsx`**

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 9: Create `server/admin-ui/src/App.tsx`**

A placeholder router shell — Task 5 replaces this with the real `AppShell + routes + auth guard` wiring.

```tsx
export function App() {
  return (
    <div>
      <h1>Lucky Wheels Admin</h1>
      <p>SPA scaffold — Task 5 will replace this with the real app shell.</p>
    </div>
  );
}
```

- [ ] **Step 10: Update `server/src/env.ts`** — add optional admin origin

Append to the `Schema` object (preserving the existing `superRefine` for JWT_SECRET ≠ STATE_SECRET):

```ts
ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
ADMIN_PUBLIC_ORIGIN: z.string().url().optional(),
```

And extend the existing `superRefine` to also require `ADMIN_JWT_SECRET` to differ from both `JWT_SECRET` and `STATE_SECRET`:

```ts
}).superRefine((e, ctx) => {
  if (e.JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'JWT_SECRET and STATE_SECRET must be distinct', path: ['STATE_SECRET'] });
  }
  if (e.ADMIN_JWT_SECRET === e.JWT_SECRET || e.ADMIN_JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({ code: 'custom', message: 'ADMIN_JWT_SECRET must be distinct from JWT_SECRET and STATE_SECRET', path: ['ADMIN_JWT_SECRET'] });
  }
});
```

- [ ] **Step 11: Update `server/.env.example`**

```
# Admin
ADMIN_JWT_SECRET=another-32-byte-secret-for-admin-session-XXX
ADMIN_PUBLIC_ORIGIN=http://127.0.0.1:5174
```

- [ ] **Step 12: Wire `/admin/*` static serve + `/api/admin/health` in `server/src/index.ts`**

Add near other route mounts (the SPA static handler MUST come after the API routes so `/api/admin/...` matches first):

```ts
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADMIN_DIST = join(__dirname, '..', 'admin-ui', 'dist');
const ADMIN_INDEX_PATH = join(ADMIN_DIST, 'index.html');

// Lightweight placeholder if admin-ui hasn't been built yet (dev convenience).
const FALLBACK_INDEX = `<!doctype html><html><body><div id="root">Admin UI not built yet. Run npm --prefix admin-ui run build.</div></body></html>`;

app.get('/api/admin/health', (c) => c.json({ ok: true }));

// Serve built admin assets (JS/CSS/etc.)
app.use('/admin/*', serveStatic({ root: './admin-ui/dist' }));

// SPA catch-all → serve index.html for any /admin/* path that didn't match a static file.
app.get('/admin/*', (c) => {
  const html = existsSync(ADMIN_INDEX_PATH) ? readFileSync(ADMIN_INDEX_PATH, 'utf-8') : FALLBACK_INDEX;
  return c.html(html);
});
```

- [ ] **Step 13: Add npm scripts to `server/package.json`** (in `"scripts"`)

```json
"admin-ui:dev": "npm --prefix admin-ui run dev",
"admin-ui:build": "npm --prefix admin-ui run build",
"admin-ui:test": "npm --prefix admin-ui run test"
```

And in `"devDependencies"` add `"@hono/node-server": "^1.13.0"` if not already present (it's a server dep but the static helper lives there).

- [ ] **Step 14: Install dependencies**

```bash
cd server && npm install
cd server/admin-ui && npm install
```

- [ ] **Step 15: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/_scaffold.test.ts
```

Expected: PASS 3/3 (the SPA falls back to `FALLBACK_INDEX` text since dist isn't built; the assertion `<div id="root">` still matches).

- [ ] **Step 16: Commit**

```bash
git add server/admin-ui server/src/env.ts server/.env.example server/src/index.ts server/package.json server/tests/integration/admin/_scaffold.test.ts
git commit -m "feat(server): admin SPA scaffold + /admin static serve + ADMIN_JWT_SECRET env"
```

---

## Task 2: Admin session JWT (sign / verify)

Pure unit-testable JWT helpers for the admin session. Distinct from member's `signSession` in `server/src/auth/jwt.ts` — different secret (`ADMIN_JWT_SECRET`), different issuer/audience, different payload (`{ adminUserId, email }`).

**Files:**
- Create: `server/src/admin/auth/jwt.ts`
- Test: `server/tests/unit/admin/jwt.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/admin/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signAdminSession, verifyAdminSession } from '../../../src/admin/auth/jwt.js';

describe('admin session JWT', () => {
  it('round-trips adminUserId + email', async () => {
    const token = await signAdminSession({ adminUserId: 'admin_1', email: 'ops@example.com' });
    const payload = await verifyAdminSession(token);
    expect(payload.adminUserId).toBe('admin_1');
    expect(payload.email).toBe('ops@example.com');
  });

  it('rejects a tampered token', async () => {
    const token = await signAdminSession({ adminUserId: 'admin_1', email: 'ops@example.com' });
    await expect(verifyAdminSession(token.slice(0, -2) + 'aa')).rejects.toThrow();
  });

  it('rejects an expired token', async () => {
    const token = await signAdminSession(
      { adminUserId: 'admin_x', email: 'x@example.com' },
      { expiresInSeconds: -1 },
    );
    await expect(verifyAdminSession(token)).rejects.toThrow();
  });

  it('rejects a member-side token signed with JWT_SECRET (wrong secret)', async () => {
    const { signSession } = await import('../../../src/auth/jwt.js');
    const memberToken = await signSession({ userId: 'user_1' });
    await expect(verifyAdminSession(memberToken)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/admin/jwt.test.ts
```

- [ ] **Step 3: Implement `server/src/admin/auth/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../../env.js';

const secret = new TextEncoder().encode(env.ADMIN_JWT_SECRET);
const ISSUER = 'luckywheels-admin';
const AUDIENCE = 'luckywheels-admin-ui';
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AdminSessionPayload {
  adminUserId: string;
  email: string;
}

export async function signAdminSession(
  payload: AdminSessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? DEFAULT_TTL_SECONDS;
  return new SignJWT({ adminUserId: payload.adminUserId, email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifyAdminSession(token: string): Promise<AdminSessionPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
  if (typeof payload.adminUserId !== 'string' || typeof payload.email !== 'string') {
    throw new Error('invalid admin session payload');
  }
  return { adminUserId: payload.adminUserId, email: payload.email };
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/admin/jwt.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/admin/auth/jwt.ts server/tests/unit/admin/jwt.test.ts
git commit -m "feat(server): admin session JWT (separate secret + issuer)"
```

---

## Task 3: Login rate limit + bcrypt password helpers + audit context helper

Three small foundation pieces bundled because each is too small to be its own task: in-memory per-IP rate limit bucket, bcrypt wrappers, and the `audit(c, ...)` helper that auto-fills attribution from Hono context.

**Files:**
- Create: `server/src/admin/auth/rate-limit.ts`
- Create: `server/src/admin/auth/password.ts`
- Create: `server/src/admin/audit/helper.ts`
- Modify: `server/package.json` (add `bcryptjs` + `@types/bcryptjs`)
- Test: `server/tests/unit/admin/rate-limit.test.ts`
- Test: `server/tests/unit/admin/password.test.ts`
- Test: `server/tests/unit/admin/audit.test.ts`

- [ ] **Step 1: Add bcryptjs to `server/package.json`**

In `dependencies`:
```json
"bcryptjs": "^2.4.3"
```
In `devDependencies`:
```json
"@types/bcryptjs": "^2.4.6"
```

Then:

```bash
cd server && npm install
```

- [ ] **Step 2: Write failing test for rate limit**

```ts
// server/tests/unit/admin/rate-limit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { recordLoginFailure, isLoginLocked, clearRateLimitBucket } from '../../../src/admin/auth/rate-limit.js';

describe('login rate limit', () => {
  beforeEach(clearRateLimitBucket);

  it('allows the first 5 failures', () => {
    for (let i = 0; i < 5; i++) {
      expect(isLoginLocked('1.2.3.4')).toBe(false);
      recordLoginFailure('1.2.3.4');
    }
  });

  it('locks after 5 failures within the window', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4');
    expect(isLoginLocked('1.2.3.4')).toBe(true);
  });

  it('different IPs are tracked independently', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4');
    expect(isLoginLocked('1.2.3.4')).toBe(true);
    expect(isLoginLocked('5.6.7.8')).toBe(false);
  });

  it('clears expired entries after the window', () => {
    for (let i = 0; i < 5; i++) recordLoginFailure('1.2.3.4', Date.now() - 61_000);
    expect(isLoginLocked('1.2.3.4')).toBe(false);
  });
});
```

- [ ] **Step 3: Implement `server/src/admin/auth/rate-limit.ts`**

```ts
// In-memory per-IP failure bucket. 5 failures per 60s window → locked.
// MVP only; replace with Redis when admin login is exposed externally.

const WINDOW_MS = 60_000;
const MAX_FAILURES = 5;

const buckets = new Map<string, number[]>();  // ip -> failure timestamps

export function recordLoginFailure(ip: string, atMs: number = Date.now()): void {
  const arr = buckets.get(ip) ?? [];
  arr.push(atMs);
  buckets.set(ip, arr);
}

export function isLoginLocked(ip: string, atMs: number = Date.now()): boolean {
  const arr = buckets.get(ip);
  if (!arr) return false;
  const fresh = arr.filter((t) => atMs - t < WINDOW_MS);
  if (fresh.length !== arr.length) buckets.set(ip, fresh);
  return fresh.length >= MAX_FAILURES;
}

export function clearRateLimitBucket(): void {
  buckets.clear();
}
```

- [ ] **Step 4: Run rate-limit test (PASS)**

```bash
cd server && npx vitest run tests/unit/admin/rate-limit.test.ts
```

- [ ] **Step 5: Write failing test for password**

```ts
// server/tests/unit/admin/password.test.ts
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '../../../src/admin/auth/password.js';

describe('password hashing', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toBe('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('right');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });

  it('rejects a malformed hash', async () => {
    expect(await verifyPassword('any', 'not-a-bcrypt-hash')).toBe(false);
  });
});
```

- [ ] **Step 6: Implement `server/src/admin/auth/password.ts`**

```ts
import bcrypt from 'bcryptjs';

const COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}
```

- [ ] **Step 7: Run password test (PASS)**

```bash
cd server && npx vitest run tests/unit/admin/password.test.ts
```

- [ ] **Step 8: Write failing test for audit helper**

```ts
// server/tests/unit/admin/audit.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { audit } from '../../../src/admin/audit/helper.js';

function fakeContext(opts: {
  admin: { id: string };
  ip?: string;
  userAgent?: string;
}) {
  // Minimal Hono Context shim: only the methods/state audit() actually uses.
  return {
    get(key: string) {
      if (key === 'admin') return opts.admin;
      return undefined;
    },
    req: {
      header(name: string) {
        if (name === 'x-forwarded-for') return opts.ip;
        if (name === 'user-agent') return opts.userAgent;
        return undefined;
      },
    },
  } as unknown as import('hono').Context;
}

describe('audit(c, ...) helper', () => {
  beforeEach(resetDb);

  it('writes adminUserId / ip / userAgent / event / target / payloads', async () => {
    const ctx = fakeContext({ admin: { id: 'admin_42' }, ip: '127.0.0.1', userAgent: 'TestUA' });
    await audit(ctx, prisma, {
      event: 'user.points_topup',
      targetType: 'user',
      targetId: 'user_1',
      payloadBefore: { points: 10 },
      payloadAfter: { points: 60 },
      note: 'gift',
    });
    const rows = await prisma.adminActionLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      adminUserId: 'admin_42',
      event: 'user.points_topup',
      targetType: 'user',
      targetId: 'user_1',
      ip: '127.0.0.1',
      userAgent: 'TestUA',
      note: 'gift',
    });
    expect(rows[0]?.payloadBefore).toEqual({ points: 10 });
    expect(rows[0]?.payloadAfter).toEqual({ points: 60 });
  });

  it('still writes when admin is missing (system event); adminUserId becomes null', async () => {
    const ctx = fakeContext({ admin: undefined as unknown as { id: string }, ip: '127.0.0.1' });
    await audit(ctx, prisma, { event: 'draw_blocked_blacklist', targetType: 'user', targetId: 'user_x' });
    const row = await prisma.adminActionLog.findFirst();
    expect(row?.adminUserId).toBeNull();
    expect(row?.event).toBe('draw_blocked_blacklist');
  });

  it('accepts a transaction client and writes inside it', async () => {
    const ctx = fakeContext({ admin: { id: 'admin_tx' } });
    await prisma.$transaction(async (tx) => {
      await audit(ctx, tx, { event: 'admin.password_changed' });
    });
    expect(await prisma.adminActionLog.count()).toBe(1);
  });
});
```

- [ ] **Step 9: Implement `server/src/admin/audit/helper.ts`**

```ts
import type { Context } from 'hono';
import type { Prisma, PrismaClient } from '@prisma/client';
import { writeAdminActionLog, type AdminActionLogInput } from '../../audit/log.js';

type Client = PrismaClient | Prisma.TransactionClient;

export async function audit(
  c: Context,
  client: Client,
  input: Omit<AdminActionLogInput, 'adminUserId' | 'ip' | 'userAgent'> & {
    adminUserId?: string | null;
  },
): Promise<void> {
  const admin = c.get('admin') as { id: string } | undefined;
  await writeAdminActionLog(client, {
    ...input,
    adminUserId: input.adminUserId ?? admin?.id ?? null,
    ip: c.req.header('x-forwarded-for') ?? null,
    userAgent: c.req.header('user-agent') ?? null,
  });
}
```

- [ ] **Step 10: Run audit test (PASS)**

```bash
cd server && npx vitest run tests/unit/admin/audit.test.ts
```

- [ ] **Step 11: Commit**

```bash
git add server/package.json server/src/admin/auth/rate-limit.ts server/src/admin/auth/password.ts server/src/admin/audit/helper.ts server/tests/unit/admin/
git commit -m "feat(server): admin rate-limit + bcrypt password + audit(c,...) helper"
```

---

## Task 4: Admin auth routes — login + logout + `/api/admin/me`

Endpoint stack the SPA needs to authenticate, plus the `admin_users` schema gains `lastLoginAt` if not already present. Login writes `admin.login_succeeded` / `admin.login_failed` audit rows. Failed logins still write audit even when the email doesn't exist (logged with the attempted email in `payloadAfter` for brute-force visibility). `requireAdmin` middleware lands in this task so `/api/admin/me` can use it.

**Files:**
- Modify: `server/prisma/schema.prisma` (add `lastLoginAt` if missing; add `passwordChangedAt` if missing)
- Create: `server/src/admin/auth/cookies.ts`
- Create: `server/src/admin/auth/middleware.ts`
- Create: `server/src/admin/routes/auth.ts`
- Modify: `server/src/index.ts` (mount admin auth routes)
- Modify: `server/tests/helpers/db.ts` (extend `TABLES` to include `AdminUser`)
- Create: `server/tests/helpers/admin.ts` (factories)
- Test: `server/tests/integration/admin/auth.test.ts`

- [ ] **Step 1: Update `server/prisma/schema.prisma`**

Ensure the `AdminUser` model includes these fields (backend-core Task 6 created the table; this step idempotently adds the two timestamps if absent):

```prisma
model AdminUser {
  id                  String    @id @default(cuid())
  email               String    @unique
  passwordHash        String
  role                String    @default("admin")    // forward compat, MVP doesn't enforce tiers
  lastLoginAt         DateTime?
  passwordChangedAt   DateTime?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
}
```

Run migration:

```bash
cd server && npx prisma migrate dev --name add_admin_user_timestamps
```

- [ ] **Step 2: Implement `server/src/admin/auth/cookies.ts`**

```ts
import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

export const ADMIN_SESSION_COOKIE = 'lw_admin_session';

const isSecureContext = (): boolean =>
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development';

export function setAdminSessionCookie(c: Context, token: string): void {
  setCookie(c, ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecureContext(),
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export function clearAdminSessionCookie(c: Context): void {
  deleteCookie(c, ADMIN_SESSION_COOKIE, { path: '/' });
}
```

- [ ] **Step 3: Implement `server/src/admin/auth/middleware.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../../errors.js';
import { prisma } from '../../db.js';
import { verifyAdminSession } from './jwt.js';
import { ADMIN_SESSION_COOKIE } from './cookies.js';

declare module 'hono' {
  interface ContextVariableMap {
    admin: import('@prisma/client').AdminUser;
  }
}

export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'admin login required', 401);
  let payload;
  try { payload = await verifyAdminSession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid admin session', 401); }
  const admin = await prisma.adminUser.findUnique({ where: { id: payload.adminUserId } });
  if (!admin) throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  c.set('admin', admin);
  await next();
};
```

- [ ] **Step 4: Extend `server/tests/helpers/db.ts` TABLES**

Add `'AdminUser'` to the list (after `'AdminActionLog'`, before `'User'` so FK ordering is fine — there's no FK between them):

```ts
const TABLES = [
  'DrawLog',
  'Redemption',
  'Prize',
  'AppSetting',
  'AdminActionLog',
  'AdminUser',
  'User',
] as const;
```

- [ ] **Step 5: Create `server/tests/helpers/admin.ts`**

```ts
import { prisma } from '../../src/db.js';
import { hashPassword } from '../../src/admin/auth/password.js';
import { signAdminSession } from '../../src/admin/auth/jwt.js';
import { ADMIN_SESSION_COOKIE } from '../../src/admin/auth/cookies.js';

let a = 0;

export async function createAdmin(opts: { email?: string; password?: string } = {}) {
  a += 1;
  const email = opts.email ?? `admin${a}@example.com`;
  const password = opts.password ?? 'test-password-12';
  return prisma.adminUser.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'admin',
    },
  });
}

export async function adminHeaders(adminUserId: string, email: string) {
  const token = await signAdminSession({ adminUserId, email });
  return {
    cookie: `${ADMIN_SESSION_COOKIE}=${token}`,
    'content-type': 'application/json',
  };
}
```

- [ ] **Step 6: Write failing test `server/tests/integration/admin/auth.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { clearRateLimitBucket } from '../../../src/admin/auth/rate-limit.js';
import { ADMIN_SESSION_COOKIE } from '../../../src/admin/auth/cookies.js';

describe('admin auth flow', () => {
  beforeEach(async () => {
    await resetDb();
    clearRateLimitBucket();
  });

  it('POST /api/admin/auth/login → 200 + sets cookie + writes login_succeeded audit', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    expect(r.status).toBe(200);
    const setCookie = r.headers.getSetCookie().find((l) => l.startsWith(ADMIN_SESSION_COOKIE));
    expect(setCookie).toBeDefined();
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('admin.login_succeeded');
  });

  it('updates lastLoginAt on success', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    const fresh = await prisma.adminUser.findUnique({ where: { email: 'ops@example.com' } });
    expect(fresh?.lastLoginAt).not.toBeNull();
  });

  it('wrong password → 401 BAD_CREDENTIALS + login_failed audit', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'wrong' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('BAD_CREDENTIALS');
    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('admin.login_failed');
    expect(audits[0]?.payloadAfter).toMatchObject({ emailTried: 'ops@example.com' });
  });

  it('non-existent email → 401 BAD_CREDENTIALS (same as wrong password)', async () => {
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('BAD_CREDENTIALS');
  });

  it('6th failure within window → 429 LOGIN_RATE_LIMITED', async () => {
    await createAdmin({ email: 'ops@example.com', password: 'right-password-12' });
    for (let i = 0; i < 5; i++) {
      await app.request('/api/admin/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ops@example.com', password: 'wrong' }),
      });
    }
    const r = await app.request('/api/admin/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'ops@example.com', password: 'right-password-12' }),
    });
    expect(r.status).toBe(429);
    expect((await r.json()).error.code).toBe('LOGIN_RATE_LIMITED');
  });

  it('GET /api/admin/me → 401 without cookie', async () => {
    const r = await app.request('/api/admin/me');
    expect(r.status).toBe(401);
  });

  it('GET /api/admin/me with valid cookie → admin profile', async () => {
    const admin = await createAdmin({ email: 'ops@example.com' });
    const r = await app.request('/api/admin/me', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({ id: admin.id, email: 'ops@example.com', role: 'admin' });
  });

  it('POST /api/admin/auth/logout clears cookie', async () => {
    const r = await app.request('/api/admin/auth/logout', { method: 'POST' });
    expect(r.status).toBe(204);
    const setCookie = r.headers.getSetCookie().find((l) => l.startsWith(ADMIN_SESSION_COOKIE));
    expect(setCookie).toMatch(new RegExp(`${ADMIN_SESSION_COOKIE}=;`));
  });
});
```

- [ ] **Step 7: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/auth.test.ts
```

- [ ] **Step 8: Implement `server/src/admin/routes/auth.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { verifyPassword } from '../auth/password.js';
import { signAdminSession } from '../auth/jwt.js';
import {
  ADMIN_SESSION_COOKIE,
  setAdminSessionCookie,
  clearAdminSessionCookie,
} from '../auth/cookies.js';
import { requireAdmin } from '../auth/middleware.js';
import {
  recordLoginFailure,
  isLoginLocked,
} from '../auth/rate-limit.js';
import { audit } from '../audit/helper.js';

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const adminAuthRoutes = new Hono();

adminAuthRoutes.post('/api/admin/auth/login', async (c) => {
  const ip = c.req.header('x-forwarded-for') ?? '0.0.0.0';

  if (isLoginLocked(ip)) {
    throw new AppError('LOGIN_RATE_LIMITED', 'too many failed attempts, try again later', 429);
  }

  let body: z.infer<typeof LoginSchema>;
  try { body = LoginSchema.parse(await c.req.json()); }
  catch { throw new AppError('LOGIN_INVALID', 'email + password required', 400); }

  const admin = await prisma.adminUser.findUnique({ where: { email: body.email } });
  const okPassword = admin ? await verifyPassword(body.password, admin.passwordHash) : false;

  if (!admin || !okPassword) {
    recordLoginFailure(ip);
    await audit(c, prisma, {
      event: 'admin.login_failed',
      targetType: 'admin',
      targetId: admin?.id ?? null,
      payloadAfter: { emailTried: body.email },
    });
    throw new AppError('BAD_CREDENTIALS', 'invalid email or password', 401);
  }

  const token = await signAdminSession({ adminUserId: admin.id, email: admin.email });
  setAdminSessionCookie(c, token);

  const updated = await prisma.adminUser.update({
    where: { id: admin.id },
    data: { lastLoginAt: new Date() },
  });

  // Manually attach attribution since the requireAdmin middleware didn't run.
  c.set('admin', updated);
  await audit(c, prisma, {
    event: 'admin.login_succeeded',
    targetType: 'admin',
    targetId: admin.id,
  });

  return c.body(null, 200);
});

adminAuthRoutes.post('/api/admin/auth/logout', (c) => {
  clearAdminSessionCookie(c);
  return c.body(null, 204);
});

adminAuthRoutes.get('/api/admin/me', requireAdmin, (c) => {
  const a = c.get('admin');
  return c.json({
    id: a.id,
    email: a.email,
    role: a.role,
    lastLoginAt: a.lastLoginAt,
    passwordChangedAt: a.passwordChangedAt,
  });
});
```

- [ ] **Step 9: Mount in `server/src/index.ts`**

```ts
import { adminAuthRoutes } from './admin/routes/auth.js';
app.route('/', adminAuthRoutes);
```

(Place this **before** the `/admin/*` static catch-all so API routes match first.)

- [ ] **Step 10: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/auth.test.ts
```

Expected: PASS 8/8.

- [ ] **Step 11: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/src/admin/auth/cookies.ts server/src/admin/auth/middleware.ts server/src/admin/routes/auth.ts server/src/index.ts server/tests/helpers/admin.ts server/tests/helpers/db.ts server/tests/integration/admin/auth.test.ts
git commit -m "feat(server): admin auth routes (login + logout + me) with audit + rate limit"
```

---

## Task 5: AppShell + sidebar + global 401 modal + auth guard + login page

The SPA's outer chrome. Wires React Query, a fetch wrapper that catches 401s into a global "session expired" modal, the login page, and an auth guard that gates everything below `/admin/` behind a successful `/api/admin/me` call.

**Files:**
- Modify: `server/admin-ui/src/App.tsx`
- Create: `server/admin-ui/src/api/client.ts`
- Create: `server/admin-ui/src/state/session.ts`
- Create: `server/admin-ui/src/components/AppShell.tsx`
- Create: `server/admin-ui/src/components/AuthGuard.tsx`
- Create: `server/admin-ui/src/components/SessionExpiredModal.tsx`
- Create: `server/admin-ui/src/components/Modal.tsx`
- Create: `server/admin-ui/src/routes/Login.tsx`
- Create: `server/admin-ui/src/routes/Dashboard.tsx`
- Test: `server/admin-ui/tests/unit/Login.test.tsx`
- Test: `server/admin-ui/tests/unit/SessionExpiredModal.test.tsx`

- [ ] **Step 1: Implement `server/admin-ui/src/api/client.ts`**

A thin fetch wrapper that:
- Sends credentials (cookie) with every request
- Throws `ApiError` with structured `{ code, message, status }` on non-2xx
- Notifies a global session-expired listener on 401

```ts
export interface ApiErrorBody { code: string; message: string; }
export class ApiError extends Error {
  constructor(public code: string, public override message: string, public status: number) {
    super(message);
  }
}

type SessionExpiredListener = () => void;
let sessionListener: SessionExpiredListener | null = null;
export function setSessionExpiredListener(fn: SessionExpiredListener): void {
  sessionListener = fn;
}

export async function api<T>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(input, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (res.status === 401) {
    sessionListener?.();
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiError(body?.error?.code ?? 'UNAUTHENTICATED', body?.error?.message ?? 'login required', 401);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: ApiErrorBody } | null;
    throw new ApiError(body?.error?.code ?? 'INTERNAL', body?.error?.message ?? 'request failed', res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

- [ ] **Step 2: Implement `server/admin-ui/src/state/session.ts`**

```ts
import { create } from 'zustand/vanilla';
import { useSyncExternalStore } from 'react';

interface SessionStore {
  expiredVisible: boolean;
  setExpired(): void;
  dismissExpired(): void;
}

const store = create<SessionStore>((set) => ({
  expiredVisible: false,
  setExpired: () => set({ expiredVisible: true }),
  dismissExpired: () => set({ expiredVisible: false }),
}));

export function useSession() {
  const expiredVisible = useSyncExternalStore(store.subscribe, () => store.getState().expiredVisible);
  return {
    expiredVisible,
    setExpired: store.getState().setExpired,
    dismissExpired: store.getState().dismissExpired,
  };
}

export const sessionStore = store;
```

Then `cd server/admin-ui && npm install zustand@^5`.

- [ ] **Step 3: Implement `server/admin-ui/src/components/Modal.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Modal({
  open, onClose, title, children,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
      display: 'grid', placeItems: 'center', zIndex: 50,
    }}>
      <div style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 320, maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button onClick={onClose}>確認</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement `server/admin-ui/src/components/SessionExpiredModal.tsx`**

```tsx
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '../state/session.js';
import { Modal } from './Modal.js';

export function SessionExpiredModal() {
  const { expiredVisible, dismissExpired } = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  return (
    <Modal
      open={expiredVisible}
      title="請先登入"
      onClose={() => {
        dismissExpired();
        qc.clear();
        nav('/admin/login', { replace: true });
      }}
    >
      <p>連線階段已過期或您尚未登入。請重新登入後繼續操作。</p>
    </Modal>
  );
}
```

- [ ] **Step 5: Implement `server/admin-ui/src/routes/Login.tsx`**

```tsx
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { api, ApiError } from '../api/client.js';

export function Login() {
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/admin/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      nav('/admin/');
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'LOGIN_RATE_LIMITED') setError('嘗試次數過多，請稍後再試');
      else setError('帳號或密碼錯誤');
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '10vh auto', fontFamily: 'sans-serif' }}>
      <h1>Lucky Wheels Admin</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                 style={{ width: '100%', display: 'block', marginBottom: 12 }} />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
                 style={{ width: '100%', display: 'block', marginBottom: 12 }} />
        </label>
        <button type="submit" style={{ width: '100%' }}>登入</button>
        {error && <p role="alert" style={{ color: '#c00' }}>{error}</p>}
      </form>
    </main>
  );
}
```

- [ ] **Step 6: Implement `server/admin-ui/src/components/AuthGuard.tsx`**

```tsx
import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet } from 'react-router';
import { api } from '../api/client.js';

interface Me { id: string; email: string; role: string; }

export function AuthGuard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin', 'me'],
    queryFn: () => api<Me>('/api/admin/me'),
    retry: false,
  });
  if (isLoading) return <p>載入中…</p>;
  if (isError || !data) return <Navigate to="/admin/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 7: Implement `server/admin-ui/src/components/AppShell.tsx`**

```tsx
import { NavLink, Outlet } from 'react-router';

const sidebarLinks = [
  { to: '/admin/', label: '首頁', end: true },
  { to: '/admin/users', label: '會員列表' },
  { to: '/admin/redemptions', label: '中獎紀錄' },
  { to: '/admin/profile', label: '個人設定' },
  { to: '/admin/logs', label: '歷史紀錄' },
];

export function AppShell() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', minHeight: '100vh' }}>
      <nav style={{ background: '#1f2937', color: '#fff', padding: 16 }}>
        <h2 style={{ fontSize: 16 }}>Lucky Wheels Admin</h2>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {sidebarLinks.map((l) => (
            <li key={l.to}>
              <NavLink
                to={l.to}
                end={l.end}
                style={({ isActive }) => ({
                  display: 'block',
                  padding: '8px 12px',
                  color: '#fff',
                  background: isActive ? '#374151' : 'transparent',
                  textDecoration: 'none',
                  borderRadius: 4,
                })}
              >
                {l.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <main style={{ padding: 24 }}>
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 8: Implement `server/admin-ui/src/routes/Dashboard.tsx`**

Minimal landing page — real cards land in later tasks.

```tsx
export function Dashboard() {
  return (
    <section>
      <h1>儀表板</h1>
      <p>歡迎使用 Lucky Wheels Admin。請從左側選單進入各模組。</p>
    </section>
  );
}
```

- [ ] **Step 9: Rewrite `server/admin-ui/src/App.tsx`** to wire it all together

```tsx
import { BrowserRouter, Routes, Route } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { setSessionExpiredListener } from './api/client.js';
import { sessionStore } from './state/session.js';
import { AuthGuard } from './components/AuthGuard.js';
import { AppShell } from './components/AppShell.js';
import { SessionExpiredModal } from './components/SessionExpiredModal.js';
import { Login } from './routes/Login.js';
import { Dashboard } from './routes/Dashboard.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

function GlobalSessionWire() {
  useEffect(() => {
    setSessionExpiredListener(() => sessionStore.getState().setExpired());
  }, []);
  return null;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename="/admin">
        <GlobalSessionWire />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<AuthGuard />}>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
            </Route>
          </Route>
        </Routes>
        <SessionExpiredModal />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 10: Add component unit tests**

Create `server/admin-ui/tests/unit/SessionExpiredModal.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionExpiredModal } from '../../src/components/SessionExpiredModal.js';
import { sessionStore } from '../../src/state/session.js';

function renderWith(node: React.ReactNode) {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{node}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('SessionExpiredModal', () => {
  it('is hidden by default', () => {
    sessionStore.setState({ expiredVisible: false });
    renderWith(<SessionExpiredModal />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows when sessionStore.expiredVisible is true', () => {
    sessionStore.setState({ expiredVisible: true });
    renderWith(<SessionExpiredModal />);
    expect(screen.getByText('請先登入')).toBeDefined();
  });
});
```

Create `server/admin-ui/tests/unit/Login.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Login } from '../../src/routes/Login.js';

describe('Login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('renders the email + password inputs and a 登入 button', () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByRole('button', { name: '登入' })).toBeDefined();
  });

  it('shows a 帳號或密碼錯誤 error on 401', async () => {
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'BAD_CREDENTIALS', message: 'bad' } }),
        { status: 401, headers: { 'content-type': 'application/json' } }),
    );
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: '登入' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('帳號或密碼錯誤');
  });
});
```

- [ ] **Step 11: Run admin-ui tests (FAIL initially, PASS after install)**

```bash
cd server/admin-ui && npm install zustand @testing-library/dom
cd server/admin-ui && npx vitest run
```

Expected: PASS for both `SessionExpiredModal` and `Login`.

- [ ] **Step 12: Build the admin SPA to confirm Vite compiles**

```bash
cd server/admin-ui && npm run build
```

Expected: `server/admin-ui/dist/index.html` exists. Re-run the scaffold integration test in Task 1; it should still pass (now serving the real built bundle).

- [ ] **Step 13: Commit**

```bash
git add server/admin-ui/
git commit -m "feat(admin-ui): AppShell + sidebar + auth guard + login + global 401 modal"
```

---

## Task 6: CLI `npm run admin:create`

A `tsx` script that hashes a password and inserts an `admin_users` row. Idempotent on email (errors if duplicate).

**Files:**
- Create: `server/scripts/create-admin.ts`
- Modify: `server/package.json` (add `admin:create` script)
- Test: `server/tests/unit/admin/create-admin-script.test.ts` (functional test of the helper)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/admin/create-admin-script.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { createAdminAccount } from '../../../scripts/create-admin.js';
import { verifyPassword } from '../../../src/admin/auth/password.js';

describe('createAdminAccount', () => {
  beforeEach(resetDb);

  it('creates an admin row with hashed password', async () => {
    await createAdminAccount({ email: 'first@example.com', password: 'pw-1234567890' });
    const row = await prisma.adminUser.findUnique({ where: { email: 'first@example.com' } });
    expect(row).not.toBeNull();
    expect(row?.passwordHash).not.toBe('pw-1234567890');
    expect(await verifyPassword('pw-1234567890', row!.passwordHash)).toBe(true);
  });

  it('rejects passwords shorter than 12 chars', async () => {
    await expect(createAdminAccount({ email: 'short@example.com', password: 'abc' }))
      .rejects.toThrow(/at least 12/);
  });

  it('throws if email already exists', async () => {
    await createAdminAccount({ email: 'dup@example.com', password: 'pw-1234567890' });
    await expect(createAdminAccount({ email: 'dup@example.com', password: 'pw-1234567890' }))
      .rejects.toThrow(/already exists/);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/admin/create-admin-script.test.ts
```

- [ ] **Step 3: Implement `server/scripts/create-admin.ts`**

```ts
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/admin/auth/password.js';

export interface CreateAdminInput {
  email: string;
  password: string;
}

export async function createAdminAccount(input: CreateAdminInput): Promise<{ id: string; email: string }> {
  if (input.password.length < 12) {
    throw new Error('password must be at least 12 characters');
  }
  const existing = await prisma.adminUser.findUnique({ where: { email: input.email } });
  if (existing) throw new Error(`admin with email ${input.email} already exists`);
  const created = await prisma.adminUser.create({
    data: {
      email: input.email,
      passwordHash: await hashPassword(input.password),
      role: 'admin',
      passwordChangedAt: new Date(),
    },
  });
  return { id: created.id, email: created.email };
}

// CLI entry point
function parseArgs(argv: string[]): CreateAdminInput {
  const args = new Map<string, string>();
  for (let i = 2; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k && v) args.set(k.replace(/^--/, ''), v);
  }
  const email = args.get('email');
  const password = args.get('password');
  if (!email || !password) {
    throw new Error('usage: npm run admin:create -- --email <email> --password <password>');
  }
  return { email, password };
}

if (process.argv[1]?.endsWith('create-admin.ts') || process.argv[1]?.endsWith('create-admin.js')) {
  const input = parseArgs(process.argv);
  createAdminAccount(input)
    .then(({ id, email }) => {
      console.log(`created admin ${id} (${email})`);
      return prisma.$disconnect();
    })
    .catch(async (err) => {
      console.error(`error: ${(err as Error).message}`);
      await prisma.$disconnect();
      process.exit(1);
    });
}
```

- [ ] **Step 4: Add script to `server/package.json`**

```json
"admin:create": "tsx scripts/create-admin.ts"
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/admin/create-admin-script.test.ts
```

- [ ] **Step 6: Smoke the CLI manually**

```bash
cd server && npm run admin:create -- --email ops@example.com --password testpassword-12
```

Expected stdout: `created admin <cuid> (ops@example.com)`. Re-running with the same email errors out.

- [ ] **Step 7: Commit**

```bash
git add server/scripts/create-admin.ts server/package.json server/tests/unit/admin/create-admin-script.test.ts
git commit -m "feat(server): npm run admin:create CLI"
```

---

## Task 7: GET /api/admin/users — list + filter + member list UI

Paginated list endpoint with `tab` (verified|test), `q` (search across nickname / displayName / lineUserId / entertainmentMemberCode), and cursor pagination. UI lands with the two tabs, search box, and a row-action dropdown placeholder (the real per-row actions wire up in Tasks 9-13).

**Files:**
- Create: `server/src/admin/routes/users.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/users_list.test.ts`
- Create: `server/admin-ui/src/api/users.ts`
- Create: `server/admin-ui/src/components/AccountTypeBadge.tsx`
- Create: `server/admin-ui/src/components/Table.tsx`
- Create: `server/admin-ui/src/routes/Members.tsx`
- Modify: `server/admin-ui/src/App.tsx` (route)
- Test: `server/admin-ui/tests/unit/Members.test.tsx`

- [ ] **Step 1: Write failing backend test**

```ts
// server/tests/integration/admin/users_list.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('GET /api/admin/users', () => {
  beforeEach(resetDb);

  it('401 without session', async () => {
    const r = await app.request('/api/admin/users');
    expect(r.status).toBe(401);
  });

  it('returns verified users on tab=verified (default)', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'A', accountType: 'verified' });
    await createUser({ nickname: 'B', accountType: 'test' });
    await createUser({ nickname: 'C', accountType: 'blacklisted' });
    const r = await app.request('/api/admin/users', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    const nicks = body.items.map((u: { nickname: string }) => u.nickname).sort();
    // verified tab includes verified + blacklisted (per spec: blacklist stays in original tab)
    expect(nicks).toEqual(['A', 'C']);
  });

  it('returns only test users on tab=test', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'A', accountType: 'verified' });
    await createUser({ nickname: 'B', accountType: 'test' });
    const r = await app.request('/api/admin/users?tab=test', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].nickname).toBe('B');
  });

  it('search q matches across nickname / displayName / lineUserId / code', async () => {
    const admin = await createAdmin();
    await createUser({ nickname: 'alice', displayName: 'ALICE-LINE', lineUserId: 'U_alice', entertainmentMemberCode: 'EM_AA01' });
    await createUser({ nickname: 'bob', displayName: 'BOB-LINE', lineUserId: 'U_bob', entertainmentMemberCode: 'EM_BB02' });
    const headers = await adminHeaders(admin.id, admin.email);
    expect((await (await app.request('/api/admin/users?q=alice', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=BOB-LINE', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=EM_AA', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/users?q=zzz', { headers })).json()).items).toHaveLength(0);
  });

  it('cursor pagination: take=2 + nextCursor', async () => {
    const admin = await createAdmin();
    for (let i = 0; i < 5; i++) await createUser({ nickname: `n${i}` });
    const r = await app.request('/api/admin/users?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_list.test.ts
```

- [ ] **Step 3: Implement `server/src/admin/routes/users.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';

export const adminUsersRoutes = new Hono();

const ListQuery = z.object({
  tab: z.enum(['verified', 'test']).default('verified'),
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
});

adminUsersRoutes.get('/api/admin/users', requireAdmin, async (c) => {
  let query: z.infer<typeof ListQuery>;
  try { query = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query parameters', 400); }

  const tabFilter = query.tab === 'test'
    ? { accountType: 'test' as const }
    : { accountType: { in: ['verified', 'blacklisted'] as const } };

  const where = {
    ...tabFilter,
    ...(query.q ? {
      OR: [
        { nickname: { contains: query.q, mode: 'insensitive' as const } },
        { displayName: { contains: query.q, mode: 'insensitive' as const } },
        { lineUserId: { contains: query.q, mode: 'insensitive' as const } },
        { entertainmentMemberCode: { startsWith: query.q, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const items = await prisma.user.findMany({
    where,
    take: query.take + 1,                       // pull one extra to compute nextCursor
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, nickname: true, displayName: true, pictureUrl: true,
      lineUserId: true, entertainmentMemberCode: true, accountType: true,
      points: true, lifetimeDrawCount: true, blacklistedAt: true, createdAt: true,
    },
  });

  let nextCursor: string | null = null;
  if (items.length > query.take) {
    const next = items.pop()!;
    nextCursor = next.id;
  }
  return c.json({ items, nextCursor });
});
```

- [ ] **Step 4: Mount in `server/src/index.ts`**

```ts
import { adminUsersRoutes } from './admin/routes/users.js';
app.route('/', adminUsersRoutes);
```

- [ ] **Step 5: Run backend test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_list.test.ts
```

- [ ] **Step 6: Add SPA API binding `server/admin-ui/src/api/users.ts`**

```ts
import { api } from './client.js';

export interface AdminUserRow {
  id: string;
  nickname: string | null;
  displayName: string;
  pictureUrl: string | null;
  lineUserId: string;
  entertainmentMemberCode: string | null;
  accountType: 'verified' | 'test' | 'blacklisted';
  points: number;
  lifetimeDrawCount: number;
  blacklistedAt: string | null;
  createdAt: string;
}

export interface UsersListResponse {
  items: AdminUserRow[];
  nextCursor: string | null;
}

export interface UsersListQuery {
  tab?: 'verified' | 'test';
  q?: string;
  take?: number;
  cursor?: string;
}

export function fetchUsers(q: UsersListQuery): Promise<UsersListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined) params.set(k, String(v));
  }
  return api(`/api/admin/users?${params.toString()}`);
}
```

- [ ] **Step 7: Implement `server/admin-ui/src/components/AccountTypeBadge.tsx`**

```tsx
const STYLES: Record<string, { background: string; color: string; label: string }> = {
  verified: { background: '#dcfce7', color: '#166534', label: '正式' },
  test: { background: '#dbeafe', color: '#1e3a8a', label: '測試' },
  blacklisted: { background: '#fee2e2', color: '#7f1d1d', label: '黑名單' },
};

export function AccountTypeBadge({ type }: { type: 'verified' | 'test' | 'blacklisted' }) {
  const s = STYLES[type];
  return (
    <span style={{
      background: s.background, color: s.color,
      padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
    }}>{s.label}</span>
  );
}
```

- [ ] **Step 8: Implement `server/admin-ui/src/components/Table.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Table<T>({ rows, columns, rowKey }: {
  rows: T[];
  columns: { header: string; cell: (row: T) => ReactNode }[];
  rowKey: (row: T) => string;
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.header} style={{ textAlign: 'left', borderBottom: '1px solid #ccc', padding: 8 }}>
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={rowKey(r)}>
            {columns.map((c) => (
              <td key={c.header} style={{ borderBottom: '1px solid #eee', padding: 8 }}>
                {c.cell(r)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 9: Implement `server/admin-ui/src/routes/Members.tsx`**

```tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchUsers, type AdminUserRow } from '../api/users.js';
import { Table } from '../components/Table.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';

export function Members() {
  const [tab, setTab] = useState<'verified' | 'test'>('verified');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', tab, q],
    queryFn: () => fetchUsers({ tab, q: q || undefined }),
  });

  return (
    <section>
      <h1>會員列表</h1>
      <div style={{ marginBottom: 16 }}>
        <button onClick={() => setTab('verified')} disabled={tab === 'verified'}>正式會員</button>
        <button onClick={() => setTab('test')} disabled={tab === 'test'}>測試會員</button>
        <input
          placeholder="搜尋暱稱 / LINE 名 / lineUserId / 娛樂城編號 / Redemption code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ marginLeft: 16, minWidth: 320 }}
        />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <Table<AdminUserRow>
          rows={data.items}
          rowKey={(u) => u.id}
          columns={[
            { header: '暱稱', cell: (u) => <Link to={`/admin/users/${u.id}`}>{u.nickname ?? '(未填)'}</Link> },
            { header: 'LINE 名', cell: (u) => u.displayName },
            { header: '娛樂城編號', cell: (u) => u.entertainmentMemberCode ?? '—' },
            { header: '帳號類型', cell: (u) => <AccountTypeBadge type={u.accountType} /> },
            { header: '積分', cell: (u) => u.points },
            { header: '累計抽獎', cell: (u) => u.lifetimeDrawCount },
          ]}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 10: Add the route in `server/admin-ui/src/App.tsx`**

Inside the `<Route element={<AppShell />}>` block, add:

```tsx
import { Members } from './routes/Members.js';
// ...
<Route path="users" element={<Members />} />
```

- [ ] **Step 11: Write a smoke test for Members**

```tsx
// server/admin-ui/tests/unit/Members.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Members } from '../../src/routes/Members.js';

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    new Response(JSON.stringify({
      items: [
        { id: 'u1', nickname: 'Alice', displayName: 'ALICE', pictureUrl: null, lineUserId: 'U_a',
          entertainmentMemberCode: 'EM_AA', accountType: 'verified', points: 28,
          lifetimeDrawCount: 3, blacklistedAt: null, createdAt: '2026-06-01' },
      ],
      nextCursor: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } }),
  ));
});

describe('Members', () => {
  it('renders the row with nickname + account type badge', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Members /></MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText('Alice')).toBeDefined();
    expect(screen.getByText('正式')).toBeDefined();
  });
});
```

- [ ] **Step 12: Run admin-ui tests**

```bash
cd server/admin-ui && npx vitest run
```

- [ ] **Step 13: Commit**

```bash
git add server/src/admin/routes/users.ts server/src/index.ts server/tests/integration/admin/users_list.test.ts server/admin-ui/
git commit -m "feat(admin): GET /api/admin/users + Members list UI (tabs + search + cursor pagination)"
```

---

## Task 8: GET /api/admin/users/:id + MemberDetail page

**Files:**
- Modify: `server/src/admin/routes/users.ts` (add detail handler)
- Test: `server/tests/integration/admin/users_detail.test.ts`
- Modify: `server/admin-ui/src/api/users.ts` (add `fetchUser`)
- Create: `server/admin-ui/src/routes/MemberDetail.tsx`
- Modify: `server/admin-ui/src/App.tsx` (route)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_detail.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('GET /api/admin/users/:id', () => {
  beforeEach(resetDb);

  it('returns the full user record', async () => {
    const admin = await createAdmin();
    const user = await createUser({ nickname: 'Test', points: 28, accountType: 'test', testSkipCost: true, testForcePrizeId: null });
    const r = await app.request(`/api/admin/users/${user.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body).toMatchObject({
      id: user.id, nickname: 'Test', accountType: 'test',
      testSkipCost: true, testForcePrizeId: null,
      points: 28,
    });
    expect(body.entertainmentMemberCode).not.toBeNull();
  });

  it('404 USER_NOT_FOUND when id missing', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/users/does_not_exist', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('USER_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_detail.test.ts
```

- [ ] **Step 3: Add handler to `server/src/admin/routes/users.ts`**

```ts
adminUsersRoutes.get('/api/admin/users/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
  return c.json(user);
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_detail.test.ts
```

- [ ] **Step 5: Add API hook in `server/admin-ui/src/api/users.ts`**

```ts
export interface AdminUserDetail extends AdminUserRow {
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  blacklistReason: string | null;
  blacklistedByAdminUserId: string | null;
  entertainmentCodeBoundAt: string | null;
}

export function fetchUser(id: string): Promise<AdminUserDetail> {
  return api(`/api/admin/users/${id}`);
}
```

- [ ] **Step 6: Implement `server/admin-ui/src/routes/MemberDetail.tsx`**

```tsx
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUser } from '../api/users.js';
import { AccountTypeBadge } from '../components/AccountTypeBadge.js';

export function MemberDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', id],
    queryFn: () => fetchUser(id!),
    enabled: Boolean(id),
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section>
      <h1>{data.nickname ?? '(未填暱稱)'}　<AccountTypeBadge type={data.accountType} /></h1>
      <dl>
        <dt>LINE 名</dt><dd>{data.displayName}</dd>
        <dt>lineUserId</dt><dd>{data.lineUserId}</dd>
        <dt>娛樂城會員編號</dt><dd>{data.entertainmentMemberCode ?? '—'}</dd>
        <dt>積分</dt><dd>{data.points}</dd>
        <dt>累計抽獎</dt><dd>{data.lifetimeDrawCount}</dd>
      </dl>
      {data.accountType === 'test' && (
        <section>
          <h2>測試帳號設定</h2>
          <p>testSkipCost：{String(data.testSkipCost)}</p>
          <p>testForcePrizeId：{data.testForcePrizeId ?? '—'}</p>
        </section>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Add route in `App.tsx`**

```tsx
import { MemberDetail } from './routes/MemberDetail.js';
// ...
<Route path="users/:id" element={<MemberDetail />} />
```

- [ ] **Step 8: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_detail.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/routes/MemberDetail.tsx server/admin-ui/src/App.tsx
git commit -m "feat(admin): GET /api/admin/users/:id + MemberDetail page"
```

---

## Task 9: POST /api/admin/users/:id/points — adjust ±points + reason

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_points.test.ts`
- Create: `server/admin-ui/src/components/Modal.tsx`
- Create: `server/admin-ui/src/components/ConfirmModal.tsx`
- Modify: `server/admin-ui/src/api/users.ts`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx`
- Test: `server/admin-ui/tests/unit/ConfirmModal.test.tsx`

- [ ] **Step 1: Write failing backend test**

```ts
// server/tests/integration/admin/users_points.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('POST /api/admin/users/:id/points', () => {
  beforeEach(resetDb);

  it('adds points, writes audit log, returns new balance', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 5 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 6, reason: '客服補償' }),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).points).toBe(11);
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(11);
    const log = await prisma.adminActionLog.findFirst({ where: { action: 'user.points_adjust', targetId: user.id } });
    expect(log).toBeTruthy();
    expect(log!.payload).toMatchObject({ delta: 6, before: 5, after: 11, reason: '客服補償' });
    expect(log!.adminUserId).toBe(admin.id);
  });

  it('subtracts points and refuses to go negative (POINTS_WOULD_GO_NEGATIVE 422)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 3 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: -10, reason: '修正錯誤' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('POINTS_WOULD_GO_NEGATIVE');
    const refreshed = await prisma.user.findUnique({ where: { id: user.id } });
    expect(refreshed!.points).toBe(3);
  });

  it('delta=0 rejected as 400 POINTS_DELTA_ZERO', async () => {
    const admin = await createAdmin();
    const user = await createUser({ points: 1 });
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 0, reason: 'noop' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('POINTS_DELTA_ZERO');
  });

  it('reason missing → 400 POINTS_REASON_REQUIRED', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const r = await app.request(`/api/admin/users/${user.id}/points`, {
      method: 'POST',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ delta: 1 }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('POINTS_REASON_REQUIRED');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_points.test.ts
```

- [ ] **Step 3: Add handler to `server/src/admin/routes/users.ts`**

```ts
import { audit } from '../audit/helper.js';

const PointsAdjustBody = z.object({
  delta: z.number().int(),
  reason: z.string().min(1).max(500),
});

adminUsersRoutes.post('/api/admin/users/:id/points', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof PointsAdjustBody>;
  try {
    const raw = await c.req.json();
    if (raw.reason === undefined || raw.reason === null || raw.reason === '') {
      throw new AppError('POINTS_REASON_REQUIRED', 'reason is required', 400);
    }
    body = PointsAdjustBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('POINTS_BODY_INVALID', 'invalid body', 400);
  }
  if (body.delta === 0) throw new AppError('POINTS_DELTA_ZERO', 'delta must be non-zero', 400);

  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    const before = user.points;
    const after = before + body.delta;
    if (after < 0) throw new AppError('POINTS_WOULD_GO_NEGATIVE', 'resulting balance would be negative', 422);
    const u = await tx.user.update({ where: { id: userId }, data: { points: after } });
    await audit(c, tx, {
      action: 'user.points_adjust',
      targetType: 'user',
      targetId: userId,
      payload: { delta: body.delta, before, after, reason: body.reason },
    });
    return u;
  });
  return c.json({ points: updated.points });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_points.test.ts
```

- [ ] **Step 5: Implement `server/admin-ui/src/components/Modal.tsx`**

```tsx
import type { ReactNode } from 'react';

export function Modal({ open, onClose, title, children }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#fff', padding: 24, borderRadius: 8, minWidth: 360, maxWidth: 600 }}
      >
        <h2 style={{ marginTop: 0 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Implement `server/admin-ui/src/components/ConfirmModal.tsx`**

```tsx
import { useState } from 'react';
import { Modal } from './Modal.js';

export function ConfirmModal({ open, onClose, title, description, requireReason, confirmLabel = '確認', onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  requireReason?: boolean;
  confirmLabel?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const canSubmit = !requireReason || reason.trim().length > 0;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      {description && <p>{description}</p>}
      {requireReason && (
        <label style={{ display: 'block', marginBottom: 12 }}>
          原因（必填）
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: 4 }}
          />
        </label>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={busy}>取消</button>
        <button
          disabled={!canSubmit || busy}
          onClick={() => onConfirm(requireReason ? reason : undefined)}
        >
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 7: Add API binding in `server/admin-ui/src/api/users.ts`**

```ts
export function adjustPoints(id: string, body: { delta: number; reason: string }): Promise<{ points: number }> {
  return api(`/api/admin/users/${id}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 8: Wire up button + modal in `MemberDetail.tsx`**

```tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { adjustPoints } from '../api/users.js';
import { ConfirmModal } from '../components/ConfirmModal.js';

// inside MemberDetail component:
const [pointsModal, setPointsModal] = useState<null | { delta: number }>(null);
const qc = useQueryClient();
const adjust = useMutation({
  mutationFn: ({ delta, reason }: { delta: number; reason: string }) =>
    adjustPoints(id!, { delta, reason }),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
    setPointsModal(null);
  },
});

// in JSX, alongside existing dl:
<div style={{ marginTop: 16 }}>
  <button onClick={() => setPointsModal({ delta: 6 })}>+6 積分</button>
  <button onClick={() => setPointsModal({ delta: -1 })}>-1 積分</button>
  <button onClick={() => {
    const raw = window.prompt('輸入自訂積分變動（如 +5 或 -3）');
    const n = raw ? Number(raw) : NaN;
    if (Number.isInteger(n) && n !== 0) setPointsModal({ delta: n });
  }}>其他</button>
</div>
<ConfirmModal
  open={pointsModal !== null}
  onClose={() => setPointsModal(null)}
  title={`調整積分（${(pointsModal?.delta ?? 0) > 0 ? '+' : ''}${pointsModal?.delta ?? 0}）`}
  description={`目前餘額：${data.points}`}
  requireReason
  busy={adjust.isPending}
  onConfirm={(reason) =>
    adjust.mutate({ delta: pointsModal!.delta, reason: reason! })
  }
/>
```

- [ ] **Step 9: Smoke-test ConfirmModal**

```tsx
// server/admin-ui/tests/unit/ConfirmModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmModal } from '../../src/components/ConfirmModal.js';

describe('ConfirmModal', () => {
  it('disables confirm until reason filled in when requireReason', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmModal
        open
        onClose={() => {}}
        title="調整積分"
        requireReason
        onConfirm={onConfirm}
      />,
    );
    const confirmBtn = screen.getByRole('button', { name: '確認' });
    expect(confirmBtn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '客服補償' } });
    expect(confirmBtn).toHaveProperty('disabled', false);
    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith('客服補償');
  });
});
```

- [ ] **Step 10: Run tests + commit**

```bash
cd server && npx vitest run tests/integration/admin/users_points.test.ts
cd server/admin-ui && npx vitest run tests/unit/ConfirmModal.test.tsx
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_points.test.ts server/admin-ui/
git commit -m "feat(admin): adjust user points with reason + ConfirmModal"
```

---

## Task 10: PATCH /api/admin/users/:id/account-type — verified / test / blacklisted swap

Switch between `verified` and `test` for an existing user. Blacklisting is handled by a dedicated endpoint in Task 12; this endpoint **refuses** to change `accountType` to or from `blacklisted` so the two flows can't be confused.

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_account_type.test.ts`
- Modify: `server/admin-ui/src/api/users.ts`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_account_type.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/account-type', () => {
  beforeEach(resetDb);

  it('promotes a test user to verified and audit-logs before/after', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'test', testSkipCost: true });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'verified' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('verified');
    expect(u!.testSkipCost).toBe(false);
    expect(u!.testForcePrizeId).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'user.account_type_change' } });
    expect(log.payload).toMatchObject({ before: 'test', after: 'verified' });
  });

  it('demotes verified → test', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'test' }),
    });
    expect(r.status).toBe(200);
  });

  it('refuses blacklisted (use dedicated endpoint) → 400 ACCOUNT_TYPE_BLACKLIST_DISALLOWED', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'blacklisted' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ACCOUNT_TYPE_BLACKLIST_DISALLOWED');
  });

  it('refuses change away from blacklisted via this endpoint', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'blacklisted', blacklistedAt: new Date(), blacklistReason: 'fraud' });
    const r = await app.request(`/api/admin/users/${user.id}/account-type`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ accountType: 'verified' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ACCOUNT_TYPE_BLACKLIST_DISALLOWED');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_account_type.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
const AccountTypeBody = z.object({
  accountType: z.enum(['verified', 'test']),  // 'blacklisted' deliberately excluded
});

adminUsersRoutes.patch('/api/admin/users/:id/account-type', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof AccountTypeBody>;
  try {
    const raw = await c.req.json();
    if (raw.accountType === 'blacklisted') {
      throw new AppError('ACCOUNT_TYPE_BLACKLIST_DISALLOWED', 'use the blacklist endpoint', 400);
    }
    body = AccountTypeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ACCOUNT_TYPE_BODY_INVALID', 'invalid body', 400);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType === 'blacklisted') {
      throw new AppError('ACCOUNT_TYPE_BLACKLIST_DISALLOWED', 'unblacklist via the blacklist endpoint', 400);
    }
    if (user.accountType === body.accountType) return;             // no-op
    await tx.user.update({
      where: { id: userId },
      data: {
        accountType: body.accountType,
        // demoting to a non-test type clears test settings
        ...(body.accountType !== 'test' ? { testSkipCost: false, testForcePrizeId: null } : {}),
      },
    });
    await audit(c, tx, {
      action: 'user.account_type_change',
      targetType: 'user',
      targetId: userId,
      payload: { before: user.accountType, after: body.accountType },
    });
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_account_type.test.ts
```

- [ ] **Step 5: API binding + UI button**

```ts
// server/admin-ui/src/api/users.ts
export function setAccountType(id: string, accountType: 'verified' | 'test'): Promise<{ ok: true }> {
  return api(`/api/admin/users/${id}/account-type`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountType }),
  });
}
```

In `MemberDetail.tsx`, next to the badge, add a switch button hidden when the user is blacklisted:

```tsx
{data.accountType !== 'blacklisted' && (
  <button
    onClick={() => {
      const next = data.accountType === 'test' ? 'verified' : 'test';
      if (window.confirm(`切換為「${next === 'test' ? '測試' : '正式'}」會員？`)) {
        setAccountType(id!, next).then(() =>
          qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
        );
      }
    }}
  >
    切換為{data.accountType === 'test' ? '正式' : '測試'}會員
  </button>
)}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_account_type.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/routes/MemberDetail.tsx
git commit -m "feat(admin): PATCH account-type with verified↔test only (blacklist via dedicated endpoint)"
```

---

## Task 11: PATCH /api/admin/users/:id/test-settings — testSkipCost / testForcePrizeId

Only meaningful when `accountType = 'test'`. The endpoint rejects non-test users with `TEST_SETTINGS_REQUIRES_TEST_ACCOUNT`. When `testForcePrizeId` is provided non-null, it must reference an existing `Prize.id`.

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_test_settings.test.ts`
- Modify: `server/admin-ui/src/api/users.ts`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx` (test settings panel)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_test_settings.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/test-settings', () => {
  beforeEach(resetDb);

  it('updates testSkipCost + testForcePrizeId and logs both sides', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'test' });
    const prize = await createPrize({ name: 'Test prize' });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testSkipCost: true, testForcePrizeId: prize.id }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.testSkipCost).toBe(true);
    expect(u!.testForcePrizeId).toBe(prize.id);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'user.test_settings_change' } });
    expect(log.payload).toMatchObject({
      before: { testSkipCost: false, testForcePrizeId: null },
      after: { testSkipCost: true, testForcePrizeId: prize.id },
    });
  });

  it('clears testForcePrizeId when null', async () => {
    const admin = await createAdmin();
    const prize = await createPrize({ name: 'P' });
    const user = await createUser({ accountType: 'test', testForcePrizeId: prize.id });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testForcePrizeId: null }),
    });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))!.testForcePrizeId).toBeNull();
  });

  it('rejects when user is not test (TEST_SETTINGS_REQUIRES_TEST_ACCOUNT)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testSkipCost: true }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('TEST_SETTINGS_REQUIRES_TEST_ACCOUNT');
  });

  it('rejects unknown prize id (TEST_FORCE_PRIZE_NOT_FOUND 404)', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'test' });
    const r = await app.request(`/api/admin/users/${user.id}/test-settings`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ testForcePrizeId: 'does_not_exist' }),
    });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('TEST_FORCE_PRIZE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_test_settings.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
const TestSettingsBody = z.object({
  testSkipCost: z.boolean().optional(),
  testForcePrizeId: z.string().nullable().optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/test-settings', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof TestSettingsBody>;
  try { body = TestSettingsBody.parse(await c.req.json()); }
  catch { throw new AppError('TEST_SETTINGS_BODY_INVALID', 'invalid body', 400); }

  if (body.testSkipCost === undefined && body.testForcePrizeId === undefined) {
    throw new AppError('TEST_SETTINGS_NO_OP', 'no fields to update', 400);
  }

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    if (user.accountType !== 'test') {
      throw new AppError('TEST_SETTINGS_REQUIRES_TEST_ACCOUNT', 'user is not a test account', 422);
    }
    if (body.testForcePrizeId) {
      const prize = await tx.prize.findUnique({ where: { id: body.testForcePrizeId } });
      if (!prize) throw new AppError('TEST_FORCE_PRIZE_NOT_FOUND', 'prize not found', 404);
    }
    const before = { testSkipCost: user.testSkipCost, testForcePrizeId: user.testForcePrizeId };
    const after = {
      testSkipCost: body.testSkipCost ?? user.testSkipCost,
      testForcePrizeId: body.testForcePrizeId === undefined ? user.testForcePrizeId : body.testForcePrizeId,
    };
    await tx.user.update({ where: { id: userId }, data: after });
    await audit(c, tx, {
      action: 'user.test_settings_change',
      targetType: 'user',
      targetId: userId,
      payload: { before, after },
    });
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_test_settings.test.ts
```

- [ ] **Step 5: API + UI binding**

```ts
// server/admin-ui/src/api/users.ts
export function updateTestSettings(id: string, body: { testSkipCost?: boolean; testForcePrizeId?: string | null }) {
  return api<{ ok: true }>(`/api/admin/users/${id}/test-settings`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

In `MemberDetail.tsx`, replace the placeholder test-settings panel with an editable form:

```tsx
{data.accountType === 'test' && (
  <section style={{ marginTop: 24, padding: 12, border: '1px solid #ddd' }}>
    <h2>測試帳號設定</h2>
    <label style={{ display: 'block', marginBottom: 8 }}>
      <input
        type="checkbox"
        defaultChecked={data.testSkipCost}
        onChange={(e) =>
          updateTestSettings(id!, { testSkipCost: e.target.checked }).then(() =>
            qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
          )
        }
      />
      不扣積分（測試專用）
    </label>
    <label style={{ display: 'block' }}>
      強制中獎 Prize ID（空白＝關閉）
      <input
        type="text"
        defaultValue={data.testForcePrizeId ?? ''}
        onBlur={(e) => {
          const v = e.target.value.trim();
          updateTestSettings(id!, { testForcePrizeId: v === '' ? null : v }).then(() =>
            qc.invalidateQueries({ queryKey: ['admin', 'users', id] }),
          );
        }}
        style={{ width: '100%', marginTop: 4 }}
      />
    </label>
  </section>
)}
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_test_settings.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/routes/MemberDetail.tsx
git commit -m "feat(admin): test-settings (testSkipCost / testForcePrizeId) with prize validation"
```

---

## Task 12: PATCH /api/admin/users/:id/blacklist — set / unset with required reason

Toggles `accountType` between `blacklisted` and the original type stored as `previousAccountType` in payload (we restore to `verified` if no previous record exists — first-block users are typically verified). On set, requires a reason; on unset, optional notes. Records `blacklistedAt`, `blacklistedByAdminUserId`, `blacklistReason`.

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_blacklist.test.ts`
- Modify: `server/admin-ui/src/api/users.ts`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx` (block / unblock button)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_blacklist.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/blacklist', () => {
  beforeEach(resetDb);

  it('blacklist=true sets type+timestamp+reason, logs previous type', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: true, reason: '套利行為' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('blacklisted');
    expect(u!.blacklistReason).toBe('套利行為');
    expect(u!.blacklistedByAdminUserId).toBe(admin.id);
    expect(u!.blacklistedAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'user.blacklist_set' } });
    expect(log.payload).toMatchObject({ before: 'verified', reason: '套利行為' });
  });

  it('blacklist=true rejected without reason', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: true }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('BLACKLIST_REASON_REQUIRED');
  });

  it('blacklist=false restores type to verified by default + clears reason', async () => {
    const admin = await createAdmin();
    const user = await createUser({
      accountType: 'blacklisted',
      blacklistedAt: new Date(),
      blacklistReason: 'old',
      blacklistedByAdminUserId: admin.id,
    });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: false }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.accountType).toBe('verified');
    expect(u!.blacklistedAt).toBeNull();
    expect(u!.blacklistReason).toBeNull();
    expect(u!.blacklistedByAdminUserId).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'user.blacklist_clear' } });
    expect(log.payload).toMatchObject({ restoreTo: 'verified' });
  });

  it('no-op when already in desired state → 200 ok no audit row', async () => {
    const admin = await createAdmin();
    const user = await createUser({ accountType: 'verified' });
    const r = await app.request(`/api/admin/users/${user.id}/blacklist`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ blacklist: false }),
    });
    expect(r.status).toBe(200);
    const logs = await prisma.adminActionLog.findMany({ where: { targetId: user.id } });
    expect(logs.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_blacklist.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
const BlacklistBody = z.object({
  blacklist: z.boolean(),
  reason: z.string().min(1).max(500).optional(),
  restoreTo: z.enum(['verified', 'test']).optional(),
});

adminUsersRoutes.patch('/api/admin/users/:id/blacklist', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof BlacklistBody>;
  try { body = BlacklistBody.parse(await c.req.json()); }
  catch { throw new AppError('BLACKLIST_BODY_INVALID', 'invalid body', 400); }
  if (body.blacklist && (!body.reason || body.reason.trim() === '')) {
    throw new AppError('BLACKLIST_REASON_REQUIRED', 'reason required when blacklisting', 400);
  }

  const adminId = c.get('adminUserId') as string;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
    const alreadyBlocked = user.accountType === 'blacklisted';
    if (body.blacklist && alreadyBlocked) return;                 // no-op
    if (!body.blacklist && !alreadyBlocked) return;               // no-op

    if (body.blacklist) {
      await tx.user.update({
        where: { id: userId },
        data: {
          accountType: 'blacklisted',
          blacklistedAt: new Date(),
          blacklistedByAdminUserId: adminId,
          blacklistReason: body.reason,
        },
      });
      await audit(c, tx, {
        action: 'user.blacklist_set',
        targetType: 'user',
        targetId: userId,
        payload: { before: user.accountType, reason: body.reason },
      });
    } else {
      const restoreTo = body.restoreTo ?? 'verified';
      await tx.user.update({
        where: { id: userId },
        data: {
          accountType: restoreTo,
          blacklistedAt: null,
          blacklistedByAdminUserId: null,
          blacklistReason: null,
        },
      });
      await audit(c, tx, {
        action: 'user.blacklist_clear',
        targetType: 'user',
        targetId: userId,
        payload: { restoreTo },
      });
    }
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_blacklist.test.ts
```

- [ ] **Step 5: API + UI binding**

```ts
// server/admin-ui/src/api/users.ts
export function setBlacklist(id: string, body: { blacklist: boolean; reason?: string; restoreTo?: 'verified' | 'test' }) {
  return api<{ ok: true }>(`/api/admin/users/${id}/blacklist`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

In `MemberDetail.tsx`, add:

```tsx
const [blacklistModal, setBlacklistModal] = useState<null | { mode: 'set' | 'clear' }>(null);
const blacklistMut = useMutation({
  mutationFn: (body: { blacklist: boolean; reason?: string }) => setBlacklist(id!, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
    setBlacklistModal(null);
  },
});

// button:
{data.accountType === 'blacklisted'
  ? <button onClick={() => setBlacklistModal({ mode: 'clear' })}>解除黑名單</button>
  : <button onClick={() => setBlacklistModal({ mode: 'set' })}>加入黑名單</button>}

// modal:
<ConfirmModal
  open={blacklistModal !== null}
  onClose={() => setBlacklistModal(null)}
  title={blacklistModal?.mode === 'set' ? '加入黑名單' : '解除黑名單'}
  description={blacklistModal?.mode === 'set' ? '請填寫原因（會記錄在 action log）' : undefined}
  requireReason={blacklistModal?.mode === 'set'}
  confirmLabel={blacklistModal?.mode === 'set' ? '加入' : '解除'}
  busy={blacklistMut.isPending}
  onConfirm={(reason) => blacklistMut.mutate({ blacklist: blacklistModal!.mode === 'set', reason })}
/>
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_blacklist.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/routes/MemberDetail.tsx
git commit -m "feat(admin): blacklist set/clear with required reason + restoreTo"
```

---

## Task 13: PATCH /api/admin/users/:id/entertainment-code — admin override

Admin can rebind / clear a user's `entertainmentMemberCode`. The member's own onboarding endpoint only allows first-time set; this admin endpoint is the only place rebinding can happen. Uniqueness across users is enforced via the existing `User.entertainmentMemberCode @unique` constraint — on collision we map `P2002 → ENTERTAINMENT_CODE_TAKEN 409`.

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_entertainment_code.test.ts`
- Modify: `server/admin-ui/src/api/users.ts`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_entertainment_code.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';

describe('PATCH /api/admin/users/:id/entertainment-code', () => {
  beforeEach(resetDb);

  it('rebinds code and records before/after', async () => {
    const admin = await createAdmin();
    const user = await createUser({ entertainmentMemberCode: 'EM_OLD' });
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_NEW', reason: '客戶反映輸錯' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.entertainmentMemberCode).toBe('EM_NEW');
    expect(u!.entertainmentCodeBoundAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'user.entertainment_code_change' } });
    expect(log.payload).toMatchObject({ before: 'EM_OLD', after: 'EM_NEW', reason: '客戶反映輸錯' });
  });

  it('clears code when code=null', async () => {
    const admin = await createAdmin();
    const user = await createUser({ entertainmentMemberCode: 'EM_X' });
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: null, reason: '退款後解除' }),
    });
    expect(r.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: user.id } });
    expect(u!.entertainmentMemberCode).toBeNull();
    expect(u!.entertainmentCodeBoundAt).toBeNull();
  });

  it('rejects collision with another user → 409 ENTERTAINMENT_CODE_TAKEN', async () => {
    const admin = await createAdmin();
    await createUser({ entertainmentMemberCode: 'EM_SHARED' });
    const target = await createUser({ entertainmentMemberCode: 'EM_OTHER' });
    const r = await app.request(`/api/admin/users/${target.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_SHARED', reason: 'merge typo' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_TAKEN');
  });

  it('reason missing → 400', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const r = await app.request(`/api/admin/users/${user.id}/entertainment-code`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'EM_NEW' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_REASON_REQUIRED');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_entertainment_code.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
import { Prisma } from '@prisma/client';

const EntertainmentCodeBody = z.object({
  code: z.string().min(1).max(64).nullable(),
  reason: z.string().min(1).max(500),
});

adminUsersRoutes.patch('/api/admin/users/:id/entertainment-code', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  let body: z.infer<typeof EntertainmentCodeBody>;
  try {
    const raw = await c.req.json();
    if (!raw.reason) throw new AppError('ENTERTAINMENT_CODE_REASON_REQUIRED', 'reason is required', 400);
    body = EntertainmentCodeBody.parse(raw);
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError('ENTERTAINMENT_CODE_BODY_INVALID', 'invalid body', 400);
  }

  try {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);
      const before = user.entertainmentMemberCode;
      const after = body.code;
      if (before === after) return;
      await tx.user.update({
        where: { id: userId },
        data: {
          entertainmentMemberCode: after,
          entertainmentCodeBoundAt: after === null ? null : new Date(),
        },
      });
      await audit(c, tx, {
        action: 'user.entertainment_code_change',
        targetType: 'user',
        targetId: userId,
        payload: { before, after, reason: body.reason },
      });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ENTERTAINMENT_CODE_TAKEN', 'code already bound to another user', 409);
    }
    throw e;
  }
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_entertainment_code.test.ts
```

- [ ] **Step 5: API + UI binding**

```ts
// server/admin-ui/src/api/users.ts
export function setEntertainmentCode(id: string, body: { code: string | null; reason: string }) {
  return api<{ ok: true }>(`/api/admin/users/${id}/entertainment-code`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

In `MemberDetail.tsx`, replace the read-only `<dd>` for 娛樂城會員編號 with an inline editor + ConfirmModal that captures `reason`:

```tsx
const [codeModal, setCodeModal] = useState<null | { next: string | null }>(null);
const codeMut = useMutation({
  mutationFn: (body: { code: string | null; reason: string }) => setEntertainmentCode(id!, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['admin', 'users', id] });
    setCodeModal(null);
  },
});

// In the dl:
<dt>娛樂城會員編號</dt>
<dd>
  {data.entertainmentMemberCode ?? '—'}
  <button style={{ marginLeft: 8 }} onClick={() => {
    const v = window.prompt('新編號（清空＝解除綁定）', data.entertainmentMemberCode ?? '');
    if (v === null) return;
    setCodeModal({ next: v.trim() === '' ? null : v.trim() });
  }}>變更</button>
</dd>

<ConfirmModal
  open={codeModal !== null}
  onClose={() => setCodeModal(null)}
  title="變更娛樂城會員編號"
  description={`即將改為：${codeModal?.next ?? '（解除綁定）'}`}
  requireReason
  busy={codeMut.isPending}
  onConfirm={(reason) => codeMut.mutate({ code: codeModal!.next, reason: reason! })}
/>
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_entertainment_code.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/routes/MemberDetail.tsx
git commit -m "feat(admin): rebind / clear entertainmentMemberCode with reason + uniqueness mapping"
```

---

## Task 14: GET /api/admin/users/:id/draw-history — paginated DrawLog + Redemption rollup

Returns DrawLog rows joined with their parent Redemption (single + multi). Cursor-paginated by `drawnAt desc`. UI renders as a sub-tab on MemberDetail showing one row per **Redemption** with sub-rows expanded for multi-draws.

**Files:**
- Modify: `server/src/admin/routes/users.ts`
- Test: `server/tests/integration/admin/users_draw_history.test.ts`
- Modify: `server/admin-ui/src/api/users.ts`
- Create: `server/admin-ui/src/components/StatusBadge.tsx`
- Modify: `server/admin-ui/src/routes/MemberDetail.tsx` (tab switcher)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/users_draw_history.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize, createRedemption, createDrawLog } from '../../helpers/factories.js';

describe('GET /api/admin/users/:id/draw-history', () => {
  beforeEach(resetDb);

  it('returns redemptions with sub-draws ordered by drawnAt desc', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const prize = await createPrize({ name: 'P1' });
    const single = await createRedemption({ userId: user.id, kind: 'single', status: 'pending' });
    await createDrawLog({ userId: user.id, redemptionId: single.id, prizeId: prize.id, subIndex: 0, drawnAt: new Date('2026-06-01') });
    const multi = await createRedemption({ userId: user.id, kind: 'multi', status: 'pending' });
    await createDrawLog({ userId: user.id, redemptionId: multi.id, prizeId: prize.id, subIndex: 0, drawnAt: new Date('2026-06-02') });
    await createDrawLog({ userId: user.id, redemptionId: multi.id, prizeId: prize.id, subIndex: 1, drawnAt: new Date('2026-06-02') });

    const r = await app.request(`/api/admin/users/${user.id}/draw-history`, { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.items[0].redemption.kind).toBe('multi');
    expect(body.items[0].draws).toHaveLength(2);
    expect(body.items[1].redemption.kind).toBe('single');
    expect(body.items[1].draws).toHaveLength(1);
  });

  it('empty list returns []', async () => {
    const admin = await createAdmin();
    const user = await createUser();
    const r = await app.request(`/api/admin/users/${user.id}/draw-history`, { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/users_draw_history.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
adminUsersRoutes.get('/api/admin/users/:id/draw-history', requireAdmin, async (c) => {
  const userId = c.req.param('id');
  const take = Math.min(Number(new URL(c.req.url).searchParams.get('take') ?? 25), 50);
  const cursor = new URL(c.req.url).searchParams.get('cursor');

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError('USER_NOT_FOUND', 'no such user', 404);

  const redemptions = await prisma.redemption.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      drawLogs: { orderBy: { subIndex: 'asc' }, include: { prize: { select: { id: true, name: true, isJackpot: true } } } },
    },
  });
  let nextCursor: string | null = null;
  if (redemptions.length > take) {
    nextCursor = redemptions.pop()!.id;
  }
  return c.json({
    items: redemptions.map((r) => ({
      redemption: {
        id: r.id, code: r.code, kind: r.kind, status: r.status,
        createdAt: r.createdAt, claimedAt: r.claimedAt, expiredAt: r.expiredAt,
      },
      draws: r.drawLogs.map((d) => ({
        id: d.id, subIndex: d.subIndex, prize: d.prize,
        pointsSpent: d.pointsSpent, drawnAt: d.drawnAt, source: d.source,
      })),
    })),
    nextCursor,
  });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/users_draw_history.test.ts
```

- [ ] **Step 5: StatusBadge component**

```tsx
// server/admin-ui/src/components/StatusBadge.tsx
const COLORS: Record<string, string> = {
  pending: '#fef9c3', claimed: '#dcfce7', expired: '#e5e7eb',
  revoked: '#fee2e2', voided: '#e0e7ff',
};
export function StatusBadge({ status }: { status: string }) {
  return <span style={{ background: COLORS[status] ?? '#eee', padding: '2px 8px', borderRadius: 12, fontSize: 12 }}>{status}</span>;
}
```

- [ ] **Step 6: API + UI tab in MemberDetail**

```ts
// server/admin-ui/src/api/users.ts
export interface DrawHistoryItem {
  redemption: { id: string; code: string; kind: 'single' | 'multi'; status: string; createdAt: string; claimedAt: string | null; expiredAt: string | null };
  draws: { id: string; subIndex: number; prize: { id: string; name: string; isJackpot: boolean }; pointsSpent: number; drawnAt: string; source: string }[];
}
export function fetchDrawHistory(id: string): Promise<{ items: DrawHistoryItem[]; nextCursor: string | null }> {
  return api(`/api/admin/users/${id}/draw-history`);
}
```

In `MemberDetail.tsx`, add a tab toggle (`'overview' | 'history'`) and a history list:

```tsx
const [memberTab, setMemberTab] = useState<'overview' | 'history'>('overview');
const history = useQuery({
  queryKey: ['admin', 'users', id, 'history'],
  queryFn: () => fetchDrawHistory(id!),
  enabled: memberTab === 'history',
});

<nav style={{ marginBottom: 12 }}>
  <button disabled={memberTab === 'overview'} onClick={() => setMemberTab('overview')}>會員資訊</button>
  <button disabled={memberTab === 'history'} onClick={() => setMemberTab('history')}>抽獎歷史</button>
</nav>
{memberTab === 'history' && history.data && (
  <Table
    rows={history.data.items}
    rowKey={(row) => row.redemption.id}
    columns={[
      { header: 'Code', cell: (r) => <Link to={`/admin/redemptions/${r.redemption.id}`}>{r.redemption.code}</Link> },
      { header: '類型', cell: (r) => r.redemption.kind === 'multi' ? '10 連抽' : '單抽' },
      { header: '狀態', cell: (r) => <StatusBadge status={r.redemption.status} /> },
      { header: '中獎', cell: (r) => r.draws.map((d) => d.prize.name).join('、') },
      { header: '建立時間', cell: (r) => new Date(r.redemption.createdAt).toLocaleString() },
    ]}
  />
)}
```

- [ ] **Step 7: Commit**

```bash
git add server/src/admin/routes/users.ts server/tests/integration/admin/users_draw_history.test.ts server/admin-ui/src/api/users.ts server/admin-ui/src/components/StatusBadge.tsx server/admin-ui/src/routes/MemberDetail.tsx
git commit -m "feat(admin): GET draw-history rollup + Redemption sub-rows tab"
```

---

## Task 15: GET /api/admin/redemptions — list + filter UI

Paginated Redemption list with filters: `status` (pending/claimed/expired/revoked/voided/all), `kind` (single/multi/all), `code` (exact match — also accepts the displayed `LW-` prefix format), and `userId`. Cursor-paginated by `createdAt desc`.

**Files:**
- Create: `server/src/admin/routes/redemptions.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/redemptions_list.test.ts`
- Create: `server/admin-ui/src/api/redemptions.ts`
- Create: `server/admin-ui/src/components/CodeChip.tsx`
- Create: `server/admin-ui/src/routes/Redemptions.tsx`
- Modify: `server/admin-ui/src/App.tsx` (route)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/redemptions_list.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createRedemption } from '../../helpers/factories.js';

describe('GET /api/admin/redemptions', () => {
  beforeEach(resetDb);

  it('filters by status=pending', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createRedemption({ userId: u.id, status: 'pending', code: 'AAAA1111' });
    await createRedemption({ userId: u.id, status: 'claimed', code: 'BBBB2222', claimedAt: new Date() });
    const r = await app.request('/api/admin/redemptions?status=pending', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].code).toBe('AAAA1111');
  });

  it('exact code match accepts LW- prefix and bare code', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await createRedemption({ userId: u.id, code: 'XYZA9999' });
    const headers = await adminHeaders(admin.id, admin.email);
    expect((await (await app.request('/api/admin/redemptions?code=XYZA9999', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/redemptions?code=LW-XYZA9999', { headers })).json()).items).toHaveLength(1);
    expect((await (await app.request('/api/admin/redemptions?code=NOPE', { headers })).json()).items).toHaveLength(0);
  });

  it('filters by userId', async () => {
    const admin = await createAdmin();
    const u1 = await createUser();
    const u2 = await createUser();
    await createRedemption({ userId: u1.id });
    await createRedemption({ userId: u2.id });
    const r = await app.request(`/api/admin/redemptions?userId=${u1.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('cursor pagination', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    for (let i = 0; i < 5; i++) await createRedemption({ userId: u.id });
    const r = await app.request('/api/admin/redemptions?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body = await r.json();
    expect(body.items).toHaveLength(2);
    expect(body.nextCursor).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_list.test.ts
```

- [ ] **Step 3: Implement `server/src/admin/routes/redemptions.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';

export const adminRedemptionsRoutes = new Hono();

const ListQuery = z.object({
  status: z.enum(['pending', 'claimed', 'expired', 'revoked', 'voided', 'all']).default('all'),
  kind: z.enum(['single', 'multi', 'all']).default('all'),
  code: z.string().optional(),
  userId: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(25),
  cursor: z.string().optional(),
});

function normalizeCode(input: string): string {
  return input.startsWith('LW-') ? input.slice(3) : input;
}

adminRedemptionsRoutes.get('/api/admin/redemptions', requireAdmin, async (c) => {
  let q: z.infer<typeof ListQuery>;
  try { q = ListQuery.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query', 400); }

  const where: Record<string, unknown> = {};
  if (q.status !== 'all') where.status = q.status;
  if (q.kind !== 'all') where.kind = q.kind;
  if (q.userId) where.userId = q.userId;
  if (q.code) where.code = normalizeCode(q.code);

  const items = await prisma.redemption.findMany({
    where,
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: { createdAt: 'desc' },
    include: { user: { select: { id: true, nickname: true, displayName: true } } },
  });
  let nextCursor: string | null = null;
  if (items.length > q.take) nextCursor = items.pop()!.id;
  return c.json({
    items: items.map((r) => ({
      id: r.id, code: r.code, kind: r.kind, status: r.status,
      createdAt: r.createdAt, claimedAt: r.claimedAt, expiredAt: r.expiredAt,
      user: r.user,
    })),
    nextCursor,
  });
});
```

- [ ] **Step 4: Mount in `server/src/index.ts`**

```ts
import { adminRedemptionsRoutes } from './admin/routes/redemptions.js';
app.route('/', adminRedemptionsRoutes);
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_list.test.ts
```

- [ ] **Step 6: API binding + CodeChip + UI**

```ts
// server/admin-ui/src/api/redemptions.ts
import { api } from './client.js';

export interface RedemptionRow {
  id: string;
  code: string;
  kind: 'single' | 'multi';
  status: 'pending' | 'claimed' | 'expired' | 'revoked' | 'voided';
  createdAt: string;
  claimedAt: string | null;
  expiredAt: string | null;
  user: { id: string; nickname: string | null; displayName: string };
}

export interface RedemptionsListQuery {
  status?: string;
  kind?: string;
  code?: string;
  userId?: string;
  take?: number;
  cursor?: string;
}

export function fetchRedemptions(q: RedemptionsListQuery): Promise<{ items: RedemptionRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
  return api(`/api/admin/redemptions?${params.toString()}`);
}
```

```tsx
// server/admin-ui/src/components/CodeChip.tsx
export function CodeChip({ code }: { code: string }) {
  return <code style={{ background: '#f3f4f6', padding: '2px 8px', borderRadius: 4, fontFamily: 'monospace' }}>LW-{code}</code>;
}
```

```tsx
// server/admin-ui/src/routes/Redemptions.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { fetchRedemptions, type RedemptionRow } from '../api/redemptions.js';
import { Table } from '../components/Table.js';
import { CodeChip } from '../components/CodeChip.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function Redemptions() {
  const [status, setStatus] = useState<'pending' | 'claimed' | 'expired' | 'all'>('pending');
  const [code, setCode] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'redemptions', status, code],
    queryFn: () => fetchRedemptions({ status, code: code || undefined }),
  });

  return (
    <section>
      <h1>抽獎序號（Redemption）</h1>
      <div style={{ marginBottom: 16 }}>
        {(['pending', 'claimed', 'expired', 'all'] as const).map((s) => (
          <button key={s} disabled={status === s} onClick={() => setStatus(s)}>{s}</button>
        ))}
        <input
          placeholder="輸入 code（可帶 LW- 前綴）"
          value={code}
          onChange={(e) => setCode(e.target.value.trim().toUpperCase())}
          style={{ marginLeft: 16, minWidth: 200 }}
        />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <Table<RedemptionRow>
          rows={data.items}
          rowKey={(r) => r.id}
          columns={[
            { header: 'Code', cell: (r) => <Link to={`/admin/redemptions/${r.id}`}><CodeChip code={r.code} /></Link> },
            { header: '會員', cell: (r) => <Link to={`/admin/users/${r.user.id}`}>{r.user.nickname ?? r.user.displayName}</Link> },
            { header: '類型', cell: (r) => r.kind === 'multi' ? '10 連抽' : '單抽' },
            { header: '狀態', cell: (r) => <StatusBadge status={r.status} /> },
            { header: '建立時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
          ]}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 7: Add route in `App.tsx`**

```tsx
import { Redemptions } from './routes/Redemptions.js';
// ...
<Route path="redemptions" element={<Redemptions />} />
```

- [ ] **Step 8: Commit**

```bash
git add server/src/admin/routes/redemptions.ts server/src/index.ts server/tests/integration/admin/redemptions_list.test.ts server/admin-ui/src/api/redemptions.ts server/admin-ui/src/components/CodeChip.tsx server/admin-ui/src/routes/Redemptions.tsx server/admin-ui/src/App.tsx
git commit -m "feat(admin): GET /api/admin/redemptions list + filter UI"
```

---

## Task 16: GET /api/admin/redemptions/:id — detail + draw breakdown

**Files:**
- Modify: `server/src/admin/routes/redemptions.ts`
- Test: `server/tests/integration/admin/redemptions_detail.test.ts`
- Modify: `server/admin-ui/src/api/redemptions.ts`
- Create: `server/admin-ui/src/routes/RedemptionDetail.tsx`
- Modify: `server/admin-ui/src/App.tsx`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/redemptions_detail.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createPrize, createRedemption, createDrawLog } from '../../helpers/factories.js';

describe('GET /api/admin/redemptions/:id', () => {
  beforeEach(resetDb);

  it('returns the full record + draws + user', async () => {
    const admin = await createAdmin();
    const u = await createUser({ nickname: 'Alice' });
    const p = await createPrize({ name: 'P1' });
    const red = await createRedemption({ userId: u.id, kind: 'multi', status: 'pending' });
    await createDrawLog({ userId: u.id, redemptionId: red.id, prizeId: p.id, subIndex: 0 });
    await createDrawLog({ userId: u.id, redemptionId: red.id, prizeId: p.id, subIndex: 1 });
    const r = await app.request(`/api/admin/redemptions/${red.id}`, { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.id).toBe(red.id);
    expect(body.draws).toHaveLength(2);
    expect(body.user.nickname).toBe('Alice');
  });

  it('404 when missing', async () => {
    const admin = await createAdmin();
    const r = await app.request('/api/admin/redemptions/nope', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('REDEMPTION_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_detail.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
adminRedemptionsRoutes.get('/api/admin/redemptions/:id', requireAdmin, async (c) => {
  const id = c.req.param('id');
  const red = await prisma.redemption.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, nickname: true, displayName: true, lineUserId: true, entertainmentMemberCode: true } },
      drawLogs: { orderBy: { subIndex: 'asc' }, include: { prize: { select: { id: true, name: true, isJackpot: true } } } },
      claimedByAdminUser: { select: { id: true, email: true } },
      voidedByAdminUser: { select: { id: true, email: true } },
    },
  });
  if (!red) throw new AppError('REDEMPTION_NOT_FOUND', 'no such redemption', 404);
  return c.json({
    id: red.id, code: red.code, kind: red.kind, status: red.status,
    createdAt: red.createdAt, claimedAt: red.claimedAt, expiredAt: red.expiredAt,
    revokedAt: red.revokedAt, voidedAt: red.voidedAt,
    user: red.user,
    claimedByAdminUser: red.claimedByAdminUser,
    voidedByAdminUser: red.voidedByAdminUser,
    voidReason: red.voidReason,
    draws: red.drawLogs.map((d) => ({
      id: d.id, subIndex: d.subIndex, prize: d.prize,
      pointsSpent: d.pointsSpent, drawnAt: d.drawnAt, source: d.source,
    })),
  });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_detail.test.ts
```

- [ ] **Step 5: API + UI**

```ts
// server/admin-ui/src/api/redemptions.ts
export interface RedemptionDetail {
  id: string;
  code: string;
  kind: 'single' | 'multi';
  status: RedemptionRow['status'];
  createdAt: string;
  claimedAt: string | null;
  expiredAt: string | null;
  revokedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  user: { id: string; nickname: string | null; displayName: string; lineUserId: string; entertainmentMemberCode: string | null };
  claimedByAdminUser: { id: string; email: string } | null;
  voidedByAdminUser: { id: string; email: string } | null;
  draws: { id: string; subIndex: number; prize: { id: string; name: string; isJackpot: boolean }; pointsSpent: number; drawnAt: string; source: string }[];
}
export function fetchRedemption(id: string): Promise<RedemptionDetail> {
  return api(`/api/admin/redemptions/${id}`);
}
```

```tsx
// server/admin-ui/src/routes/RedemptionDetail.tsx
import { useParams, Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchRedemption } from '../api/redemptions.js';
import { CodeChip } from '../components/CodeChip.js';
import { StatusBadge } from '../components/StatusBadge.js';

export function RedemptionDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'redemptions', id],
    queryFn: () => fetchRedemption(id!),
    enabled: Boolean(id),
  });
  if (isLoading || !data) return <p>載入中…</p>;
  return (
    <section>
      <h1><CodeChip code={data.code} /> <StatusBadge status={data.status} /></h1>
      <dl>
        <dt>會員</dt>
        <dd><Link to={`/admin/users/${data.user.id}`}>{data.user.nickname ?? data.user.displayName}</Link></dd>
        <dt>類型</dt><dd>{data.kind === 'multi' ? '10 連抽' : '單抽'}</dd>
        <dt>建立時間</dt><dd>{new Date(data.createdAt).toLocaleString()}</dd>
        {data.claimedAt && <><dt>領取時間</dt><dd>{new Date(data.claimedAt).toLocaleString()}（{data.claimedByAdminUser?.email}）</dd></>}
        {data.voidedAt && <><dt>作廢時間</dt><dd>{new Date(data.voidedAt).toLocaleString()}（{data.voidedByAdminUser?.email}）</dd></>}
        {data.voidReason && <><dt>作廢原因</dt><dd>{data.voidReason}</dd></>}
      </dl>
      <h2>抽獎明細</h2>
      <ol>
        {data.draws.map((d) => (
          <li key={d.id}>
            #{d.subIndex + 1} → {d.prize.name}{d.prize.isJackpot ? '（頭獎）' : ''}　花費 {d.pointsSpent} 積分　{new Date(d.drawnAt).toLocaleString()}
          </li>
        ))}
      </ol>
    </section>
  );
}
```

In `App.tsx`:

```tsx
import { RedemptionDetail } from './routes/RedemptionDetail.js';
<Route path="redemptions/:id" element={<RedemptionDetail />} />
```

- [ ] **Step 6: Commit**

```bash
git add server/src/admin/routes/redemptions.ts server/tests/integration/admin/redemptions_detail.test.ts server/admin-ui/src/api/redemptions.ts server/admin-ui/src/routes/RedemptionDetail.tsx server/admin-ui/src/App.tsx
git commit -m "feat(admin): GET /api/admin/redemptions/:id + RedemptionDetail page"
```

---

## Task 17: PATCH /api/admin/redemptions/:id/status — claim / void / unclaim

The single endpoint dispatches on the `action` field. Allowed transitions:
- `claim`: `pending → claimed` — admin confirms payout completed. Records `claimedAt` + `claimedByAdminUserId`. **Double-confirm** in UI.
- `void`: any non-claimed status → `voided` — invalidate the code (e.g. fraud, duplicate). Records `voidedAt`, `voidedByAdminUserId`, `voidReason`. **Required reason + double-confirm** in UI.
- `unclaim`: `claimed → pending` — undo an accidental claim. Records `unclaimedAt` (via clearing `claimedAt`) and audit log entry. **Required reason + double-confirm** in UI.

Each transition is rejected when the source status doesn't match (`REDEMPTION_TRANSITION_INVALID`).

**Files:**
- Modify: `server/src/admin/routes/redemptions.ts`
- Test: `server/tests/integration/admin/redemptions_status.test.ts`
- Create: `server/admin-ui/src/components/DoubleConfirmModal.tsx`
- Modify: `server/admin-ui/src/api/redemptions.ts`
- Modify: `server/admin-ui/src/routes/RedemptionDetail.tsx`
- Test: `server/admin-ui/tests/unit/DoubleConfirmModal.test.tsx`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/redemptions_status.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser, createRedemption } from '../../helpers/factories.js';

describe('PATCH /api/admin/redemptions/:id/status', () => {
  beforeEach(resetDb);

  it('claim: pending → claimed, sets claimedByAdminUserId, audit log', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'pending' });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.redemption.findUnique({ where: { id: red.id } });
    expect(refreshed!.status).toBe('claimed');
    expect(refreshed!.claimedByAdminUserId).toBe(admin.id);
    expect(refreshed!.claimedAt).toBeTruthy();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'redemption.claim' } });
    expect(log.targetId).toBe(red.id);
  });

  it('claim rejected when status != pending → 422 REDEMPTION_TRANSITION_INVALID', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'claimed', claimedAt: new Date() });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'claim' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('REDEMPTION_TRANSITION_INVALID');
  });

  it('void requires reason', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'pending' });
    const r = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'void' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('REDEMPTION_VOID_REASON_REQUIRED');
  });

  it('void marks the redemption + reason, refuses when already claimed', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const pending = await createRedemption({ userId: u.id, status: 'pending' });
    const claimed = await createRedemption({ userId: u.id, status: 'claimed', claimedAt: new Date() });
    const headers = { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' };
    const ok = await app.request(`/api/admin/redemptions/${pending.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'void', reason: 'duplicate' }),
    });
    expect(ok.status).toBe(200);
    const after = await prisma.redemption.findUnique({ where: { id: pending.id } });
    expect(after!.status).toBe('voided');
    expect(after!.voidReason).toBe('duplicate');
    expect(after!.voidedByAdminUserId).toBe(admin.id);
    const bad = await app.request(`/api/admin/redemptions/${claimed.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'void', reason: 'try' }),
    });
    expect(bad.status).toBe(422);
    expect((await bad.json()).error.code).toBe('REDEMPTION_TRANSITION_INVALID');
  });

  it('unclaim: claimed → pending, requires reason, clears claimedAt + claimedByAdminUserId', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    const red = await createRedemption({ userId: u.id, status: 'claimed', claimedAt: new Date(), claimedByAdminUserId: admin.id });
    const headers = { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' };
    const bad = await app.request(`/api/admin/redemptions/${red.id}/status`, { method: 'PATCH', headers, body: JSON.stringify({ action: 'unclaim' }) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('REDEMPTION_UNCLAIM_REASON_REQUIRED');

    const ok = await app.request(`/api/admin/redemptions/${red.id}/status`, {
      method: 'PATCH', headers, body: JSON.stringify({ action: 'unclaim', reason: 'misclick' }),
    });
    expect(ok.status).toBe(200);
    const refreshed = await prisma.redemption.findUnique({ where: { id: red.id } });
    expect(refreshed!.status).toBe('pending');
    expect(refreshed!.claimedAt).toBeNull();
    expect(refreshed!.claimedByAdminUserId).toBeNull();
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'redemption.unclaim' } });
    expect(log.payload).toMatchObject({ reason: 'misclick' });
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_status.test.ts
```

- [ ] **Step 3: Implement handler**

```ts
import { audit } from '../audit/helper.js';

const StatusActionBody = z.object({
  action: z.enum(['claim', 'void', 'unclaim']),
  reason: z.string().min(1).max(500).optional(),
});

adminRedemptionsRoutes.patch('/api/admin/redemptions/:id/status', requireAdmin, async (c) => {
  const id = c.req.param('id');
  let body: z.infer<typeof StatusActionBody>;
  try { body = StatusActionBody.parse(await c.req.json()); }
  catch { throw new AppError('REDEMPTION_STATUS_BODY_INVALID', 'invalid body', 400); }

  if (body.action === 'void' && !body.reason) {
    throw new AppError('REDEMPTION_VOID_REASON_REQUIRED', 'reason required to void', 400);
  }
  if (body.action === 'unclaim' && !body.reason) {
    throw new AppError('REDEMPTION_UNCLAIM_REASON_REQUIRED', 'reason required to unclaim', 400);
  }

  const adminId = c.get('adminUserId') as string;

  await prisma.$transaction(async (tx) => {
    const red = await tx.redemption.findUnique({ where: { id } });
    if (!red) throw new AppError('REDEMPTION_NOT_FOUND', 'no such redemption', 404);

    if (body.action === 'claim') {
      if (red.status !== 'pending') throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot claim from ${red.status}`, 422);
      await tx.redemption.update({
        where: { id },
        data: { status: 'claimed', claimedAt: new Date(), claimedByAdminUserId: adminId },
      });
      await audit(c, tx, {
        action: 'redemption.claim', targetType: 'redemption', targetId: id,
        payload: { code: red.code, kind: red.kind },
      });
    } else if (body.action === 'void') {
      if (red.status === 'claimed' || red.status === 'voided') {
        throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot void from ${red.status}`, 422);
      }
      await tx.redemption.update({
        where: { id },
        data: { status: 'voided', voidedAt: new Date(), voidedByAdminUserId: adminId, voidReason: body.reason },
      });
      await audit(c, tx, {
        action: 'redemption.void', targetType: 'redemption', targetId: id,
        payload: { before: red.status, reason: body.reason },
      });
    } else if (body.action === 'unclaim') {
      if (red.status !== 'claimed') throw new AppError('REDEMPTION_TRANSITION_INVALID', `cannot unclaim from ${red.status}`, 422);
      await tx.redemption.update({
        where: { id },
        data: { status: 'pending', claimedAt: null, claimedByAdminUserId: null },
      });
      await audit(c, tx, {
        action: 'redemption.unclaim', targetType: 'redemption', targetId: id,
        payload: { previousClaimedAt: red.claimedAt, previousClaimedByAdminUserId: red.claimedByAdminUserId, reason: body.reason },
      });
    }
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_status.test.ts
```

- [ ] **Step 5: DoubleConfirmModal component**

```tsx
// server/admin-ui/src/components/DoubleConfirmModal.tsx
import { useState } from 'react';
import { Modal } from './Modal.js';

export function DoubleConfirmModal({ open, onClose, title, description, requireReason, confirmLabel, expectedConfirmText, onConfirm, busy }: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  requireReason?: boolean;
  confirmLabel: string;
  expectedConfirmText: string;
  onConfirm: (reason?: string) => void | Promise<void>;
  busy?: boolean;
}) {
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const reasonOk = !requireReason || reason.trim().length > 0;
  const typedOk = typed.trim() === expectedConfirmText;
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p>{description}</p>
      {requireReason && (
        <label style={{ display: 'block', marginBottom: 8 }}>
          原因（必填）
          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} style={{ width: '100%' }} />
        </label>
      )}
      <label style={{ display: 'block', marginBottom: 12 }}>
        請輸入「{expectedConfirmText}」確認
        <input value={typed} onChange={(e) => setTyped(e.target.value)} style={{ width: '100%' }} />
      </label>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={busy}>取消</button>
        <button disabled={!reasonOk || !typedOk || busy} onClick={() => onConfirm(requireReason ? reason : undefined)}>
          {busy ? '處理中…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 6: API + UI wiring**

```ts
// server/admin-ui/src/api/redemptions.ts
export function setRedemptionStatus(id: string, body: { action: 'claim' | 'void' | 'unclaim'; reason?: string }) {
  return api<{ ok: true }>(`/api/admin/redemptions/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

In `RedemptionDetail.tsx`, add three buttons + a single `DoubleConfirmModal` driven by state:

```tsx
const [pending, setPending] = useState<null | { action: 'claim' | 'void' | 'unclaim' }>(null);
const qc = useQueryClient();
const statusMut = useMutation({
  mutationFn: (body: { action: 'claim' | 'void' | 'unclaim'; reason?: string }) => setRedemptionStatus(id!, body),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['admin', 'redemptions', id] });
    setPending(null);
  },
});

// buttons (visibility per current status):
<div style={{ marginTop: 12 }}>
  {data.status === 'pending' && (
    <>
      <button onClick={() => setPending({ action: 'claim' })}>標記為已領取</button>
      <button onClick={() => setPending({ action: 'void' })}>作廢</button>
    </>
  )}
  {data.status === 'claimed' && (
    <button onClick={() => setPending({ action: 'unclaim' })}>撤銷領取</button>
  )}
</div>

const COPY = {
  claim:   { title: '標記為已領取', desc: '請確認彩金已支付給會員。',           reason: false, label: '確認領取', confirm: 'CLAIM' },
  void:    { title: '作廢序號',     desc: '此 Redemption 將永久失效且不可復原。', reason: true,  label: '作廢',      confirm: 'VOID' },
  unclaim: { title: '撤銷領取狀態', desc: '此動作會把 Redemption 改回 pending。', reason: true,  label: '撤銷',      confirm: 'UNCLAIM' },
} as const;

<DoubleConfirmModal
  open={pending !== null}
  onClose={() => setPending(null)}
  title={pending ? COPY[pending.action].title : ''}
  description={pending ? COPY[pending.action].desc : ''}
  requireReason={pending ? COPY[pending.action].reason : false}
  confirmLabel={pending ? COPY[pending.action].label : ''}
  expectedConfirmText={pending ? COPY[pending.action].confirm : ''}
  busy={statusMut.isPending}
  onConfirm={(reason) => statusMut.mutate({ action: pending!.action, reason })}
/>
```

- [ ] **Step 7: Smoke test DoubleConfirmModal**

```tsx
// server/admin-ui/tests/unit/DoubleConfirmModal.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DoubleConfirmModal } from '../../src/components/DoubleConfirmModal.js';

describe('DoubleConfirmModal', () => {
  it('confirm disabled until typed match + reason filled', () => {
    const onConfirm = vi.fn();
    render(
      <DoubleConfirmModal
        open
        onClose={() => {}}
        title="作廢"
        description="不可復原"
        requireReason
        confirmLabel="作廢"
        expectedConfirmText="VOID"
        onConfirm={onConfirm}
      />,
    );
    const btn = screen.getByRole('button', { name: '作廢' });
    expect(btn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: '套利' } });
    expect(btn).toHaveProperty('disabled', true);
    fireEvent.change(screen.getAllByRole('textbox')[1], { target: { value: 'VOID' } });
    expect(btn).toHaveProperty('disabled', false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith('套利');
  });
});
```

- [ ] **Step 8: Run tests + commit**

```bash
cd server && npx vitest run tests/integration/admin/redemptions_status.test.ts
cd server/admin-ui && npx vitest run tests/unit/DoubleConfirmModal.test.tsx
git add server/src/admin/routes/redemptions.ts server/tests/integration/admin/redemptions_status.test.ts server/admin-ui/
git commit -m "feat(admin): claim / void / unclaim redemption with double-confirm modal"
```

---

## Task 18: PATCH /api/admin/me/password — change own password

Logged-in admin changes their own password. Verifies the **current** password, validates the new one (≥ 12 chars, distinct from current). Re-issues the session token with a fresh `iat` so the new password is required for any new session.

**Files:**
- Create: `server/src/admin/routes/me.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/me_password.test.ts`
- Create: `server/admin-ui/src/api/me.ts`
- Create: `server/admin-ui/src/routes/Profile.tsx`
- Modify: `server/admin-ui/src/App.tsx` (route)

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/me_password.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { prisma } from '../../../src/db.js';
import { createAdminWithPassword, adminHeaders } from '../../helpers/admin.ts';
import { verifyPassword } from '../../../src/admin/auth/password.js';

describe('PATCH /api/admin/me/password', () => {
  beforeEach(resetDb);

  it('rejects wrong current password → 401 CURRENT_PASSWORD_WRONG', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'wrong', newPassword: 'a-fresh-password-2' }),
    });
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('CURRENT_PASSWORD_WRONG');
  });

  it('rejects new password < 12 chars', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'short' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NEW_PASSWORD_TOO_SHORT');
  });

  it('rejects same-as-current', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'original-password-1' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('NEW_PASSWORD_SAME_AS_OLD');
  });

  it('changes password, persists new hash, writes audit log (no password in payload!)', async () => {
    const admin = await createAdminWithPassword('original-password-1');
    const r = await app.request('/api/admin/me/password', {
      method: 'PATCH',
      headers: { ...await adminHeaders(admin.id, admin.email), 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'original-password-1', newPassword: 'brand-new-password-2' }),
    });
    expect(r.status).toBe(200);
    const refreshed = await prisma.adminUser.findUniqueOrThrow({ where: { id: admin.id } });
    expect(await verifyPassword('brand-new-password-2', refreshed.passwordHash)).toBe(true);
    expect(await verifyPassword('original-password-1', refreshed.passwordHash)).toBe(false);
    const log = await prisma.adminActionLog.findFirstOrThrow({ where: { action: 'admin.password_change' } });
    expect(log.payload).not.toHaveProperty('currentPassword');
    expect(log.payload).not.toHaveProperty('newPassword');
    expect(log.payload).not.toHaveProperty('passwordHash');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/me_password.test.ts
```

- [ ] **Step 3: Implement `server/src/admin/routes/me.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { audit } from '../audit/helper.js';

export const adminMeRoutes = new Hono();

const PasswordBody = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

adminMeRoutes.patch('/api/admin/me/password', requireAdmin, async (c) => {
  let body: z.infer<typeof PasswordBody>;
  try { body = PasswordBody.parse(await c.req.json()); }
  catch { throw new AppError('PASSWORD_BODY_INVALID', 'invalid body', 400); }

  if (body.newPassword.length < 12) throw new AppError('NEW_PASSWORD_TOO_SHORT', 'min 12 chars', 400);
  if (body.newPassword === body.currentPassword) throw new AppError('NEW_PASSWORD_SAME_AS_OLD', 'new password must differ', 400);

  const adminId = c.get('adminUserId') as string;
  const me = await prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
  if (!await verifyPassword(body.currentPassword, me.passwordHash)) {
    throw new AppError('CURRENT_PASSWORD_WRONG', 'current password is wrong', 401);
  }

  const newHash = await hashPassword(body.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.adminUser.update({
      where: { id: adminId },
      data: { passwordHash: newHash, passwordChangedAt: new Date() },
    });
    await audit(c, tx, {
      action: 'admin.password_change',
      targetType: 'admin_user',
      targetId: adminId,
      payload: { passwordChangedAt: new Date().toISOString() },   // explicitly NOT including plaintext / hash
    });
  });
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Mount in `index.ts`**

```ts
import { adminMeRoutes } from './admin/routes/me.js';
app.route('/', adminMeRoutes);
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/me_password.test.ts
```

- [ ] **Step 6: API + UI**

```ts
// server/admin-ui/src/api/me.ts
import { api } from './client.js';
export function changePassword(body: { currentPassword: string; newPassword: string }) {
  return api<{ ok: true }>('/api/admin/me/password', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
```

```tsx
// server/admin-ui/src/routes/Profile.tsx
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changePassword } from '../api/me.js';

export function Profile() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const mut = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      setDone(true);
      setError(null);
      setCurrent(''); setNext(''); setConfirm('');
    },
    onError: (e: Error) => setError(e.message),
  });
  const localValid = next.length >= 12 && next === confirm && next !== current && current.length > 0;
  return (
    <section>
      <h1>個人帳號</h1>
      {done && <p style={{ color: 'green' }}>密碼已更新</p>}
      <form onSubmit={(e) => { e.preventDefault(); if (localValid) mut.mutate({ currentPassword: current, newPassword: next }); }}>
        <label style={{ display: 'block' }}>目前密碼 <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label style={{ display: 'block' }}>新密碼（至少 12 字） <input type="password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label style={{ display: 'block' }}>再次輸入 <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {next.length > 0 && next.length < 12 && <p style={{ color: 'red' }}>新密碼至少 12 字</p>}
        {next.length > 0 && confirm.length > 0 && next !== confirm && <p style={{ color: 'red' }}>兩次輸入不一致</p>}
        {error && <p style={{ color: 'red' }}>{error}</p>}
        <button type="submit" disabled={!localValid || mut.isPending}>{mut.isPending ? '更新中…' : '更新密碼'}</button>
      </form>
    </section>
  );
}
```

In `App.tsx`:

```tsx
import { Profile } from './routes/Profile.js';
<Route path="profile" element={<Profile />} />
```

- [ ] **Step 7: Commit**

```bash
git add server/src/admin/routes/me.ts server/src/index.ts server/tests/integration/admin/me_password.test.ts server/admin-ui/src/api/me.ts server/admin-ui/src/routes/Profile.tsx server/admin-ui/src/App.tsx
git commit -m "feat(admin): PATCH /api/admin/me/password + Profile page"
```

---

## Task 19: GET /api/admin/action-logs — cursor pagination + filters + viewer

Read-only list of `admin_action_logs` rows for the audit viewer. Filters: `adminUserId`, `action` (exact), `targetType`, `targetId`, `from`/`to` (ISO timestamps). Cursor pagination by `createdAt desc, id desc` to keep stable order. UI is a single page with a filter bar and a paginated table.

**Files:**
- Create: `server/src/admin/routes/action-logs.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/action_logs_list.test.ts`
- Create: `server/admin-ui/src/api/logs.ts`
- Create: `server/admin-ui/src/routes/Logs.tsx`
- Modify: `server/admin-ui/src/App.tsx`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/admin/action_logs_list.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../../src/index.js';
import { resetDb } from '../../helpers/db.js';
import { createAdmin, adminHeaders } from '../../helpers/admin.ts';
import { createUser } from '../../helpers/factories.js';
import { prisma } from '../../../src/db.js';

async function seedLog(adminId: string, action: string, targetId: string, payload: Record<string, unknown> = {}, createdAt?: Date) {
  await prisma.adminActionLog.create({
    data: { adminUserId: adminId, action, targetType: 'user', targetId, payload, ip: '127.0.0.1', userAgent: 'test', ...(createdAt ? { createdAt } : {}) },
  });
}

describe('GET /api/admin/action-logs', () => {
  beforeEach(resetDb);

  it('returns logs in createdAt desc with adminUser email joined', async () => {
    const admin = await createAdmin({ email: 'op@x.com' });
    const u = await createUser();
    await seedLog(admin.id, 'user.points_adjust', u.id, { delta: 1 });
    const r = await app.request('/api/admin/action-logs', { headers: await adminHeaders(admin.id, admin.email) });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.items[0].action).toBe('user.points_adjust');
    expect(body.items[0].adminUser.email).toBe('op@x.com');
  });

  it('filters by action exact match', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await seedLog(admin.id, 'user.points_adjust', u.id);
    await seedLog(admin.id, 'redemption.claim', u.id);
    const r = await app.request('/api/admin/action-logs?action=redemption.claim', { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('filters by from/to timestamps', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    await seedLog(admin.id, 'a', u.id, {}, new Date('2026-05-01'));
    await seedLog(admin.id, 'b', u.id, {}, new Date('2026-06-01'));
    const r = await app.request('/api/admin/action-logs?from=2026-05-15&to=2026-06-30', { headers: await adminHeaders(admin.id, admin.email) });
    expect((await r.json()).items).toHaveLength(1);
  });

  it('cursor pagination preserves order', async () => {
    const admin = await createAdmin();
    const u = await createUser();
    for (let i = 0; i < 5; i++) await seedLog(admin.id, `action.${i}`, u.id);
    const r1 = await app.request('/api/admin/action-logs?take=2', { headers: await adminHeaders(admin.id, admin.email) });
    const body1 = await r1.json();
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).toBeTruthy();
    const r2 = await app.request(`/api/admin/action-logs?take=2&cursor=${body1.nextCursor}`, { headers: await adminHeaders(admin.id, admin.email) });
    const body2 = await r2.json();
    expect(body2.items).toHaveLength(2);
    expect(body2.items[0].id).not.toBe(body1.items[1].id);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/admin/action_logs_list.test.ts
```

- [ ] **Step 3: Implement `server/src/admin/routes/action-logs.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { AppError } from '../../errors.js';
import { requireAdmin } from '../auth/middleware.js';

export const adminActionLogsRoutes = new Hono();

const Query = z.object({
  adminUserId: z.string().optional(),
  action: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});

adminActionLogsRoutes.get('/api/admin/action-logs', requireAdmin, async (c) => {
  let q: z.infer<typeof Query>;
  try { q = Query.parse(Object.fromEntries(new URL(c.req.url).searchParams)); }
  catch { throw new AppError('LIST_QUERY_INVALID', 'invalid query', 400); }

  const where: Record<string, unknown> = {};
  if (q.adminUserId) where.adminUserId = q.adminUserId;
  if (q.action) where.action = q.action;
  if (q.targetType) where.targetType = q.targetType;
  if (q.targetId) where.targetId = q.targetId;
  if (q.from || q.to) {
    const range: { gte?: Date; lte?: Date } = {};
    if (q.from) {
      const d = new Date(q.from);
      if (Number.isNaN(d.getTime())) throw new AppError('LIST_QUERY_INVALID', 'invalid from', 400);
      range.gte = d;
    }
    if (q.to) {
      const d = new Date(q.to);
      if (Number.isNaN(d.getTime())) throw new AppError('LIST_QUERY_INVALID', 'invalid to', 400);
      range.lte = d;
    }
    where.createdAt = range;
  }

  const items = await prisma.adminActionLog.findMany({
    where,
    take: q.take + 1,
    ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    include: { adminUser: { select: { id: true, email: true } } },
  });
  let nextCursor: string | null = null;
  if (items.length > q.take) nextCursor = items.pop()!.id;
  return c.json({ items, nextCursor });
});
```

- [ ] **Step 4: Mount in `index.ts`**

```ts
import { adminActionLogsRoutes } from './admin/routes/action-logs.js';
app.route('/', adminActionLogsRoutes);
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/admin/action_logs_list.test.ts
```

- [ ] **Step 6: API + UI**

```ts
// server/admin-ui/src/api/logs.ts
import { api } from './client.js';

export interface ActionLogRow {
  id: string;
  adminUserId: string;
  adminUser: { id: string; email: string };
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: Record<string, unknown>;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function fetchLogs(q: { action?: string; targetType?: string; targetId?: string; from?: string; to?: string; take?: number; cursor?: string }): Promise<{ items: ActionLogRow[]; nextCursor: string | null }> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  return api(`/api/admin/action-logs?${p.toString()}`);
}
```

```tsx
// server/admin-ui/src/routes/Logs.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLogs, type ActionLogRow } from '../api/logs.js';
import { Table } from '../components/Table.js';

export function Logs() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [targetId, setTargetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'logs', action, targetType, targetId, from, to],
    queryFn: () => fetchLogs({ action, targetType, targetId, from, to }),
  });

  return (
    <section>
      <h1>操作紀錄</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input placeholder="action（如 user.points_adjust）" value={action} onChange={(e) => setAction(e.target.value)} />
        <input placeholder="targetType" value={targetType} onChange={(e) => setTargetType(e.target.value)} />
        <input placeholder="targetId" value={targetId} onChange={(e) => setTargetId(e.target.value)} />
        <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
      </div>
      {isLoading && <p>載入中…</p>}
      {data && (
        <Table<ActionLogRow>
          rows={data.items}
          rowKey={(r) => r.id}
          columns={[
            { header: '時間', cell: (r) => new Date(r.createdAt).toLocaleString() },
            { header: 'Admin', cell: (r) => r.adminUser.email },
            { header: 'Action', cell: (r) => <code>{r.action}</code> },
            { header: 'Target', cell: (r) => r.targetType ? `${r.targetType}:${r.targetId}` : '—' },
            { header: 'Payload', cell: (r) => <details><summary>view</summary><pre>{JSON.stringify(r.payload, null, 2)}</pre></details> },
            { header: 'IP', cell: (r) => r.ip ?? '—' },
          ]}
        />
      )}
    </section>
  );
}
```

In `App.tsx`:

```tsx
import { Logs } from './routes/Logs.js';
<Route path="logs" element={<Logs />} />
```

- [ ] **Step 7: Commit**

```bash
git add server/src/admin/routes/action-logs.ts server/src/index.ts server/tests/integration/admin/action_logs_list.test.ts server/admin-ui/src/api/logs.ts server/admin-ui/src/routes/Logs.tsx server/admin-ui/src/App.tsx
git commit -m "feat(admin): GET /api/admin/action-logs cursor + filter UI"
```

---

## Task 20: MemberSearch component + global search bar in AppShell

Shared search component used by AppShell. The user types in one input; the component searches `Users` + `Redemptions` in parallel and shows up to 5 of each in a dropdown. Selecting a result navigates to the corresponding detail page. Debounced 250 ms.

**Files:**
- Create: `server/admin-ui/src/components/MemberSearch.tsx`
- Modify: `server/admin-ui/src/components/AppShell.tsx` (mount the bar)
- Test: `server/admin-ui/tests/unit/MemberSearch.test.tsx`

- [ ] **Step 1: Write failing component test**

```tsx
// server/admin-ui/tests/unit/MemberSearch.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemberSearch } from '../../src/components/MemberSearch.js';

const respond = (url: string) => {
  if (url.includes('/api/admin/users')) {
    return new Response(JSON.stringify({
      items: [{ id: 'u1', nickname: 'Alice', displayName: 'A-LINE', pictureUrl: null, lineUserId: 'U_a', entertainmentMemberCode: 'EM_AA', accountType: 'verified', points: 1, lifetimeDrawCount: 0, blacklistedAt: null, createdAt: '2026-06-01' }],
      nextCursor: null,
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  return new Response(JSON.stringify({
    items: [{ id: 'r1', code: 'AAAA1111', kind: 'single', status: 'pending', createdAt: '2026-06-01', claimedAt: null, expiredAt: null, user: { id: 'u1', nickname: 'Alice', displayName: 'A' } }],
    nextCursor: null,
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(respond(url))));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('MemberSearch', () => {
  it('shows users and redemptions after debounce', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><MemberSearch /></MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Alice' } });
    vi.advanceTimersByTime(260);
    await waitFor(() => expect(screen.getByText('Alice')).toBeDefined());
    expect(screen.getByText(/AAAA1111/)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server/admin-ui && npx vitest run tests/unit/MemberSearch.test.tsx
```

- [ ] **Step 3: Implement `MemberSearch.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../api/users.js';
import { fetchRedemptions } from '../api/redemptions.js';

export function MemberSearch() {
  const [raw, setRaw] = useState('');
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const users = useQuery({
    queryKey: ['admin', 'search', 'users', q],
    queryFn: () => fetchUsers({ q, take: 5 }),
    enabled: q.length > 0,
  });
  const redemptions = useQuery({
    queryKey: ['admin', 'search', 'redemptions', q],
    queryFn: () => fetchRedemptions({ code: q, take: 5 }),
    enabled: q.length > 0,
  });

  return (
    <div style={{ position: 'relative', width: 360 }}>
      <input
        role="textbox"
        placeholder="搜尋會員 / Redemption（LW-XXXX）"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        style={{ width: '100%' }}
      />
      {q && (users.data || redemptions.data) && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid #ddd', padding: 8, margin: 0, listStyle: 'none', zIndex: 50 }}>
          {users.data?.items.length === 0 && redemptions.data?.items.length === 0 && (
            <li>無結果</li>
          )}
          {users.data?.items.map((u) => (
            <li key={`u-${u.id}`} onClick={() => { setRaw(''); navigate(`/admin/users/${u.id}`); }} style={{ cursor: 'pointer', padding: 4 }}>
              👤 {u.nickname ?? u.displayName} <small>({u.entertainmentMemberCode ?? '無編號'})</small>
            </li>
          ))}
          {redemptions.data?.items.map((r) => (
            <li key={`r-${r.id}`} onClick={() => { setRaw(''); navigate(`/admin/redemptions/${r.id}`); }} style={{ cursor: 'pointer', padding: 4 }}>
              🎟 LW-{r.code} <small>({r.status})</small>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Mount it in `AppShell.tsx`**

In the header alongside the existing nav, render `<MemberSearch />`:

```tsx
import { MemberSearch } from './MemberSearch.js';
// header JSX:
<header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
  <h1 style={{ margin: 0 }}>Lucky Wheels 管理後台</h1>
  <nav>{/* existing nav */}</nav>
  <div style={{ marginLeft: 'auto' }}><MemberSearch /></div>
</header>
```

- [ ] **Step 5: Run test (PASS) + commit**

```bash
cd server/admin-ui && npx vitest run tests/unit/MemberSearch.test.tsx
git add server/admin-ui/src/components/MemberSearch.tsx server/admin-ui/src/components/AppShell.tsx server/admin-ui/tests/unit/MemberSearch.test.tsx
git commit -m "feat(admin): global MemberSearch in AppShell (users + redemptions)"
```

---

## Task 21: Full backend + admin-ui suite smoke run

Catch any cross-task drift (mocked types out of sync with real responses, missing route mounts, audit helper signature drift) before moving to production wiring.

- [ ] **Step 1: Run all backend tests**

```bash
cd server && npx vitest run
```

Expected: every test from Tasks 1-19 passes. Failure modes to scan for:
- `requireAdmin` middleware missing from a route → 200 instead of 401 in unauthenticated cases
- `audit()` helper missing `Tx | PrismaClient` overload after Task 3 → adjust signature
- Cursor-paginated routes returning the off-by-one item in `items` instead of using it as cursor — verify `take: q.take + 1` + `pop()` shape

- [ ] **Step 2: Run all admin-ui tests**

```bash
cd server/admin-ui && npx vitest run
```

- [ ] **Step 3: Boot the server + admin-ui dev server manually for click-through**

```bash
cd server && npm run dev &
cd server/admin-ui && npm run dev
```

Open `http://127.0.0.1:5174/admin/login`. Verify:
- Login with the seeded admin (created via `npm run admin:create`)
- Members list paginates and filters by tab + search
- Click a member → MemberDetail shows; click `+6 積分` → modal opens → reason required → submit succeeds
- Toggle account-type, blacklist, entertainment-code modal flows
- Open a Redemption → claim flow with `CLAIM` typed → status becomes `claimed`
- Profile → change password → re-login confirms new password works
- Logs → filter by `action=user.points_adjust` returns the events you just generated

- [ ] **Step 4: Stop dev processes, commit any tweaks**

```bash
# fix anything caught in steps 1-3 with a focused commit per problem
git status
```

---

## Task 22: Production build wiring — serve admin-ui dist via Hono + CORS + caching

The Hono server already mounts `/admin/*` static (Task 1). Production wiring ensures: the SPA's built `dist/` is what gets served (not the Vite dev server), `index.html` is **not** cached, hashed asset files **are** cached, and CORS is locked down because the SPA is same-origin.

**Files:**
- Modify: `server/src/index.ts` (cache headers + production guard)
- Modify: `server/admin-ui/vite.config.ts` (build paths)
- Modify: `server/package.json` (add `build:admin` + ensure `start` builds first)

- [ ] **Step 1: Ensure Vite outputs to `server/admin-ui/dist/` with `/admin/` base**

```ts
// server/admin-ui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true, assetsDir: 'assets' },
  server: { host: '127.0.0.1', port: 5174 },
  preview: { host: '127.0.0.1', port: 5174 },
});
```

- [ ] **Step 2: Modify `server/src/index.ts` to set cache headers**

Replace the bare `serveStatic` mount from Task 1 with:

```ts
import { serveStatic } from '@hono/node-server/serve-static';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

app.use('/admin/assets/*', async (c, next) => {
  await next();
  c.header('cache-control', 'public, max-age=31536000, immutable');
});
app.use('/admin/*', serveStatic({ root: './admin-ui/dist' }));

// SPA fallback — every /admin/* path that doesn't resolve to a file returns index.html
app.get('/admin/*', async (c) => {
  const html = await readFile(path.join(process.cwd(), 'admin-ui/dist/index.html'), 'utf-8');
  c.header('cache-control', 'no-store');
  return c.html(html);
});
```

- [ ] **Step 3: Add npm scripts in `server/package.json`**

```json
{
  "scripts": {
    "build:admin": "cd admin-ui && npm run build",
    "build": "tsc && npm run build:admin",
    "start": "npm run build && node dist/index.js"
  }
}
```

- [ ] **Step 4: Local production smoke test**

```bash
cd server && npm run build
cd server && NODE_ENV=production node dist/index.js &
# in another shell
curl -i http://127.0.0.1:3000/admin/                  # expect HTML, cache-control: no-store
curl -i http://127.0.0.1:3000/admin/assets/<hashed>.js  # expect cache-control: immutable
curl -i http://127.0.0.1:3000/api/admin/me            # expect 401 ADMIN_SESSION_MISSING
# stop the server
```

- [ ] **Step 5: Verify same-origin (no CORS needed)**

Confirm that `server/src/index.ts` does **not** enable CORS for `/api/admin/*` — the SPA is served from the same Hono origin so CORS would only add attack surface. If a `cors()` middleware exists from earlier setup, ensure the path matcher excludes `/api/admin/*` or that origin is restricted to `env.ADMIN_PUBLIC_ORIGIN`.

- [ ] **Step 6: Commit**

```bash
git add server/admin-ui/vite.config.ts server/src/index.ts server/package.json
git commit -m "build(admin): wire production dist serving + cache headers + same-origin guarantee"
```

---

## Plan complete — execution handoff

Plan complete and saved to `docs/plans/2026-06-04-admin-foundation-a-e.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration with clean per-task context.

**2. Inline Execution** — execute tasks in this session, batched with checkpoints for review.

Which approach?

