# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

`LINE 會員抽獎系統` — a LINE-login lucky-wheel draw system. It is no longer a single-page
prototype: it is now **three apps in one repo**, plus a backend that is substantially built.

| App | Path | Stack | Served at |
| --- | --- | --- | --- |
| Member SPA (玩家端) | `src/` | Vite + React 19 + zustand | `/` |
| Backend API | `server/` | Hono + Prisma (PostgreSQL) + jose JWT | `/api/*` |
| Admin Console (後台) | `server/admin-ui/` | Vite + React 19 + React Router + React Query | `/admin` |

In production a **single container** (`Dockerfile`) builds all three and the Hono server serves
both SPAs as static files alongside the API (`server/src/index.ts` — `/admin/*` → admin-ui dist,
`/*` → member `web-dist`, everything else falls back to the respective SPA `index.html`).

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

`Dockerfile` is a 4-stage multi-stage build (member web-builder, admin-builder, server-builder,
runtime) → one image. `railway.json` deploys it on Railway with healthcheck `/api/healthz`.
Container `CMD` runs `prisma migrate deploy` **then** starts the server, so a missing migration aborts
the deploy loudly. The Railway Bucket (S3-compatible, `@aws-sdk/client-s3`) backs admin image
uploads; its 5 env vars are auto-injected when the bucket service is referenced. Locally they're
optional — upload endpoints return `BUCKET_NOT_CONFIGURED` when unset.

## Conventions & assets

- **Member assets:** fixed visual assets in `public/assets/` referenced as `/assets/foo.png`.
  Generated / draft / experimental PNGs (`prototype-*.png`, `視覺草稿.png`, `*-key.png`, etc.) are
  gitignored — don't commit them. Sound effects live in `public/assets/sfx/`.
- **Mobile-first frame.** The phone shell targets `430×932`; the design assumes a `390–430px` viewport.
- **`報價單/` and `業主版本/`** hold a sales quote and owner-facing game-rules doc (HTML/PDF). Not part
  of the build, not referenced by app code — leave them alone unless the user asks about pricing or
  the rules document.
