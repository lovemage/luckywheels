# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`LINE 會員抽獎系統` — a LINE-login lucky-wheel draw system. One codebase that **builds four apps**,
deployed as **multiple Railway services**.

| App | Path | Stack | Served at |
| --- | --- | --- | --- |
| Member SPA (玩家端) | `src/` | Vite + React 19 + zustand | `/` |
| Backend API | `server/` | Hono + Prisma (PostgreSQL) + jose JWT | `/api/*` |
| Admin Console (後台) | `server/admin-ui/` | Vite + React 19 + React Router + React Query | `/admin` |
| Superadmin Console (跨站總管) | `server/src/superadmin/*` + `server/superadmin-ui/` | same backend pkg; separate Hono entry + SPA | own domain `/` |

### Production topology (NOT derivable from the repo — read this)

This repo is deployed **several times in one Railway project**:

- **Two member/admin "sites"** — each its own service + its own PostgreSQL DB + its own domain.
  **Same Prisma schema, two separate datasets.** Both share
  the **same LINE channel**, so a person has the same `lineUserId` but a *separate* `User` row per DB
  (⇒ `entertainmentMemberCode` is unique only *within* one DB, not across sites).
- **One superadmin service** (`Dockerfile.superadmin`) that connects to **both** DBs at once to
  review/manage members and show cross-site stats. It runs **no migrations**.

Each member service builds from the root `Dockerfile` (member SPA + admin-ui + server in one image);
the superadmin builds from `Dockerfile.superadmin` and serves `server/superadmin-ui/` at its root.

## Source-of-truth docs — read before non-trivial changes

- `docs/design-spec.md` — visual / UX spec (phone-first, 紫金色 lucky-wheel theme).
- `docs/fullstack-spec.md` — backend architecture, DB schema, API contracts, security rules.
- `docs/specs/` — point-in-time design docs (e.g. admin backend design).
- `docs/plans/` — dated implementation plans that were executed; useful history for *why* code looks the way it does.

When the user says "Admin", "會員", "抽獎 API", "獎品", "積分", etc., the meaning is defined in these docs — don't reinvent.

## Commands

**Member SPA (repo root):**
```bash
npm install
npm run dev        # vite on 127.0.0.1:5173, proxies /api → 127.0.0.1:3001 (see vite.config.ts)
npm run build      # tsc type-check + vite build → dist/
npm run preview    # serve built bundle on 127.0.0.1
```

**Backend (`cd server`):**
```bash
npm install
npm run db:up          # docker compose up -d  (local Postgres)
npm run db:migrate     # prisma migrate dev
npm run db:seed        # tsx prisma/seed.ts  (prizes + AppSetting defaults)
npm run admin:create   # tsx scripts/create-admin.ts  (bootstrap an AdminUser)
npm run dev            # tsx watch --env-file=.env src/index.ts  → 0.0.0.0:3001
npm run build          # tsc (server) + builds admin-ui too (build:admin)
npm test               # vitest run  (integration + unit; needs a Postgres)
npm run test:watch     # vitest
```

**Admin UI (`cd server/admin-ui`, or via `server`'s `admin-ui:*` scripts):**
```bash
npm install
npm run dev        # vite dev server for the admin SPA
npm run build      # tsc -b + vite build → dist/ (vite base is "/admin/")
npm test           # vitest (happy-dom + Testing Library)
```

**Superadmin (from `server/`):**
```bash
npm run superadmin:dev      # PORT=3002 recommended; needs SITE_A/B_DATABASE_URL + SUPERADMIN_JWT_SECRET
npm run superadmin-ui:dev   # vite dev server for the superadmin SPA (server/superadmin-ui/)
npm run superadmin:create -- --account a@b.com --password '…' [--site A] [--promote]
npm run build:superadmin    # tsc (server) + builds superadmin-ui
```

There is **no linter**. Type errors fail every build (`tsc` runs before `vite build` everywhere).
Run a single backend test with `npx vitest run tests/integration/draw.test.ts` (or `-t "<name>"`).

`vitest` overrides `DATABASE_URL` with `TEST_DATABASE_URL` when set (`server/tests/setup.ts`).
Tests **truncate tables aggressively** — never point them at a DB with real data. Use a separate
local/docker Postgres. The root `playwright` devDependency is unused (no E2E tests exist).

Dev/preview hosts are pinned to `127.0.0.1` deliberately — do not change to `0.0.0.0` or expose externally without asking. (The backend listens on `0.0.0.0:3001` because it runs in a container.)

## Architecture — the big picture

### Draw is server-authoritative (this is the core invariant)

The result of a spin comes from `POST /api/draw` and **only** from there. The frontend animates
to the prize's `wheelPosition`; it never decides the outcome. Do not build features that assume
client-side determination of results. The real prize selection lives in `server/src/draw/pick.ts`
(weighted random), orchestrated by `server/src/routes/draw.ts`. Things that route enforces, all
inside one Prisma `$transaction`:

- **Gates (in order):** blacklist → onboarding-complete (`nickname` + `entertainmentMemberCode`) →
  not `pending`. Then tier resolution (`draws` must match a configured `pointThreshold`).
- **Tiers** are `single` (1 draw) or `multi` (10 draws), derived purely from `threshold.draws`
  (`server/src/draw/tier.ts`). `multi` writes 10 `DrawLog` children under one `Redemption`.
- **Idempotency** is keyed on `Redemption` `(userId, idempotencyKey)`, **not** `DrawLog` — a multi
  draw has 10 children sharing one batch key, so the unique constraint must sit on the parent.
  Client sends an `idempotency-key` header; replays return the original response.
- **Points** are deducted with `WHERE points >= cost` inside the tx (Prisma `P2025` → 422
  `INSUFFICIENT_POINTS`). The middleware-loaded user is treated as stale; the tx is authoritative.
- **Stock** is reserved via conditional `updateMany` (`stock: { gt: 0 }`); consolation prizes have
  no stock. On stock exhaustion it falls back to the lowest-cost prize.
- **Cost control** (`costControlEnabled` + `costControlInterval`) forces a low/no-payout prize on
  draws that aren't on the interval boundary — measured against a `FOR UPDATE`-locked global counter
  in `AppSetting` so concurrent draws serialize (prevents payout-cap races).
- **`test` accounts** take a separate path (`handleTestDraw`): may skip cost (`testSkipCost`), may
  force a prize (`testForcePrizeId`), and **never** decrement stock or touch system/lifetime totals.

### Runtime settings live in the DB, not constants

`AppSetting` is a key/value table; `server/src/draw/settings.ts` reads it (`readDrawSettings`) and
`prisma/seed.ts` (`SETTINGS_KEYS`) defines the keys: `pointThresholds`, `spinDurationMs`,
`minDrawsBeforeWin`, `cooldownDrawsAfterWin`, `payoutCap*`, `costControl*`, `consolationPrizeId`,
plus running totals (`totalDrawCount`, `totalPayoutAmount`, `totalPointsBurned`). Admins edit these
via `/api/admin/settings`. The member SPA reads a public subset via `GET /api/public/*`.

### Auth: two separate JWT realms, both cookie-based

- **Members** log in through **LINE OAuth** (`server/src/auth/line.ts`, `routes/auth.ts`). State is
  signed with `STATE_SECRET`; the session JWT (`JWT_SECRET`, via `jose`) is set as an HTTP-only
  cookie. `requireUser` middleware loads the `User`.
- **Admins** are a completely separate realm: `AdminUser` rows (bcrypt password), `ADMIN_JWT_SECRET`,
  `server/src/admin/auth/*`, with its own rate-limiting and audit logging. The three secrets
  (`JWT_SECRET`, `STATE_SECRET`, `ADMIN_JWT_SECRET`) **must be distinct** — `env.ts` rejects boot otherwise.

Mutating admin actions write `AdminActionLog` rows (`server/src/audit/log.ts`); some system events
(e.g. `draw_blocked_blacklist`) log with a null `adminUserId`.

A **third** realm exists for the superadmin: its own secret `SUPERADMIN_JWT_SECRET`, cookie
`lw_superadmin_session`, and `requireSuperadmin` (`server/src/superadmin/auth/*`) which checks the
loaded `AdminUser.role === 'superadmin'` in the **control DB** (`SUPERADMIN_CONTROL_SITE`, default `A`).

### Database connections — one client per DB, swapped by datasource URL

`server/src/db.ts` exports a **single module-level `PrismaClient`** bound to `DATABASE_URL` at import;
every member/admin route uses this global `prisma`. Tests swap the DB by overwriting
`process.env.DATABASE_URL` with `TEST_DATABASE_URL` **before** `db.ts` is imported (`tests/setup.ts`).

The **superadmin** is the only place holding **two live connections**:
`server/src/superadmin/clients.ts` builds one client per site with
`new PrismaClient({ datasources: { db: { url } } })` (`clientFor('A'|'B')`), reading
`SITE_A_DATABASE_URL` / `SITE_B_DATABASE_URL`. Both DBs share the same generated client, so this just
works. On Railway those are reference variables to the two Postgres services, so the superadmin talks
to them over **private networking** (`*.railway.internal`). `server/src/superadmin/env.ts` parses its
own env directly (it does **not** import the shared `env.ts`), so the superadmin service needs only
its own vars, not the member app's LINE/DB config.

### Images / media — upload to a bucket, read through a proxy

Prize images live in a **Railway Bucket** (S3-compatible, `@aws-sdk/client-s3`,
`server/src/storage/bucket.ts`, `forcePathStyle`). Admins upload via `POST /api/admin/uploads`
(multipart `file`; png/jpeg/webp/gif, ≤5 MB; stored at key `prize-images/<uuid>.<ext>`);
`Prize.imageUrl` stores the bucket's **public URL** (`${ENDPOINT}/${BUCKET}/${key}`).

Clients **never hotlink the bucket** — both SPAs rewrite stored URLs through `/api/media-proxy?url=…`
via `proxiedImageUrl()`. The proxy (`server/src/routes/media-proxy.ts`) is an **allow-list / SSRF
guard**: it only fetches when the URL's host + bucket prefix matches the configured `ENDPOINT`/`BUCKET`
(else `403`), then streams the object back with long immutable cache + `nosniff`. This sidesteps
hotlinking/CORS and keeps bucket credentials server-side. Bucket env is optional locally → upload/proxy
endpoints return `BUCKET_NOT_CONFIGURED` when unset.

### Backend routing — how requests are dispatched

Routers are plain Hono routers, all mounted at `/` (full paths live inside each router) in
`server/src/index.ts` (member/admin) and `server/src/superadmin/index.ts` (superadmin). `app.onError`
runs every thrown `AppError` through `formatError` → `{ error: { code, message } }` + status. **Order
matters:** API routes first, then static SPA serving, then a catch-all `GET *` returning the SPA
`index.html` (so client-side routes deep-link). The member server additionally rewrites
`/admin/assets/*` because admin-ui is built with vite `base: "/admin/"`.

- Member routes: `routes/{auth,draw,me,onboarding,public,media-proxy}`.
- Admin routes: `admin/routes/{auth,users,redemptions,prizes,settings,action-logs,uploads,me}`.
- Superadmin routes: `superadmin/routes/{auth,users,stats}`.

Shared member-management logic lives in `server/src/admin/users/ops.ts` (client-injectable, takes an
`AuditActor`) so the admin routes and the superadmin routes call **one** implementation and can't drift.

### Member SPA (`src/`)

No longer "everything in App.tsx". `src/App.tsx` is the phone-shell shell, but there's now a real
structure around it: `src/api/*` (fetch wrappers; `api/client.ts` does `credentials: 'include'` and
routes 401s to a global handler), `src/state/session.ts` (a vanilla zustand store whose `phase` is a
state machine: `loading → anonymous → onboarding → pending → ready | blacklisted`, derived in
`derivePhase`), `src/hooks/useMe.ts`, and `src/components/*` (`Login`, `Onboarding`, `PendingApproval`,
`WinModal`, `Legal`). The phase decides which screen renders.

- **The wheel is two stacked layers.** `public/assets/wheel-frame.png` is the outer gold frame /
  bulbs / pointer and never rotates. Only the inner `.wheel` element rotates — a CSS `conic-gradient`
  face (`wheelGradient()`) plus absolutely-positioned `.prize-label` nodes computed from
  `360 / prizes.length`. Adding prizes updates gradient and label angles automatically; if you swap
  the wheel image, `--label-radius` in CSS keeps labels from clipping the frame.
- **`weight` vs `wheelPosition` are different concepts.** `weight` controls win probability (server);
  `wheelPosition` controls where on the wheel a prize appears (animation target). Don't conflate them.
- **Spin timing:** single-tier duration comes from `settings.spinDurationMs` (Admin-configurable, DB);
  multi-tier is the hard-coded `MULTI_SPIN_DURATION_MS = 6000` in `src/App.tsx`. Change deliberately.
- **Image proxy.** Prize images stored in the Railway bucket are loaded through `/api/media-proxy`
  (`proxiedImageUrl()` in App.tsx) to avoid hotlinking/CORS issues.

### Admin Console (`server/admin-ui/`)

A standalone SPA: `BrowserRouter basename="/admin"`, React Query for server state, zustand for the
session, an `AuthGuard` + `AppShell` layout, routes for Members / Redemptions / Prizes / Settings /
Logs / Profile, and `api/*` clients hitting `/api/admin/*`. Built with vite `base: "/admin/"`, which
is why the server rewrites `/admin/assets/*` when serving it.

## Deploy

**Member sites** — `Dockerfile` is a 4-stage build (member web-builder, admin-builder, server-builder,
runtime) → one image; `railway.json` deploys it with healthcheck `/api/healthz`. Container `CMD` runs
`prisma migrate deploy` **then** starts the server, so a missing migration aborts the deploy loudly.
Each member service owns and migrates its **own** DB.

**Superadmin** — `Dockerfile.superadmin` builds `server/superadmin-ui/` + the server and starts
`dist/src/superadmin/index.js`; it **never runs migrations**. Because Railway's config-as-code
(`railway.json`) overrides per-service Dockerfile settings, the superadmin service is pointed at its
own config file `railway.superadmin.json` (set via the service's `railwayConfigFile`) so it uses
`Dockerfile.superadmin` without touching the member sites. Its env: `SITE_A_DATABASE_URL` /
`SITE_B_DATABASE_URL` (reference variables to the two Postgres), `SUPERADMIN_JWT_SECRET`, optional
`SUPERADMIN_CONTROL_SITE` / `SITE_*_LABEL`. Bootstrap a login with `npm run superadmin:create`.

The Railway Bucket (S3-compatible) backs admin image uploads; its 5 env vars are auto-injected when
the bucket service is referenced. Locally they're optional — endpoints return `BUCKET_NOT_CONFIGURED`
when unset.

`railway up` deploys the **local working tree** to one named service (`--service`), so the member
sites only pick up shared-code changes (e.g. the `admin/users/ops.ts` refactor) when they themselves
redeploy — keep that in mind before merging shared changes.

## Conventions & assets

- **Member assets:** fixed visual assets in `public/assets/` referenced as `/assets/foo.png`.
  Generated / draft / experimental PNGs (`prototype-*.png`, `視覺草稿.png`, `*-key.png`, etc.) are
  gitignored — don't commit them. Sound effects live in `public/assets/sfx/`.
- **Mobile-first frame.** The phone shell targets `430×932`; the design assumes a `390–430px` viewport.
- **`報價單/` and `業主版本/`** hold a sales quote and owner-facing game-rules doc (HTML/PDF). Not part
  of the build, not referenced by app code — leave them alone unless the user asks about pricing or
  the rules document.
