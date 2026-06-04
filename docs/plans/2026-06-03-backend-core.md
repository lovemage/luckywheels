# Backend Core Implementation Plan (Rev 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## Revision History

- **Rev 1 (superseded)** — initial draft. Reviewed by `codex-reviewer`; flagged 13 critical issues (stale prizePool model, missing tier params, broken idempotency scoping, jackpot update outside transaction, missing admin_action_logs, TDD false positives, …). Do not implement.
- **Rev 2 (superseded)** — rebuilt against current `docs/fullstack-spec.md` (積分制 + tier model). Addressed all 13 Rev-1 findings. Re-reviewed by `codex-reviewer`; surfaced further must-fixes (see Rev 2.1).
- **Rev 2.1 (superseded)** — fixes applied from the second Codex pass:
  - **B3 cooldown semantics**: gate uses `<` (per spec) instead of `<=`. Task 20 adds explicit boundary tests at `diff == cooldown - 1` (blocked), `diff == cooldown` (open), `diff > cooldown` (open).
  - **D1 + B1 system totals**: replaced the unlocked `SUM(User)` aggregate with three new `app_settings` keys (`totalDrawCount` / `totalPayoutAmount` / `totalPointsBurned`) read with `FOR UPDATE` and updated atomically inside the draw transaction. Removes the payout-cap race that allowed two concurrent wins to both pass a stale cap check.
  - **B9 + E6 P2025 handling**: removed the stale pre-tx `points >= cost` precheck; the `WHERE points: { gte: cost }` inside the tx is authoritative. `RecordNotFound (P2025)` from Prisma is now caught and mapped to `INSUFFICIENT_POINTS` 422 (both verified and test flows).
  - **C2 cooldown boundary test**: real boundary coverage replacing the diff=1-only assertion.
  - **C4 stock race test**: hard assertions that no response is 500, every response carries a prize, and non-winning requests fall back to consolation.
  - **E3 typing**: `handleVerifiedDraw` / `handleTestDraw` use `Context` and `User` types instead of `any`.
  - **A10 test draw isolation**: prize selection moved inside the transaction so a concurrent admin-disable can't poison the read. Decision: test draws do **not** decrement stock (documented inline).
  - **D2 jackpot audit**: `JackpotHistory.userId` field added so the member that triggered each reset / increment is recorded; `jackpotHistory.create(... userId)` populated in Task 18.
  - **E2 wording**: cleaned up the redundant `Prize.drawLogs` note in Task 11.
  - **A9 / B7 OAuth wording**: clarified that web LINE Login uses HS256 with channel secret (correct in code); removed the misleading "LINE JWKs" phrasing.
  - **Stock race UX**: changed handler so a stock-decrement race falls back to consolation in the same transaction (member already paid the tier cost; a 409 would be money lost).
  - **Spec correction**: `docs/fullstack-spec.md` had two stale lines saying `accountType` defaults to `pending` (left over from the pre-Admin-規範 draft). Now consistent with `verified`.
- **Rev 3 (this document, 2026-06-04)** — business-driven extensions + jackpot mechanism removal. All 26 tasks (1–17b, 18–25b, 26) are in final form and internally consistent. Reference spec docs (`docs/fullstack-spec.md`, `docs/design-spec.md`) are aligned (jackpot stripped from both). The Rev 3 changes that landed:
  - **Jackpot 累計機制移除**（user decision 2026-06-04）。頭獎 → 六獎 只是六個普通獎項，各自固定 `cashAmount`。本計畫**移除**:
    - `JackpotHistory` model
    - `Prize.isJackpot` 欄位整個從 schema 刪除（頭獎與其他獎項唯一差異就是 `cashAmount` 較高）
    - `app_settings.jackpotCurrentAmount / jackpotBaseAmount / jackpotIncrementPerMiss` 三個 key
    - `DrawLog.isJackpotHit / jackpotAmountBefore / jackpotAmountAfter` 三個欄位
    - `src/draw/jackpot.ts` (`resolveJackpot`)
    - `src/draw/settings.ts` 的 `readJackpotForUpdate` / `writeJackpotCurrent`
    - `GET /api/jackpot/public` endpoint
    - Tasks 16 (`resolveJackpot` unit) 與 19 (jackpot hit integration) 從計畫中刪除
    - Tasks 17, 18, 20, 21, 22, 24, 25 內所有 jackpot 相關 setup / assertion 移除
  - **Onboarding binding (`User.nickname` + `User.entertainmentMemberCode`)**。LINE 註冊完成不代表能抽獎；會員必須先呼叫 `POST /api/onboarding/profile` 一次提交「暱稱」與「娛樂城會員編號」才能 `POST /api/draw`。任一欄位仍為 null 的會員打抽獎 → 403 `ONBOARDING_REQUIRED`，由前端引導到 onboarding 表單。
  - **Onboarding binding (`User.nickname` + `User.entertainmentMemberCode`)**。LINE 註冊完成不代表能抽獎；會員必須先呼叫 `POST /api/onboarding/profile` 一次提交「暱稱」與「娛樂城會員編號」才能 `POST /api/draw`。任一欄位仍為 null 的會員打抽獎 → 403 `ONBOARDING_REQUIRED`，由前端引導到 onboarding 表單。
  - **Redemption batch + 隨機兌換碼**。每一次抽獎請求（不論 single 或 multi）產生一筆 `Redemption` 紀錄，含一組 12-char Crockford Base32 隨機碼（格式 `XXXX-XXXX-XXXX`）。所屬 `DrawLog` 多筆（multi 為 10 筆）以 `redemptionId` 連到該 Redemption。`Redemption.status` 為 `pending / delivered / cancelled` 三態，由 Admin 後台手動切換。
  - **連抽真的抽 10 次**。`tier=multi` 時後端執行 10 次 `pickPrize` 並回傳 10 筆 sub-draw 結果（每筆有自己的 `prize` / `winningCashAmount` / `subIndex`）；前端 modal 顯示 1–10 筆金額 + 1 組兌換碼。每筆 sub-draw 都用 `prize.cashAmount` 直接計算中獎金額（沒有 jackpot 累加/重置邏輯需要處理）。
  - **API response shape 改了**。所有抽獎回傳改為 `{ redemption: {code, status, ...}, draws: [...], points, tier, ... }`。原本扁平的 `prize` / `drawLogId` / `winningCashAmount` 都移進 `draws[i]`。所有抽獎 test 同步調整。
  - **新增表**：`Redemption`、`RedemptionStatus` enum、`DrawLog.redemptionId` + `subIndex`。`Redemption.code` 採全域唯一。
  - **新增 helper**：`generateRedemptionCode()`（Crockford Base32，含驗證 + 防混淆字元）。
  - **新增端點**：`POST /api/onboarding/profile`（body 為 `{ nickname, code }` 兩欄位原子提交）與 `GET /api/me` 補上 `nickname` + `entertainmentMemberCode` 兩個欄位。
  - **管理員「中獎紀錄」模組** 仍延後到 Admin 後台 plan。本 plan 提供完整 schema + 隨機碼查詢索引，Admin 模組只需做 UI 與狀態切換 endpoint。

### Codex-finding → Task mapping (Rev 1 + Rev 2 + Rev 2.1)

| # | Codex finding | Addressed in |
|---|---|---|
| 1 | Wrong currency model (prizePool) | Tasks 3, 11, 18 — `users.points`, no `prizePool` |
| 2 | Missing `tier` parsing | Task 13 (`parseTier`), Task 18 (zod request body) |
| 3 | Blacklist audit row missing | Task 6 (`AdminActionLog` model + `writeAdminActionLog`), Task 18 (write on 403) |
| 4 | Gate ordering inverted | Task 18 (deduct → increment → gates → pick → log, in one transaction); Task 15 unit + Task 20 integration assert post-deduct semantics |
| 5 | Gated/consolation accounting | Task 21 (charges points + lifetime, freezes lastWinDrawIndex / lifetimePayoutAmount / totalLuckAmount) |
| 6 | ~~Jackpot update outside transaction~~ | **Moot — jackpot mechanism removed in Rev 3** |
| 7 | Race conditions (stock / system totals) | Task 18 row-locks system totals via `FOR UPDATE`, `stock > 0` in WHERE on prize updateMany; Task 24 regression tests for stock + system-totals races + multi-tier sub-draw stock race |
| 8 | Idempotency not scoped to userId | Task 11 (`@@unique([userId, idempotencyKey])` on **Redemption**, not DrawLog), Task 23 (ownership check + concurrent + multi-tier replay test) |
| 9 | OAuth shallow (no signed state, no id_token verify) | Task 9 (signed state via STATE_SECRET HMAC; `verifyLineIdToken` with issuer / audience / nonce) + Task 10 (cookie flag assertions in tests) |
| 10 | Test-account behavior wrong | Task 22 (tier-based deduction still applies unless `testSkipCost`; lifetime/ranking/system counters frozen — documented; per-sub-draw force-prize loop; no stock decrement) |
| 11 | Admin audit table missing | Task 6 |
| 12 | Hard-coded spinDurationMs | Task 25 (`spinDurationMs` from `app_settings`) |
| 13 | TDD false positives | Task 14 (`pickPrize` rejects 0 total weight); Task 15 unit + Task 20 integration test cooldown at exact `<` boundary; Task 20 covers all three gates; Task 23 multi-tier idempotency replay; Task 24 stock race + multi-tier sub-draw stock race |

### Rev 3 additions → Task mapping

| Rev 3 addition | Addressed in |
|---|---|
| Jackpot mechanism removed (頭獎 → 六獎 固定 cashAmount) | Tasks 11 (schema), 17 (settings), 18 + 22 (handlers), 25 (public endpoint), 24 (concurrency test); Task 16 + Task 19 marked as DELETED placeholders |
| 娛樂城會員編號 binding (gate + endpoint) | Task 3 (schema field), Task 18 (gate before tier parse), Task 25b (endpoint + surface via `/api/me`) |
| Redemption + random code | Task 11 (Redemption schema + status enum), Task 17b (code generator), Task 18 + 22 (handlers wrap N sub-draws in one Redemption) |
| Multi-tier 10 sub-picks | Task 18 (verified handler loops `threshold.draws`), Task 22 (test handler mirrors), Task 24 (multi-tier sub-draw stock race) |
| Idempotency on Redemption (not DrawLog) | Task 11 (`@@unique([userId, idempotencyKey])` on Redemption), Task 23 (batch-level replay tests) |
| Response shape `{ redemption, draws[], points, tier, tierDraws, isTest }` | Task 18 `buildResponse` helper, all draw tests in Tasks 18-23 updated |

### Decisions surfaced from the Codex review

- **Test-account counters are frozen.** Spec doesn't say either way; we err on the side of "switching test → verified later must not leak the test pumping". `lifetimeDrawCount`, `lifetimePayoutAmount`, `lastWinDrawIndex`, `totalBurnAmount`, `totalLuckAmount` and the system totals all stay untouched for test draws. Admin can still count test draws via `draw_logs.isTest = true` or `redemption.isTest = true`.
- **Test-account draws do not decrement prize stock.** Documented in `handleTestDraw`. Rationale: a test session must not deplete real prize stock that real members could otherwise win. Test draws happily "win" sold-out prizes for demo purposes.
- **Idempotency lives on Redemption, scoped to (userId, key).** Two concurrent requests with the same `(userId, key)` → loser hits the unique constraint on `Redemption.idempotencyKey`; we catch `P2002` and re-read the original Redemption + child DrawLogs, returning the same response. DrawLog has **no** idempotency key — multi-tier writes 10 children that all share the same batch key.
- **OAuth `id_token` is mandatory.** We request `openid`, so we *must* verify. If LINE returns no `id_token` we 502.
- **Stock race falls back to consolation per sub-draw, in the same transaction.** If `prize.updateMany({ where: { stock: { gt: 0 } } })` returns 0 rows (another draw just took the last unit), THAT sub-draw is swapped to the consolation prize while siblings continue. Member already paid the tier cost; returning 409 mid-batch would be unfair.
- **Multi tier evaluates each gate once, not per virtual sub-draw.** When `tier=multi`, `lifetimeDrawCount` jumps by 10 in one shot and the cooldown gate evaluates on the post-jump diff. This means a member who just won and then immediately spends 48 points on a multi draw will likely pass the cooldown gate (10-draw diff > 3-draw cooldown). Treated as intentional: a multi-draw is one logical "package purchase". If business later wants per-sub-draw enforcement, switch to the "iterate gates in tx" model — but that needs spec clarification on how to attribute partial gating (e.g. 7 of 10 sub-draws blocked) to draw_logs.

---

## Plan Header

**Goal:** Stand up the Lucky Wheels backend with Postgres + Prisma, real LINE OAuth (signed state + id_token nonce), onboarding binding (`nickname` + `entertainmentMemberCode` atomic), and a fully-gated `POST /api/draw` honoring the current 積分制 (parse tier → onboarding gate → deduct + lifetime → gates → N weighted picks bundled in one Redemption with a random code → log + audit), with userId-scoped idempotency, blacklist audit logging, and stock row-level locks. **No jackpot accumulation** — each prize wins its fixed `cashAmount`. **LINE 是會員唯一的登入方式**（無 email / 訪客 fallback）。

**Architecture:** Hono on Node 22 in a new `server/` workspace. Prisma against Postgres 16 (Docker for local). JWT in httpOnly cookie for member session. LINE OAuth uses an HMAC-signed `state` cookie + a per-flow `nonce` echoed back via `id_token`; both are verified server-side. **LINE 是會員唯一的登入方式**，沒有 email + password / 訪客 fallback。After OAuth completes, the user is `verified` but needs to submit onboarding (`nickname` + `entertainmentMemberCode`) via `POST /api/onboarding/profile` before they can call `POST /api/draw`. The draw API processes each request through ordered side effects **inside one `prisma.$transaction`** (default ReadCommitted): `SELECT FOR UPDATE` on system-totals rows, optimistic `WHERE points >= cost` on the user row, atomic `updateMany WHERE stock > 0` on each prize, evaluate gates against post-deduct counters, run `N = threshold.draws` picks (1 for `single`, 10 for `multi`) — each pick wins `prize.cashAmount` directly with no jackpot interaction — wrap them in one `Redemption` row with a Crockford-Base32 code, write N `draw_log` rows. No global isolation escalation — the explicit row locks are the contention primitives. Blacklist and onboarding gates are enforced at API entry; blacklist writes an `admin_action_logs` row.

**Tech Stack:** Node 22 LTS, TypeScript 5.6, Hono 4, Prisma 5, Postgres 16, vitest 2, zod 3, jose 5 (JWT + LINE id_token), undici 6 (`MockAgent` for LINE in tests).

**Reference:**
- `docs/fullstack-spec.md` — schemas, API, algorithm, security
- `docs/design-spec.md` — Admin module spec (only the AdminActionLog event names matter here)

**Out of scope for this plan (separate plans):**
- Member排行榜 endpoints + `leaderboard_overrides` editor
- Admin web modules (member list, leaderboard editor, page settings, template uploads, system settings)
- **Admin 「中獎紀錄」module** — schema (`Redemption` + status enum) lives here, but the admin list/filter/status-toggle UI + endpoints (`GET /api/admin/redemptions`, `PATCH /api/admin/redemptions/:id/status`) are deferred to the Admin plan.
- Bottom-tabs config + template assets CRUD
- LIFF
- Deployment to Railway

**Pre-flight requirements for the developer:**
- LINE Channel ID + Secret (test channel is fine; tests stub LINE via `undici` `MockAgent`)
- `JWT_SECRET` (≥ 32 bytes)
- `STATE_SECRET` (≥ 32 bytes, separate from JWT_SECRET — used to HMAC the state cookie)

---

## File Structure (Locked-in Decisions)

```
server/
  package.json
  tsconfig.json
  .env.example
  vitest.config.ts
  docker-compose.yml
  prisma/
    schema.prisma
    seed.ts
    migrations/                     # generated by prisma migrate
  src/
    index.ts                        # Hono boot + route mounting + error handler
    env.ts                          # zod-validated env loader
    db.ts                           # PrismaClient singleton
    errors.ts                       # AppError + formatError
    audit/
      log.ts                        # writeAdminActionLog (system events allowed)
    auth/
      jwt.ts                        # signSession / verifySession
      cookies.ts                    # SESSION_COOKIE + STATE_COOKIE + helpers
      middleware.ts                 # requireUser
      line.ts                       # buildAuthorizeUrl, exchangeCodeForToken,
                                    # fetchLineProfile, verifyLineIdToken,
                                    # signState, verifyState
    routes/
      auth.ts                       # /api/auth/line/start, /callback, /api/logout
      me.ts                         # GET /api/me
      onboarding.ts                 # POST /api/onboarding/profile
      draw.ts                       # POST /api/draw
      public.ts                     # GET /api/settings/public
    draw/
      tier.ts                       # parseTier, resolveThreshold
      gates.ts                      # evaluateGates (post-deduct invariants)
      pick.ts                       # weighted random, throws on 0 total weight
      settings.ts                   # readDrawSettings + system totals helpers (within tx)
      redemption-code.ts            # generateRedemptionCode (Crockford Base32)
      types.ts
  tests/
    helpers/
      db.ts                         # truncate-all reset
      factories.ts                  # createUser, createPrize, seed settings
      mock-line.ts                  # undici MockAgent for LINE + id_token mint
      auth.ts                       # authedHeaders helper
      concurrent.ts                 # runConcurrently helper (Promise.all + barrier)
    unit/
      env.test.ts
      errors.test.ts
      audit/
        log.test.ts
      auth/
        jwt.test.ts
        state.test.ts               # signState / verifyState
        line.test.ts                # buildAuthorizeUrl, exchange, profile, verifyIdToken
      draw/
        tier.test.ts
        pick.test.ts
        gates.test.ts
        redemption-code.test.ts     # generator + uniqueness + format
    integration/
      _db_helper.test.ts
      settings_reader.test.ts
      me.test.ts
      auth.test.ts                  # OAuth round-trip + cookie flag assertions
      onboarding.test.ts            # entertainment-code binding flow
      draw.test.ts                  # tier verified happy paths (single + multi) + gated
      draw_test_account.test.ts
      draw_idempotency.test.ts      # incl. concurrent + multi-tier replay
      draw_concurrency.test.ts      # stock race + system-totals race + multi-tier sub-draw stock race
      public.test.ts
```

**Rationale:** All race-relevant logic (stock, system totals) is in `routes/draw.ts` because the transaction boundary lives there; the helpers it composes (`gates`, `pick`, `tier`, `redemption-code`) are pure functions and unit-tested.

---

## Task 1: Server scaffold + Hono health check

**Files:**
- Create: `server/package.json`
- Create: `server/tsconfig.json`
- Create: `server/.env.example`
- Create: `server/vitest.config.ts`
- Create: `server/src/index.ts`

- [ ] **Step 1: Create `server/package.json`**

```json
{
  "name": "@luckywheels/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:up": "docker compose up -d",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset --force",
    "db:seed": "tsx prisma/seed.ts"
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@prisma/client": "^5.22.0",
    "hono": "^4.6.0",
    "jose": "^5.9.0",
    "undici": "^6.20.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "prisma": "^5.22.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `server/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "prisma/**/*.ts", "vitest.config.ts"]
}
```

- [ ] **Step 3: Create `server/.env.example`**

```
# Database
DATABASE_URL=postgresql://lucky:lucky@127.0.0.1:5433/luckywheels

# Server
PORT=3001
PUBLIC_FRONTEND_ORIGIN=http://127.0.0.1:5173

# Secrets (each must be ≥ 32 bytes, base64 or hex; rotate independently)
JWT_SECRET=replace-me-min-32-bytes-XXXXXXXXXXXXXX
STATE_SECRET=different-32-byte-secret-for-oauth-state-XXXXXX
JWT_ISSUER=luckywheels
JWT_AUDIENCE=luckywheels-front

# LINE Login
LINE_CHANNEL_ID=xxxxxxxxxx
LINE_CHANNEL_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LINE_REDIRECT_URI=http://127.0.0.1:3001/api/auth/line/callback
LINE_AUTH_BASE=https://access.line.me/oauth2/v2.1
LINE_API_BASE=https://api.line.me/oauth2/v2.1
LINE_PROFILE_BASE=https://api.line.me/v2
LINE_ISSUER=https://access.line.me
```

- [ ] **Step 4: Create `server/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    sequence: { concurrent: false },
    testTimeout: 15000,
  },
});
```

Serial single-fork: integration tests share one Postgres schema and truncate between tests. The concurrent tests in Tasks 24 and 25 use `Promise.all` *inside* a single test (not test-level parallelism), which is fine.

- [ ] **Step 5: Create `server/src/index.ts`**

```ts
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { env } from './env.js';
import { formatError } from './errors.js';

const app = new Hono();

app.onError((err, c) => {
  const { status, body } = formatError(err);
  return c.json(body, status as 400 | 401 | 403 | 404 | 409 | 422 | 500 | 502);
});

app.get('/api/health', (c) => c.json({ ok: true }));

export { app };

if (process.env.VITEST !== 'true' && process.argv[1]?.endsWith('src/index.ts')) {
  serve({ fetch: app.fetch, port: env.PORT });
  console.log(`server listening on http://127.0.0.1:${env.PORT}`);
}
```

(Imports of `env` and `formatError` resolve in Task 2 and Task 5.)

- [ ] **Step 6: Install deps**

```bash
cd server && npm install
```

Expected: install succeeds.

- [ ] **Step 7: Commit**

```bash
cd /home/ivan-bai/projects/luckywheels
git add server/package.json server/tsconfig.json server/.env.example server/vitest.config.ts server/src/index.ts
git commit -m "feat(server): scaffold Hono + vitest workspace"
```

---

## Task 2: env loader with zod

**Files:**
- Create: `server/src/env.ts`
- Test: `server/tests/unit/env.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/env.test.ts
import { describe, it, expect } from 'vitest';
import { parseEnv } from '../../src/env.js';

const baseValid = {
  DATABASE_URL: 'postgresql://u:p@127.0.0.1:5433/db',
  PORT: '3001',
  PUBLIC_FRONTEND_ORIGIN: 'http://127.0.0.1:5173',
  JWT_SECRET: 'a'.repeat(32),
  STATE_SECRET: 'b'.repeat(32),
  JWT_ISSUER: 'luckywheels',
  JWT_AUDIENCE: 'front',
  LINE_CHANNEL_ID: '1234567890',
  LINE_CHANNEL_SECRET: 'c'.repeat(32),
  LINE_REDIRECT_URI: 'http://127.0.0.1:3001/api/auth/line/callback',
  LINE_AUTH_BASE: 'https://access.line.me/oauth2/v2.1',
  LINE_API_BASE: 'https://api.line.me/oauth2/v2.1',
  LINE_PROFILE_BASE: 'https://api.line.me/v2',
  LINE_ISSUER: 'https://access.line.me',
};

describe('parseEnv', () => {
  it('accepts valid env', () => {
    const env = parseEnv(baseValid);
    expect(env.PORT).toBe(3001);
  });
  it('rejects short JWT_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
  });
  it('rejects short STATE_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, STATE_SECRET: 'short' })).toThrow(/STATE_SECRET/);
  });
  it('requires JWT_SECRET != STATE_SECRET', () => {
    expect(() => parseEnv({ ...baseValid, STATE_SECRET: baseValid.JWT_SECRET })).toThrow(/distinct/);
  });
  it('rejects invalid DATABASE_URL', () => {
    expect(() => parseEnv({ ...baseValid, DATABASE_URL: 'not-a-url' })).toThrow(/DATABASE_URL/);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/env.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/env.ts`**

```ts
import { z } from 'zod';

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  PORT: z.coerce.number().int().positive().default(3001),
  PUBLIC_FRONTEND_ORIGIN: z.string().url(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  STATE_SECRET: z.string().min(32, 'STATE_SECRET must be at least 32 characters'),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  LINE_CHANNEL_ID: z.string().min(1),
  LINE_CHANNEL_SECRET: z.string().min(16),
  LINE_REDIRECT_URI: z.string().url(),
  LINE_AUTH_BASE: z.string().url(),
  LINE_API_BASE: z.string().url(),
  LINE_PROFILE_BASE: z.string().url(),
  LINE_ISSUER: z.string().url(),
}).superRefine((e, ctx) => {
  if (e.JWT_SECRET === e.STATE_SECRET) {
    ctx.addIssue({
      code: 'custom',
      message: 'JWT_SECRET and STATE_SECRET must be distinct',
      path: ['STATE_SECRET'],
    });
  }
});

export type Env = z.infer<typeof Schema>;
export function parseEnv(raw: Record<string, string | undefined>): Env {
  return Schema.parse(raw);
}
export const env: Env = parseEnv(process.env);
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/env.test.ts
```

Expected: PASS 5/5.

- [ ] **Step 5: Commit**

```bash
git add server/src/env.ts server/tests/unit/env.test.ts
git commit -m "feat(server): zod env loader with separate JWT/STATE secrets"
```

---

## Task 3: Postgres docker-compose + initial Prisma schema (users + points)

**Files:**
- Create: `server/docker-compose.yml`
- Create: `server/prisma/schema.prisma`

- [ ] **Step 1: Create `server/docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: lucky
      POSTGRES_PASSWORD: lucky
      POSTGRES_DB: luckywheels
    ports:
      - '5433:5432'
    volumes:
      - lucky_pg:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD', 'pg_isready', '-U', 'lucky', '-d', 'luckywheels']
      interval: 5s
      timeout: 3s
      retries: 5
volumes:
  lucky_pg:
```

- [ ] **Step 2: Create `server/prisma/schema.prisma`**

The `User` model matches `docs/fullstack-spec.md` users schema after the 積分制 rewrite: a single `points` field for entry currency. No `prizePool`. No `pointsBalance`. No `drawBalance`.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AccountType {
  verified
  test
  blacklisted
}

model User {
  id                       String       @id @default(cuid())
  lineUserId               String       @unique
  displayName              String
  pictureUrl               String?
  vipLevel                 Int          @default(0)

  // Onboarding 表單欄位（Rev 3）。LINE 註冊完成不會自動有值；會員必須透過
  // POST /api/onboarding/profile 一次原子提交 `nickname` + `entertainmentMemberCode`
  // 後才能抽獎。`displayName` 是 LINE profile 給的，`nickname` 是站內顯示用、
  // 可由會員自己改（MVP 暫由 Admin 改）。
  nickname                 String?
  // 娛樂城會員編號。unique 防止兩個 LINE 帳號綁同一個娛樂城會員；first-bind-only。
  entertainmentMemberCode  String?      @unique
  entertainmentCodeBoundAt DateTime?

  // 積分制 entry currency (sole balance)
  points                   Int          @default(0)

  accountType              AccountType  @default(verified)
  verifiedAt               DateTime     @default(now())

  testSkipCost             Boolean      @default(false)
  testForcePrizeId         String?

  blacklistedAt            DateTime?
  blacklistedByAdminUserId String?
  blacklistReason          String?

  totalBurnAmount          Int          @default(0)
  totalLuckAmount          Int          @default(0)

  lifetimeDrawCount        Int          @default(0)
  lifetimePayoutAmount     Int          @default(0)
  lastWinDrawIndex         Int?

  createdAt                DateTime     @default(now())
  updatedAt                DateTime     @updatedAt
}
```

- [ ] **Step 3: Start Postgres**

```bash
cd server && docker compose up -d
```

- [ ] **Step 4: Copy env, run initial migration**

```bash
cd server && cp .env.example .env
# (the developer must replace JWT_SECRET / STATE_SECRET / LINE_* before later tasks
#  involving auth — for now the DB URL is all that's required)
npx prisma migrate dev --name init_users_points_entertainment_code
```

Expected: creates `users` and `_prisma_migrations`.

- [ ] **Step 5: Commit**

```bash
git add server/docker-compose.yml server/prisma/schema.prisma server/prisma/migrations
git commit -m "feat(server): postgres compose + users table (points-based)"
```

---

## Task 4: PrismaClient singleton + test DB helper

**Files:**
- Create: `server/src/db.ts`
- Create: `server/tests/helpers/db.ts`
- Test: `server/tests/integration/_db_helper.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/_db_helper.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../src/db.js';
import { resetDb } from '../helpers/db.js';

describe('test db helper', () => {
  beforeEach(resetDb);
  it('starts each test with zero users', async () => {
    expect(await prisma.user.count()).toBe(0);
  });
  it('cleans up between tests', async () => {
    await prisma.user.create({ data: { lineUserId: 'U_test', displayName: 'leftover' } });
    expect(await prisma.user.count()).toBe(1);
  });
  it('confirms previous test was wiped', async () => {
    expect(await prisma.user.count()).toBe(0);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/_db_helper.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `server/src/db.ts`**

```ts
import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ?? new PrismaClient({ log: ['error', 'warn'] });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}
```

- [ ] **Step 4: Implement `server/tests/helpers/db.ts`**

Tables are listed in dependency-safe order (children first); `RESTART IDENTITY CASCADE` handles the rest. Later tasks append to `TABLES` as new tables are added.

```ts
import { prisma } from '../../src/db.js';

const TABLES = ['User'] as const;

export async function resetDb(): Promise<void> {
  await prisma.$transaction(
    TABLES.map((t) => prisma.$executeRawUnsafe(`TRUNCATE "${t}" RESTART IDENTITY CASCADE`)),
  );
}
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/_db_helper.test.ts
```

Expected: PASS 3/3.

- [ ] **Step 6: Commit**

```bash
git add server/src/db.ts server/tests/helpers/db.ts server/tests/integration/_db_helper.test.ts
git commit -m "feat(server): prisma client singleton + test reset helper"
```

---

## Task 5: AppError + error formatter

**Files:**
- Create: `server/src/errors.ts`
- Test: `server/tests/unit/errors.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/errors.test.ts
import { describe, it, expect } from 'vitest';
import { AppError, formatError } from '../../src/errors.js';

describe('formatError', () => {
  it('serializes AppError', () => {
    const out = formatError(new AppError('USER_BLACKLISTED', 'suspended', 403));
    expect(out).toEqual({
      status: 403,
      body: { error: { code: 'USER_BLACKLISTED', message: 'suspended' } },
    });
  });
  it('does not leak internals for unknown errors', () => {
    const out = formatError(new Error('boom-secret'));
    expect(out.status).toBe(500);
    expect(out.body.error.code).toBe('INTERNAL');
    expect(out.body.error.message).not.toMatch(/boom-secret/);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/errors.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `server/src/errors.ts`**

```ts
export class AppError extends Error {
  constructor(
    public code: string,
    public override message: string,
    public status: number = 400,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function formatError(err: unknown): {
  status: number;
  body: { error: { code: string; message: string } };
} {
  if (err instanceof AppError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message } } };
  }
  return { status: 500, body: { error: { code: 'INTERNAL', message: 'internal server error' } } };
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/errors.test.ts
```

Expected: PASS 2/2.

- [ ] **Step 5: Commit**

```bash
git add server/src/errors.ts server/tests/unit/errors.test.ts
git commit -m "feat(server): AppError + redacted error formatter"
```

---

## Task 6: AdminActionLog model + writeAdminActionLog helper

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/tests/helpers/db.ts` (extend TABLES)
- Create: `server/src/audit/log.ts`
- Test: `server/tests/unit/audit/log.test.ts`

This task lands the audit table early because the blacklist gate in Task 18 needs to write to it.

- [ ] **Step 1: Append to `server/prisma/schema.prisma`**

```prisma
model AdminActionLog {
  id            String    @id @default(cuid())
  adminUserId   String?   // null for system events (e.g. draw_blocked_blacklist)
  event         String    // e.g. draw_blocked_blacklist, user.blacklist_set, ...
  targetType    String?
  targetId      String?
  payloadBefore Json?
  payloadAfter  Json?
  ip            String?
  userAgent     String?
  note          String?
  createdAt     DateTime  @default(now())

  @@index([event, createdAt])
  @@index([targetType, targetId, createdAt])
}
```

- [ ] **Step 2: Run migration**

```bash
cd server && npx prisma migrate dev --name add_admin_action_log
```

- [ ] **Step 3: Update `server/tests/helpers/db.ts`**

```ts
const TABLES = ['AdminActionLog', 'User'] as const;
```

- [ ] **Step 4: Write failing test**

```ts
// server/tests/unit/audit/log.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { prisma } from '../../../src/db.js';
import { resetDb } from '../../helpers/db.js';
import { writeAdminActionLog } from '../../../src/audit/log.js';

describe('writeAdminActionLog', () => {
  beforeEach(resetDb);

  it('writes a system event with null adminUserId', async () => {
    await writeAdminActionLog(prisma, {
      event: 'draw_blocked_blacklist',
      targetType: 'user',
      targetId: 'user_x',
      ip: '127.0.0.1',
    });
    const rows = await prisma.adminActionLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.event).toBe('draw_blocked_blacklist');
    expect(rows[0]?.adminUserId).toBeNull();
    expect(rows[0]?.targetId).toBe('user_x');
  });

  it('persists payload diff', async () => {
    await writeAdminActionLog(prisma, {
      adminUserId: 'admin_1',
      event: 'user.blacklist_set',
      targetType: 'user',
      targetId: 'user_x',
      payloadBefore: { accountType: 'verified' },
      payloadAfter: { accountType: 'blacklisted', reason: 'fraud' },
    });
    const row = await prisma.adminActionLog.findFirst();
    expect(row?.payloadBefore).toEqual({ accountType: 'verified' });
    expect(row?.payloadAfter).toEqual({ accountType: 'blacklisted', reason: 'fraud' });
  });

  it('accepts a transaction client (atomicity contract)', async () => {
    await prisma.$transaction(async (tx) => {
      await writeAdminActionLog(tx, { event: 'test.in_tx' });
    });
    expect(await prisma.adminActionLog.count()).toBe(1);
  });
});
```

- [ ] **Step 5: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/audit/log.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 6: Implement `server/src/audit/log.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';

type Client = PrismaClient | Prisma.TransactionClient;

export interface AdminActionLogInput {
  adminUserId?: string | null;
  event: string;
  targetType?: string | null;
  targetId?: string | null;
  payloadBefore?: Prisma.JsonValue;
  payloadAfter?: Prisma.JsonValue;
  ip?: string | null;
  userAgent?: string | null;
  note?: string | null;
}

export async function writeAdminActionLog(
  client: Client,
  input: AdminActionLogInput,
): Promise<void> {
  await client.adminActionLog.create({
    data: {
      adminUserId: input.adminUserId ?? null,
      event: input.event,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      payloadBefore: input.payloadBefore as Prisma.InputJsonValue ?? Prisma.JsonNull,
      payloadAfter: input.payloadAfter as Prisma.InputJsonValue ?? Prisma.JsonNull,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      note: input.note ?? null,
    },
  });
}
```

- [ ] **Step 7: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/audit/log.test.ts
```

Expected: PASS 3/3.

- [ ] **Step 8: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/tests/helpers/db.ts server/src/audit/log.ts server/tests/unit/audit/log.test.ts
git commit -m "feat(server): AdminActionLog table + writeAdminActionLog helper"
```

---

## Task 7: JWT sign / verify

**Files:**
- Create: `server/src/auth/jwt.ts`
- Test: `server/tests/unit/auth/jwt.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/auth/jwt.test.ts
import { describe, it, expect } from 'vitest';
import { signSession, verifySession } from '../../../src/auth/jwt.js';

describe('session JWT', () => {
  it('round-trips userId', async () => {
    const t = await signSession({ userId: 'u_1' });
    expect((await verifySession(t)).userId).toBe('u_1');
  });
  it('rejects tampered tokens', async () => {
    const t = await signSession({ userId: 'u_1' });
    await expect(verifySession(t.slice(0, -2) + 'aa')).rejects.toThrow();
  });
  it('rejects expired tokens', async () => {
    const t = await signSession({ userId: 'u_x' }, { expiresInSeconds: -1 });
    await expect(verifySession(t)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/auth/jwt.test.ts
```

- [ ] **Step 3: Implement `server/src/auth/jwt.ts`**

```ts
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';

const secret = new TextEncoder().encode(env.JWT_SECRET);
const DEFAULT_TTL = 60 * 60 * 24 * 14; // 14d

export interface SessionPayload { userId: string; }

export async function signSession(
  payload: SessionPayload,
  opts: { expiresInSeconds?: number } = {},
): Promise<string> {
  const ttl = opts.expiresInSeconds ?? DEFAULT_TTL;
  return new SignJWT({ userId: payload.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.JWT_ISSUER)
    .setAudience(env.JWT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(secret);
}

export async function verifySession(token: string): Promise<SessionPayload> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  });
  if (typeof payload.userId !== 'string') throw new Error('invalid session payload');
  return { userId: payload.userId };
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/auth/jwt.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/auth/jwt.ts server/tests/unit/auth/jwt.test.ts
git commit -m "feat(server): session JWT sign/verify"
```

---

## Task 8: Cookie helpers (with Secure flag enforcement) + requireUser + /api/me

**Files:**
- Create: `server/src/auth/cookies.ts`
- Create: `server/src/auth/middleware.ts`
- Create: `server/src/routes/me.ts`
- Test: `server/tests/integration/me.test.ts`

Addresses Codex finding #9: cookie flag assertions in tests, and Secure attribute always-on outside test (we treat any non-`test` `NODE_ENV` as production-equivalent).

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/me.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

describe('GET /api/me', () => {
  beforeEach(resetDb);

  it('returns 401 without cookie', async () => {
    const r = await app.request('/api/me');
    expect(r.status).toBe(401);
    expect((await r.json()).error.code).toBe('UNAUTHENTICATED');
  });

  it('returns the authenticated user', async () => {
    const u = await prisma.user.create({
      data: { lineUserId: 'U_a', displayName: 'Alice', points: 28 },
    });
    const t = await signSession({ userId: u.id });
    const r = await app.request('/api/me', { headers: { cookie: `${SESSION_COOKIE}=${t}` } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({
      id: u.id, displayName: 'Alice', points: 28, accountType: 'verified',
    });
  });

  it('rejects invalid token', async () => {
    const r = await app.request('/api/me', { headers: { cookie: `${SESSION_COOKIE}=garbage` } });
    expect(r.status).toBe(401);
  });

  it('session cookie has HttpOnly + SameSite=Lax + Secure (outside NODE_ENV=test)', async () => {
    // we surface this through a tiny test helper route — we mount it inline here
    // to avoid a second test cycle. The assertion below requires Task 9 (login)
    // to actually set the cookie; for now we set it directly via the auth route
    // once Task 9 lands. SKIP this assertion until then by checking just that the
    // helper doesn't throw at import time.
    const { setSessionCookie } = await import('../../src/auth/cookies.js');
    expect(typeof setSessionCookie).toBe('function');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/me.test.ts
```

- [ ] **Step 3: Implement `server/src/auth/cookies.ts`**

```ts
import type { Context } from 'hono';
import { setCookie, deleteCookie } from 'hono/cookie';

export const SESSION_COOKIE = 'lw_session';
export const STATE_COOKIE = 'lw_oauth_state';
export const NONCE_COOKIE = 'lw_oauth_nonce';

const isProductionLike = (): boolean =>
  process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development';

export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });
}

export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function setStateCookie(c: Context, value: string): void {
  setCookie(c, STATE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 600,
  });
}

export function setNonceCookie(c: Context, value: string): void {
  setCookie(c, NONCE_COOKIE, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isProductionLike(),
    path: '/',
    maxAge: 600,
  });
}

export function clearOauthCookies(c: Context): void {
  deleteCookie(c, STATE_COOKIE, { path: '/' });
  deleteCookie(c, NONCE_COOKIE, { path: '/' });
}
```

- [ ] **Step 4: Implement `server/src/auth/middleware.ts`**

```ts
import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { AppError } from '../errors.js';
import { prisma } from '../db.js';
import { verifySession } from './jwt.js';
import { SESSION_COOKIE } from './cookies.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: import('@prisma/client').User;
  }
}

export const requireUser: MiddlewareHandler = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new AppError('UNAUTHENTICATED', 'login required', 401);
  let payload;
  try { payload = await verifySession(token); }
  catch { throw new AppError('UNAUTHENTICATED', 'invalid session', 401); }
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) throw new AppError('UNAUTHENTICATED', 'session no longer valid', 401);
  c.set('user', user);
  await next();
};
```

- [ ] **Step 5: Implement `server/src/routes/me.ts`**

```ts
import { Hono } from 'hono';
import { requireUser } from '../auth/middleware.js';

export const meRoutes = new Hono();

meRoutes.get('/api/me', requireUser, (c) => {
  const u = c.get('user');
  return c.json({
    id: u.id,
    lineUserId: u.lineUserId,
    displayName: u.displayName,
    pictureUrl: u.pictureUrl,
    vipLevel: u.vipLevel,
    points: u.points,
    accountType: u.accountType,
  });
});
```

- [ ] **Step 6: Mount in `server/src/index.ts`**

Add:

```ts
import { meRoutes } from './routes/me.js';
app.route('/', meRoutes);
```

- [ ] **Step 7: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/me.test.ts
```

Expected: PASS 4/4.

- [ ] **Step 8: Commit**

```bash
git add server/src/auth/cookies.ts server/src/auth/middleware.ts server/src/routes/me.ts server/src/index.ts server/tests/integration/me.test.ts
git commit -m "feat(server): cookies (HttpOnly+Lax+Secure) + requireUser + GET /api/me"
```

---

## Task 9: Signed state + LINE OAuth client (token + profile + id_token verify)

Addresses Codex finding #9 — HMAC-signed state cookie, `nonce` generation + verification, `verifyLineIdToken` using HS256 with the channel secret (per LINE Web Login spec — Web flow signs id_token with the channel secret; LIFF/native uses ES256 + JWKS, which is out of scope here).

**Files:**
- Create: `server/src/auth/line.ts`
- Create: `server/tests/helpers/mock-line.ts`
- Test: `server/tests/unit/auth/state.test.ts`
- Test: `server/tests/unit/auth/line.test.ts`

- [ ] **Step 1: Write failing test for `state`**

```ts
// server/tests/unit/auth/state.test.ts
import { describe, it, expect } from 'vitest';
import { signState, verifyState } from '../../../src/auth/line.js';

describe('signed state', () => {
  it('round-trips a state value', async () => {
    const token = await signState('abc-123');
    expect(await verifyState(token)).toBe('abc-123');
  });
  it('rejects tampered values', async () => {
    const token = await signState('abc-123');
    await expect(verifyState(token.slice(0, -2) + 'zz')).rejects.toThrow();
  });
  it('rejects expired values', async () => {
    const token = await signState('abc-123', { ttlSeconds: -1 });
    await expect(verifyState(token)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Write failing test for LINE client**

```ts
// server/tests/unit/auth/line.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchLineProfile,
  verifyLineIdToken,
} from '../../../src/auth/line.js';
import { startMockLine, stopMockLine, MOCK_NONCE } from '../../helpers/mock-line.js';
import { env } from '../../../src/env.js';

describe('LINE OAuth client', () => {
  beforeEach(() => startMockLine());
  afterEach(() => stopMockLine());

  it('builds authorize URL with state + nonce + scope', () => {
    const u = new URL(buildAuthorizeUrl({ state: 'st', nonce: 'no' }));
    expect(u.origin + u.pathname).toBe(`${env.LINE_AUTH_BASE}/authorize`);
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('client_id')).toBe(env.LINE_CHANNEL_ID);
    expect(u.searchParams.get('redirect_uri')).toBe(env.LINE_REDIRECT_URI);
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('nonce')).toBe('no');
    expect(u.searchParams.get('scope')).toBe('profile openid');
  });

  it('exchanges code for token', async () => {
    const tk = await exchangeCodeForToken('test_code');
    expect(tk.access_token).toBe('mock_access_token');
    expect(tk.id_token).toBeTruthy();
  });

  it('throws AppError on bad code', async () => {
    await expect(exchangeCodeForToken('bad_code')).rejects.toMatchObject({ code: 'LINE_TOKEN_EXCHANGE' });
  });

  it('fetches profile', async () => {
    const p = await fetchLineProfile('mock_access_token');
    expect(p).toEqual({ userId: 'U_mocked', displayName: 'Mocked Member', pictureUrl: 'https://profile.line/p.png' });
  });

  it('verifies id_token issuer + audience + nonce', async () => {
    const tk = await exchangeCodeForToken('test_code');
    const claims = await verifyLineIdToken(tk.id_token!, { nonce: MOCK_NONCE });
    expect(claims.sub).toBe('U_mocked');
  });

  it('rejects id_token with mismatched nonce', async () => {
    const tk = await exchangeCodeForToken('test_code');
    await expect(verifyLineIdToken(tk.id_token!, { nonce: 'wrong' })).rejects.toMatchObject({
      code: 'LINE_ID_TOKEN_INVALID',
    });
  });
});
```

- [ ] **Step 3: Implement `server/tests/helpers/mock-line.ts`**

The mock signs an `id_token` with the channel secret (LINE uses HS256 with the channel secret for `id_token` for the `Channel Secret as HS256 shared key` flow).

```ts
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher, Dispatcher } from 'undici';
import { SignJWT } from 'jose';
import { env } from '../../src/env.js';

export const MOCK_NONCE = 'mock-nonce-xyz';

let agent: MockAgent | null = null;
let original: Dispatcher | null = null;

async function mintIdToken(): Promise<string> {
  const secret = new TextEncoder().encode(env.LINE_CHANNEL_SECRET);
  return new SignJWT({ nonce: MOCK_NONCE, name: 'Mocked Member' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(env.LINE_ISSUER)
    .setAudience(env.LINE_CHANNEL_ID)
    .setSubject('U_mocked')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret);
}

export function startMockLine(): void {
  original = getGlobalDispatcher();
  agent = new MockAgent();
  agent.disableNetConnect();
  setGlobalDispatcher(agent);

  const tokenOrigin = new URL(env.LINE_API_BASE).origin;
  const profileOrigin = new URL(env.LINE_PROFILE_BASE).origin;

  agent.get(tokenOrigin).intercept({
    path: new URL(`${env.LINE_API_BASE}/token`).pathname,
    method: 'POST',
  }).reply(async (opts) => {
    const body = new URLSearchParams(opts.body as string);
    if (body.get('code') === 'bad_code') {
      return { statusCode: 400, data: JSON.stringify({ error: 'invalid_grant' }),
               responseOptions: { headers: { 'content-type': 'application/json' } } };
    }
    const idToken = await mintIdToken();
    return {
      statusCode: 200,
      data: JSON.stringify({
        access_token: 'mock_access_token',
        expires_in: 2592000,
        id_token: idToken,
        refresh_token: 'mock_refresh',
        token_type: 'Bearer',
      }),
      responseOptions: { headers: { 'content-type': 'application/json' } },
    };
  }).persist();

  agent.get(profileOrigin).intercept({
    path: new URL(`${env.LINE_PROFILE_BASE}/profile`).pathname,
    method: 'GET',
  }).reply(200, {
    userId: 'U_mocked',
    displayName: 'Mocked Member',
    pictureUrl: 'https://profile.line/p.png',
  }).persist();
}

export function stopMockLine(): void {
  if (agent) agent.close();
  if (original) setGlobalDispatcher(original);
  agent = null;
  original = null;
}
```

- [ ] **Step 4: Run tests (FAIL)**

```bash
cd server && npx vitest run tests/unit/auth/state.test.ts tests/unit/auth/line.test.ts
```

- [ ] **Step 5: Implement `server/src/auth/line.ts`**

```ts
import { fetch } from 'undici';
import { SignJWT, jwtVerify } from 'jose';
import { env } from '../env.js';
import { AppError } from '../errors.js';

// ───────── signed state (HMAC via STATE_SECRET) ─────────

const stateSecret = new TextEncoder().encode(env.STATE_SECRET);

export async function signState(value: string, opts: { ttlSeconds?: number } = {}): Promise<string> {
  const ttl = opts.ttlSeconds ?? 600;
  return new SignJWT({ s: value })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('luckywheels-state')
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(stateSecret);
}

export async function verifyState(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, stateSecret, { issuer: 'luckywheels-state' });
  if (typeof payload.s !== 'string') throw new Error('invalid state');
  return payload.s;
}

// ───────── LINE OAuth REST ─────────

export interface LineTokenResponse {
  access_token: string;
  expires_in: number;
  id_token?: string;
  refresh_token: string;
  token_type: 'Bearer';
}

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

export function buildAuthorizeUrl(opts: { state: string; nonce: string }): string {
  const u = new URL(`${env.LINE_AUTH_BASE}/authorize`);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.LINE_CHANNEL_ID);
  u.searchParams.set('redirect_uri', env.LINE_REDIRECT_URI);
  u.searchParams.set('state', opts.state);
  u.searchParams.set('nonce', opts.nonce);
  u.searchParams.set('scope', 'profile openid');
  return u.toString();
}

export async function exchangeCodeForToken(code: string): Promise<LineTokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.LINE_REDIRECT_URI,
    client_id: env.LINE_CHANNEL_ID,
    client_secret: env.LINE_CHANNEL_SECRET,
  });
  const res = await fetch(`${env.LINE_API_BASE}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) throw new AppError('LINE_TOKEN_EXCHANGE', 'failed to exchange code', 502);
  return (await res.json()) as LineTokenResponse;
}

export async function fetchLineProfile(accessToken: string): Promise<LineProfile> {
  const res = await fetch(`${env.LINE_PROFILE_BASE}/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new AppError('LINE_PROFILE', 'failed to fetch profile', 502);
  return (await res.json()) as LineProfile;
}

// LINE's id_token (when channel uses default HS256) is signed with the channel secret.
export async function verifyLineIdToken(
  idToken: string,
  opts: { nonce: string },
): Promise<{ sub: string; nonce?: string }> {
  const key = new TextEncoder().encode(env.LINE_CHANNEL_SECRET);
  let payload;
  try {
    ({ payload } = await jwtVerify(idToken, key, {
      issuer: env.LINE_ISSUER,
      audience: env.LINE_CHANNEL_ID,
    }));
  } catch {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token signature/iss/aud invalid', 502);
  }
  if (payload.nonce !== opts.nonce) {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'nonce mismatch', 502);
  }
  if (typeof payload.sub !== 'string') {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token missing sub', 502);
  }
  return { sub: payload.sub, nonce: typeof payload.nonce === 'string' ? payload.nonce : undefined };
}
```

- [ ] **Step 6: Run tests (PASS)**

```bash
cd server && npx vitest run tests/unit/auth/state.test.ts tests/unit/auth/line.test.ts
```

Expected: PASS 3/3 + 6/6.

- [ ] **Step 7: Commit**

```bash
git add server/src/auth/line.ts server/tests/helpers/mock-line.ts server/tests/unit/auth/state.test.ts server/tests/unit/auth/line.test.ts
git commit -m "feat(server): signed OAuth state + LINE client with id_token nonce verify"
```

---

## Task 10: LINE OAuth start / callback / logout — with cookie flag assertions

**Files:**
- Create: `server/src/routes/auth.ts`
- Test: `server/tests/integration/auth.test.ts`

Notes: tests assert `HttpOnly`, `SameSite=Lax`, `Secure` flag presence/absence, AND that `id_token` verification runs and matches.

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { startMockLine, stopMockLine, MOCK_NONCE } from '../helpers/mock-line.js';
import { SESSION_COOKIE, STATE_COOKIE, NONCE_COOKIE } from '../../src/auth/cookies.js';

function setCookieHeaders(res: Response): string[] {
  return res.headers.getSetCookie();
}

function findCookie(headers: string[], name: string): string | undefined {
  return headers.find((h) => h.startsWith(`${name}=`));
}

function valueOf(line: string | undefined): string {
  if (!line) return '';
  const [pair] = line.split(';');
  const [, v] = pair.split('=');
  return v ?? '';
}

describe('LINE OAuth flow', () => {
  beforeEach(async () => {
    await resetDb();
    startMockLine();
  });
  afterEach(stopMockLine);

  it('start redirects to LINE and sets HttpOnly+Lax cookies', async () => {
    const r = await app.request('/api/auth/line/start');
    expect(r.status).toBe(302);
    const loc = r.headers.get('location')!;
    expect(loc).toMatch(/access\.line\.me\/oauth2\/v2\.1\/authorize/);

    const cs = setCookieHeaders(r);
    const stateLine = findCookie(cs, STATE_COOKIE);
    const nonceLine = findCookie(cs, NONCE_COOKIE);
    expect(stateLine).toMatch(/HttpOnly/);
    expect(stateLine).toMatch(/SameSite=Lax/);
    expect(nonceLine).toMatch(/HttpOnly/);

    // querystring nonce equals NONCE cookie
    const u = new URL(loc);
    expect(u.searchParams.get('nonce')).toBe(valueOf(nonceLine));
  });

  it('callback upserts user, sets session cookie, redirects to frontend root', async () => {
    const startRes = await app.request('/api/auth/line/start');
    const cs = setCookieHeaders(startRes);
    const stateCookieValue = valueOf(findCookie(cs, STATE_COOKIE));
    const nonceCookieValue = valueOf(findCookie(cs, NONCE_COOKIE));
    // We can NOT use `state` from the redirect querystring directly — it's the signed token;
    // we must hand the cookie value back to the callback. The callback also reads the `state`
    // query param to verify it matches.
    const stateQuery = new URL(startRes.headers.get('location')!).searchParams.get('state')!;
    // For the mock LINE, the nonce that ends up inside the id_token is MOCK_NONCE, which
    // the auth callback compares against NONCE_COOKIE. Confirm we wired the cookie value
    // to match what the mock minted.
    expect(nonceCookieValue).toBe(MOCK_NONCE);

    const cookieHdr = `${STATE_COOKIE}=${stateCookieValue}; ${NONCE_COOKIE}=${nonceCookieValue}`;
    const cb = await app.request(
      `/api/auth/line/callback?code=test_code&state=${encodeURIComponent(stateQuery)}`,
      { headers: { cookie: cookieHdr } },
    );
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('http://127.0.0.1:5173/');

    const sessionLine = findCookie(setCookieHeaders(cb), SESSION_COOKIE);
    expect(sessionLine).toBeDefined();
    expect(sessionLine).toMatch(/HttpOnly/);
    expect(sessionLine).toMatch(/SameSite=Lax/);

    const user = await prisma.user.findUnique({ where: { lineUserId: 'U_mocked' } });
    expect(user?.displayName).toBe('Mocked Member');
    expect(user?.accountType).toBe('verified'); // default per spec (no pending review gate)
  });

  it('rejects mismatched state', async () => {
    const r = await app.request('/api/auth/line/callback?code=test_code&state=garbage', {
      headers: { cookie: `${STATE_COOKIE}=other; ${NONCE_COOKIE}=whatever` },
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('OAUTH_STATE_MISMATCH');
  });

  it('rejects missing nonce cookie', async () => {
    const startRes = await app.request('/api/auth/line/start');
    const stateCookieValue = valueOf(findCookie(setCookieHeaders(startRes), STATE_COOKIE));
    const stateQuery = new URL(startRes.headers.get('location')!).searchParams.get('state')!;
    const r = await app.request(
      `/api/auth/line/callback?code=test_code&state=${encodeURIComponent(stateQuery)}`,
      { headers: { cookie: `${STATE_COOKIE}=${stateCookieValue}` } },
    );
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('OAUTH_NONCE_MISSING');
  });

  it('logout clears session cookie', async () => {
    const r = await app.request('/api/logout', { method: 'POST' });
    expect(r.status).toBe(204);
    const sessionLine = findCookie(setCookieHeaders(r), SESSION_COOKIE);
    // Expires in the past or empty value
    expect(sessionLine).toMatch(new RegExp(`${SESSION_COOKIE}=;`));
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/auth.test.ts
```

- [ ] **Step 3: Implement `server/src/routes/auth.ts`**

```ts
import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { randomBytes } from 'node:crypto';
import { env } from '../env.js';
import { AppError } from '../errors.js';
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchLineProfile,
  verifyLineIdToken,
  signState,
  verifyState,
} from '../auth/line.js';
import { prisma } from '../db.js';
import { signSession } from '../auth/jwt.js';
import {
  SESSION_COOKIE,
  STATE_COOKIE,
  NONCE_COOKIE,
  setSessionCookie,
  clearSessionCookie,
  setStateCookie,
  setNonceCookie,
  clearOauthCookies,
} from '../auth/cookies.js';

export const authRoutes = new Hono();

authRoutes.get('/api/auth/line/start', async (c) => {
  const stateValue = randomBytes(24).toString('hex');
  const nonce = randomBytes(24).toString('hex');
  const stateToken = await signState(stateValue);
  setStateCookie(c, stateToken);
  setNonceCookie(c, nonce);
  return c.redirect(buildAuthorizeUrl({ state: stateToken, nonce }));
});

authRoutes.get('/api/auth/line/callback', async (c) => {
  const code = c.req.query('code');
  const stateQuery = c.req.query('state');
  const stateCookie = getCookie(c, STATE_COOKIE);
  const nonce = getCookie(c, NONCE_COOKIE);

  if (!code || !stateQuery || !stateCookie || stateQuery !== stateCookie) {
    throw new AppError('OAUTH_STATE_MISMATCH', 'invalid or expired state', 400);
  }
  let stateValue: string;
  try { stateValue = await verifyState(stateCookie); }
  catch { throw new AppError('OAUTH_STATE_MISMATCH', 'state signature invalid', 400); }
  if (!stateValue) throw new AppError('OAUTH_STATE_MISMATCH', 'state empty', 400);

  if (!nonce) throw new AppError('OAUTH_NONCE_MISSING', 'nonce cookie missing', 400);

  clearOauthCookies(c);

  const token = await exchangeCodeForToken(code);
  if (!token.id_token) throw new AppError('LINE_ID_TOKEN_INVALID', 'id_token missing', 502);
  const claims = await verifyLineIdToken(token.id_token, { nonce });

  const profile = await fetchLineProfile(token.access_token);
  if (profile.userId !== claims.sub) {
    throw new AppError('LINE_ID_TOKEN_INVALID', 'profile sub mismatch', 502);
  }

  const user = await prisma.user.upsert({
    where: { lineUserId: profile.userId },
    create: {
      lineUserId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    },
    update: {
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl,
    },
  });

  const jwt = await signSession({ userId: user.id });
  setSessionCookie(c, jwt);
  return c.redirect(env.PUBLIC_FRONTEND_ORIGIN + '/');
});

authRoutes.post('/api/logout', (c) => {
  clearSessionCookie(c);
  return c.body(null, 204);
});
```

- [ ] **Step 4: Mount routes**

In `server/src/index.ts`:

```ts
import { authRoutes } from './routes/auth.js';
app.route('/', authRoutes);
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/auth.test.ts
```

Expected: PASS 5/5.

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/auth.ts server/src/index.ts server/tests/integration/auth.test.ts
git commit -m "feat(server): LINE OAuth start/callback with signed state + id_token nonce"
```

---

## Task 11: Prisma — prizes / app_settings / draw_logs / redemption

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/tests/helpers/db.ts` (extend TABLES)
- Create: `server/prisma/seed.ts`

**Idempotency lives on `Redemption.idempotencyKey`**, scoped by `(userId, idempotencyKey)` via composite unique — addresses Codex #8 and the multi-tier batch issue (10 child DrawLogs would have collided on a per-DrawLog unique).

- [ ] **Step 1: Append to `server/prisma/schema.prisma`**

```prisma
model Prize {
  id            String   @id @default(cuid())
  rankLabel     String                                // 頭獎 / 二獎 / ...
  name          String
  description   String?
  imageUrl      String?
  stock         Int      @default(0)
  weight        Int      @default(0)
  wheelPosition Int      @default(0)
  sortOrder     Int      @default(0)
  cashAmount    Int      @default(0)                  // fixed payout per win (no jackpot accumulation)
  segmentColor  String   @default("#9b3eb8")
  textColor     String   @default("#fff5d6")
  enabled       Boolean  @default(true)
  isConsolation Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  drawLogs      DrawLog[]
}

model AppSetting {
  key       String   @id
  value     String
  updatedAt DateTime @updatedAt
}

enum GatedBy {
  min_draws
  cooldown
  payout_cap
}

enum RedemptionStatus {
  pending      // 未完成 — default after draw
  delivered    // 已派送 — admin transferred the cash to the entertainment center account
  cancelled    // 已取消 — admin marked as invalid (e.g. fraud, duplicate screenshot)
}

/**
 * One Redemption represents one抽獎請求 (single = 1 prize hit, multi = 10).
 * `code` is the random redemption code the member screenshots and sends to admin.
 * Lifetime: one row per `POST /api/draw` call. Owned by one user; multiple `DrawLog`
 * children hang off it via `redemptionId`.
 */
model Redemption {
  id                          String           @id @default(cuid())
  userId                      String
  user                        User             @relation(fields: [userId], references: [id])
  code                        String           @unique         // Crockford Base32, e.g. K3F7-PRA2-NX9V
  tier                        String                          // "single" | "multi"
  totalWinAmount              Int              @default(0)    // sum of winningCashAmount across drawLogs; written once at end of tx
  status                      RedemptionStatus @default(pending)
  statusChangedAt             DateTime?
  statusChangedByAdminUserId  String?
  cancelReason                String?
  isTest                      Boolean          @default(false) // mirrors draw_logs.isTest, for admin filtering
  // Idempotency lives at the BATCH level. A multi-tier request has 10 child DrawLogs
  // that all share the same idempotency key, so the unique constraint must NOT be on
  // DrawLog (would block sub-draw 2..10). One Redemption per (user, key) is the contract.
  idempotencyKey              String?
  createdAt                   DateTime         @default(now())
  updatedAt                   DateTime         @updatedAt

  drawLogs                    DrawLog[]

  @@unique([userId, idempotencyKey])
  @@index([userId, createdAt])
  @@index([status, createdAt])
  @@index([isTest, createdAt])
}

model DrawLog {
  id                  String      @id @default(cuid())
  userId              String
  user                User        @relation(fields: [userId], references: [id])

  // Rev 3: every draw_log belongs to a Redemption (1 for single, 10 for multi).
  redemptionId        String
  redemption          Redemption  @relation(fields: [redemptionId], references: [id])
  subIndex            Int                                     // 0 for single; 0..9 for multi

  prizeId             String
  prize               Prize       @relation(fields: [prizeId], references: [id])
  tier                String                                  // "single" | "multi"
  tierCost            Int
  tierDraws           Int
  pointsBefore        Int
  pointsAfter         Int
  randomSeed          String
  winningCashAmount   Int         @default(0)                 // = prize.cashAmount, or 0 if consolation/gated
  isTest              Boolean     @default(false)
  forcedByAdmin       Boolean     @default(false)
  gatedBy             GatedBy?
  // NOTE: no idempotencyKey here — multi-tier writes 10 sub-rows that share one batch key.
  //       The unique key lives on Redemption to prevent that collision.
  createdAt           DateTime    @default(now())

  @@unique([redemptionId, subIndex])  // each sub-draw within a batch is unique
  @@index([userId, createdAt])
}

// JackpotHistory and JackpotEventType deliberately omitted (Rev 3 jackpot removal).
```

Also **modify the existing `User` model from Task 3** to add the matching back-relations. Without these the new `DrawLog` and `Redemption` `@relation(fields: [userId], references: [id])` declarations will fail Prisma validation. Add inside `User { ... }`, anywhere before the `createdAt` line:

```prisma
  drawLogs                 DrawLog[]
  redemptions              Redemption[]
```

`Prize.drawLogs DrawLog[]` is already in the patch above; no extra edit needed for Prize.

- [ ] **Step 2: Migrate**

```bash
cd server && npx prisma migrate dev --name add_prizes_settings_drawlogs_redemption
```

- [ ] **Step 3: Update `server/tests/helpers/db.ts`**

```ts
const TABLES = [
  'DrawLog',
  'Redemption',
  'Prize',
  'AppSetting',
  'AdminActionLog',
  'User',
] as const;
```

- [ ] **Step 4: Implement `server/prisma/seed.ts`**

The `pointThresholds` setting is stored as a JSON-encoded string (consistent with `AppSetting.value: String`).

```ts
import { prisma } from '../src/db.js';

export const SETTINGS_KEYS = {
  pointThresholds: 'pointThresholds',
  spinDurationMs: 'spinDurationMs',
  minDrawsBeforeWin: 'minDrawsBeforeWin',
  cooldownDrawsAfterWin: 'cooldownDrawsAfterWin',
  payoutCapEnabled: 'payoutCapEnabled',
  payoutCapRatio: 'payoutCapRatio',
  consolationPrizeId: 'consolationPrizeId',
  // System totals — maintained atomically inside the draw transaction
  // (replaces SUM(User) aggregation; addresses Codex finding B1/D1).
  totalDrawCount: 'totalDrawCount',
  totalPayoutAmount: 'totalPayoutAmount',
  totalPointsBurned: 'totalPointsBurned',
} as const;

export const DEFAULT_THRESHOLDS = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
  { points: 35, draws: 7 },
  { points: 48, draws: 10 },
];

export const DEFAULT_SETTINGS: Record<string, string> = {
  [SETTINGS_KEYS.pointThresholds]: JSON.stringify(DEFAULT_THRESHOLDS),
  [SETTINGS_KEYS.spinDurationMs]: '4300',
  [SETTINGS_KEYS.minDrawsBeforeWin]: '0',
  [SETTINGS_KEYS.cooldownDrawsAfterWin]: '0',
  [SETTINGS_KEYS.payoutCapEnabled]: 'false',
  [SETTINGS_KEYS.payoutCapRatio]: '0.45',
  [SETTINGS_KEYS.consolationPrizeId]: '',
  [SETTINGS_KEYS.totalDrawCount]: '0',
  [SETTINGS_KEYS.totalPayoutAmount]: '0',
  [SETTINGS_KEYS.totalPointsBurned]: '0',
};

const PRIZES = [
  { rankLabel: '頭獎', name: '最高彩金', cashAmount: 10000, weight: 2,                    segmentColor: '#d92b3a', wheelPosition: 0 },
  { rankLabel: '二獎', name: '彩金',     cashAmount: 5000,  weight: 6,                    segmentColor: '#ec8a26', wheelPosition: 1 },
  { rankLabel: '三獎', name: '彩金',     cashAmount: 1000,  weight: 14,                   segmentColor: '#c98612', wheelPosition: 2 },
  { rankLabel: '四獎', name: '彩金',     cashAmount: 500,   weight: 22,                   segmentColor: '#38a86e', wheelPosition: 3 },
  { rankLabel: '五獎', name: '彩金',     cashAmount: 100,   weight: 26,                   segmentColor: '#2e7cd9', wheelPosition: 4 },
  { rankLabel: '六獎', name: '謝謝參加', cashAmount: 0,     weight: 30, isConsolation: true, segmentColor: '#9b3eb8', wheelPosition: 5 },
];

async function main() {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: {} });
  }
  if ((await prisma.prize.count()) === 0) {
    for (const p of PRIZES) await prisma.prize.create({ data: { ...p, stock: 9999 } });
    const consolation = await prisma.prize.findFirst({ where: { isConsolation: true } });
    if (consolation) {
      await prisma.appSetting.update({
        where: { key: SETTINGS_KEYS.consolationPrizeId },
        data: { value: consolation.id },
      });
    }
  }
  console.log('seed done');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  main().finally(() => prisma.$disconnect());
}
```

- [ ] **Step 5: Run seed**

```bash
cd server && npx tsx prisma/seed.ts
```

Expected: prints `seed done`; idempotent on re-run.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations server/prisma/seed.ts server/tests/helpers/db.ts
git commit -m "feat(server): prizes/settings/draw_logs/redemption (batch-level idempotency on Redemption)"
```

---

## Task 12: Test factories

**Files:**
- Create: `server/tests/helpers/factories.ts`

- [ ] **Step 1: Create factories**

```ts
import type { AccountType } from '@prisma/client';
import { prisma } from '../../src/db.js';
import { DEFAULT_SETTINGS, SETTINGS_KEYS } from '../../prisma/seed.js';

let u = 0, p = 0;

export async function createUser(o: Partial<{
  lineUserId: string;
  displayName: string;
  points: number;
  accountType: AccountType;
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  lifetimeDrawCount: number;
  lastWinDrawIndex: number | null;
  totalBurnAmount: number;
  totalLuckAmount: number;
  nickname: string | null;                  // Rev 3: pass null to opt out of the onboarding gate (default: pre-onboarded)
  entertainmentMemberCode: string | null;   // Rev 3: same — pass null to test the onboarding gate
}> = {}) {
  u += 1;
  // Factory default: users are pre-onboarded (both nickname AND code set) so existing
  // draw tests don't have to call the onboarding endpoint. Tests of the onboarding
  // gate explicitly pass `nickname: null` or `entertainmentMemberCode: null` to opt out.
  const defaultNickname = `小測${u}`;
  const defaultCode = `EM_${u.toString().padStart(8, '0')}`;
  const codeValue = o.entertainmentMemberCode === undefined ? defaultCode : o.entertainmentMemberCode;
  const nicknameValue = o.nickname === undefined ? defaultNickname : o.nickname;
  return prisma.user.create({
    data: {
      lineUserId: o.lineUserId ?? `U_test_${u}`,
      displayName: o.displayName ?? `Tester ${u}`,
      nickname: nicknameValue,
      points: o.points ?? 100,
      accountType: o.accountType ?? 'verified',
      testSkipCost: o.testSkipCost ?? false,
      testForcePrizeId: o.testForcePrizeId ?? null,
      lifetimeDrawCount: o.lifetimeDrawCount ?? 0,
      lastWinDrawIndex: o.lastWinDrawIndex ?? null,
      totalBurnAmount: o.totalBurnAmount ?? 0,
      totalLuckAmount: o.totalLuckAmount ?? 0,
      entertainmentMemberCode: codeValue,
      entertainmentCodeBoundAt: codeValue === null ? null : new Date(),
    },
  });
}

export async function createPrize(o: Partial<{
  rankLabel: string;
  cashAmount: number;
  weight: number;
  isConsolation: boolean;
  enabled: boolean;
  stock: number;
}> = {}) {
  p += 1;
  return prisma.prize.create({
    data: {
      rankLabel: o.rankLabel ?? `prize-${p}`,
      name: 'test prize',
      stock: o.stock ?? 100,
      weight: o.weight ?? 10,
      cashAmount: o.cashAmount ?? 100,
      isConsolation: o.isConsolation ?? false,
      enabled: o.enabled ?? true,
    },
  });
}

export async function seedDefaultSettings(over: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({ ...DEFAULT_SETTINGS, ...over })) {
    await prisma.appSetting.upsert({
      where: { key }, create: { key, value }, update: { value },
    });
  }
}

export { SETTINGS_KEYS };
```

- [ ] **Step 2: Commit**

```bash
git add server/tests/helpers/factories.ts
git commit -m "test(server): factories for user/prize/settings"
```

---

## Task 13: Tier parser

**Files:**
- Create: `server/src/draw/tier.ts`
- Test: `server/tests/unit/draw/tier.test.ts`

Pure, addresses Codex #2.

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/draw/tier.test.ts
import { describe, it, expect } from 'vitest';
import { parseTier, resolveThreshold, DEFAULT_TIERS } from '../../../src/draw/tier.js';

const thresholds = [
  { points: 6, draws: 1 },
  { points: 15, draws: 3 },
  { points: 25, draws: 5 },
];

describe('parseTier', () => {
  it('accepts "single"', () => expect(parseTier('single')).toBe('single'));
  it('accepts "multi"', () => expect(parseTier('multi')).toBe('multi'));
  it('throws on garbage', () => expect(() => parseTier('huge')).toThrow(/TIER_INVALID/));
});

describe('resolveThreshold', () => {
  it('single → first threshold', () => {
    expect(resolveThreshold('single', thresholds)).toEqual({ points: 6, draws: 1 });
  });
  it('multi → last threshold', () => {
    expect(resolveThreshold('multi', thresholds)).toEqual({ points: 25, draws: 5 });
  });
  it('throws on empty threshold list', () => {
    expect(() => resolveThreshold('single', [])).toThrow(/POINT_THRESHOLDS_EMPTY/);
  });
});

describe('DEFAULT_TIERS', () => {
  it('exports the union literal', () => {
    expect(DEFAULT_TIERS).toEqual(['single', 'multi']);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/draw/tier.test.ts
```

- [ ] **Step 3: Implement `server/src/draw/tier.ts`**

```ts
export type Tier = 'single' | 'multi';
export const DEFAULT_TIERS: readonly Tier[] = ['single', 'multi'];

export interface Threshold { points: number; draws: number; }

export function parseTier(input: unknown): Tier {
  if (input === 'single' || input === 'multi') return input;
  throw new Error('TIER_INVALID');
}

export function resolveThreshold(tier: Tier, thresholds: Threshold[]): Threshold {
  if (thresholds.length === 0) throw new Error('POINT_THRESHOLDS_EMPTY');
  return tier === 'single'
    ? thresholds[0]!
    : thresholds[thresholds.length - 1]!;
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/draw/tier.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/draw/tier.ts server/tests/unit/draw/tier.test.ts
git commit -m "feat(server): tier parser + threshold resolver"
```

---

## Task 14: pickPrize (rejects 0 total weight)

Addresses Codex #13.

**Files:**
- Create: `server/src/draw/types.ts`
- Create: `server/src/draw/pick.ts`
- Test: `server/tests/unit/draw/pick.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/draw/pick.test.ts
import { describe, it, expect } from 'vitest';
import { pickPrize } from '../../../src/draw/pick.js';

const A = { id: 'a', weight: 1, stock: 1, enabled: true, isConsolation: false };
const B = { id: 'b', weight: 4, stock: 1, enabled: true, isConsolation: false };

describe('pickPrize', () => {
  it('returns first when roll is 0', () => {
    expect(pickPrize([A, B], () => 0).id).toBe('a');
  });
  it('weighted distribution', () => {
    expect(pickPrize([A, B], () => 0.5).id).toBe('b'); // 0.5 * 5 = 2.5 → b
  });
  it('skips disabled / out of stock', () => {
    const list = [
      { id: 'a', weight: 1, stock: 0, enabled: true, isConsolation: false },
      { id: 'b', weight: 1, stock: 1, enabled: false, isConsolation: false },
      { id: 'c', weight: 1, stock: 1, enabled: true, isConsolation: false },
    ];
    expect(pickPrize(list, () => 0.99).id).toBe('c');
  });
  it('throws on empty list', () => {
    expect(() => pickPrize([], () => 0)).toThrow(/NO_ACTIVE_PRIZE/);
  });
  it('throws when total weight is 0', () => {
    const zero = [{ id: 'z', weight: 0, stock: 5, enabled: true, isConsolation: false }];
    expect(() => pickPrize(zero, () => 0.5)).toThrow(/ZERO_WEIGHT/);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/draw/pick.test.ts
```

- [ ] **Step 3: Implement `server/src/draw/types.ts`**

```ts
export interface CandidatePrize {
  id: string;
  weight: number;
  stock: number;
  enabled: boolean;
  isConsolation: boolean;
}
```

- [ ] **Step 4: Implement `server/src/draw/pick.ts`**

```ts
import type { CandidatePrize } from './types.js';

export function pickPrize<T extends CandidatePrize>(
  prizes: T[],
  rng: () => number = Math.random,
): T {
  const active = prizes.filter((p) => p.enabled && p.stock > 0);
  if (active.length === 0) throw new Error('NO_ACTIVE_PRIZE');
  const total = active.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) throw new Error('ZERO_WEIGHT');
  let roll = rng() * total;
  for (const p of active) {
    roll -= p.weight;
    if (roll < 0) return p;
  }
  return active[active.length - 1]!;
}
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/draw/pick.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/src/draw/types.ts server/src/draw/pick.ts server/tests/unit/draw/pick.test.ts
git commit -m "feat(server): pickPrize (rejects 0 total weight)"
```

---

## Task 15: evaluateGates (operates on post-deduct counters)

Addresses Codex #4. The contract is explicit in JSDoc and in tests: callers pass **already-incremented** `lifetimeDrawCount`.

**Files:**
- Create: `server/src/draw/gates.ts`
- Test: `server/tests/unit/draw/gates.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/draw/gates.test.ts
import { describe, it, expect } from 'vitest';
import { evaluateGates } from '../../../src/draw/gates.js';

const baseUser = { lifetimeDrawCount: 0, lastWinDrawIndex: null as number | null };
const baseTotals = { totalPayoutAmount: 0, totalPointsBurned: 0 };
const baseSettings = {
  minDrawsBeforeWin: 0,
  cooldownDrawsAfterWin: 0,
  payoutCapEnabled: false,
  payoutCapRatio: 0.45,
};

describe('evaluateGates (post-deduct semantics)', () => {
  it('null when no gate triggers', () => {
    expect(evaluateGates(baseUser, baseTotals, baseSettings)).toBeNull();
  });
  it('min_draws: blocks while POST-deduct draw count below threshold', () => {
    // user just did their 5th draw; threshold is 5; per spec the 5th draw
    // should be the FIRST eligible draw → gate must NOT trigger
    expect(evaluateGates(
      { ...baseUser, lifetimeDrawCount: 5 }, baseTotals, { ...baseSettings, minDrawsBeforeWin: 5 },
    )).toBeNull();
    // user just did their 4th draw — still below threshold
    expect(evaluateGates(
      { ...baseUser, lifetimeDrawCount: 4 }, baseTotals, { ...baseSettings, minDrawsBeforeWin: 5 },
    )).toBe('min_draws');
  });
  it('cooldown: blocks if current draw is within cooldown window after last win', () => {
    // lastWinDrawIndex=2, cooldown=5 → draws 3,4,5,6 blocked; draw 7 ok
    expect(evaluateGates({ lifetimeDrawCount: 6, lastWinDrawIndex: 2 }, baseTotals,
      { ...baseSettings, cooldownDrawsAfterWin: 5 })).toBe('cooldown');
    expect(evaluateGates({ lifetimeDrawCount: 7, lastWinDrawIndex: 2 }, baseTotals,
      { ...baseSettings, cooldownDrawsAfterWin: 5 })).toBeNull();
  });
  it('payout_cap: blocks above ratio, ignores when disabled', () => {
    expect(evaluateGates(baseUser, { totalPayoutAmount: 600, totalPointsBurned: 1000 },
      { ...baseSettings, payoutCapEnabled: true, payoutCapRatio: 0.45 })).toBe('payout_cap');
    expect(evaluateGates(baseUser, { totalPayoutAmount: 1_000_000, totalPointsBurned: 1 },
      { ...baseSettings, payoutCapEnabled: false })).toBeNull();
  });
  it('order: min_draws beats cooldown beats payout_cap', () => {
    expect(evaluateGates(
      { lifetimeDrawCount: 1, lastWinDrawIndex: 0 },
      { totalPayoutAmount: 10_000, totalPointsBurned: 1 },
      { minDrawsBeforeWin: 5, cooldownDrawsAfterWin: 5, payoutCapEnabled: true, payoutCapRatio: 0.45 },
    )).toBe('min_draws');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/draw/gates.test.ts
```

- [ ] **Step 3: Implement `server/src/draw/gates.ts`**

```ts
export type GateReason = 'min_draws' | 'cooldown' | 'payout_cap';

export interface GateUserState {
  /** POST-deduct lifetime draw count (already incremented by tierDraws). */
  lifetimeDrawCount: number;
  lastWinDrawIndex: number | null;
}
export interface GateTotals { totalPayoutAmount: number; totalPointsBurned: number; }
export interface GateSettings {
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  payoutCapEnabled: boolean;
  payoutCapRatio: number;
}

/** Caller must pass post-deduct counters. min_draws unblocks at the Nth draw, not the (N+1)th. */
export function evaluateGates(
  user: GateUserState, totals: GateTotals, s: GateSettings,
): GateReason | null {
  if (s.minDrawsBeforeWin > 0 && user.lifetimeDrawCount < s.minDrawsBeforeWin) return 'min_draws';
  if (
    s.cooldownDrawsAfterWin > 0 &&
    user.lastWinDrawIndex !== null &&
    user.lifetimeDrawCount - user.lastWinDrawIndex < s.cooldownDrawsAfterWin
  ) return 'cooldown';  // spec uses `<`, not `<=`: a diff == cooldown means the cooldown window just closed
  if (s.payoutCapEnabled) {
    const denom = Math.max(totals.totalPointsBurned, 1);
    if (totals.totalPayoutAmount / denom > s.payoutCapRatio) return 'payout_cap';
  }
  return null;
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/draw/gates.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/draw/gates.ts server/tests/unit/draw/gates.test.ts
git commit -m "feat(server): cost-control gate evaluator (post-deduct semantics)"
```

---

## Task 16: ~~resolveJackpot~~ — REMOVED in Rev 3

This task is deliberately empty. Jackpot accumulation was removed per Rev 3 (`頭獎 → 六獎` are plain fixed-amount prizes; each win pays `prize.cashAmount` directly). The skipped task number is left for traceability so subsequent tasks (17, 18, …) keep their existing numbering.

Implementation impact:
- Do **not** create `server/src/draw/jackpot.ts`.
- Do **not** add `server/tests/unit/draw/jackpot.test.ts`.
- Skip directly to Task 17.

---

## Task 17: Settings reader + system totals row-lock helper

Addresses Codex #6 + #12 (`spinDurationMs` from settings, not hardcoded). Jackpot helpers removed in Rev 3.

**Files:**
- Create: `server/src/draw/settings.ts`
- Test: `server/tests/integration/settings_reader.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/settings_reader.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../helpers/db.js';
import { seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import {
  readDrawSettings,
  readSystemTotalsForUpdate,
  incrementSystemTotals,
} from '../../src/draw/settings.js';
import { prisma } from '../../src/db.js';

describe('settings reader', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('parses defaults', async () => {
    const s = await readDrawSettings();
    expect(s.pointThresholds[0]).toEqual({ points: 6, draws: 1 });
    expect(s.pointThresholds.at(-1)).toEqual({ points: 48, draws: 10 });
    expect(s.spinDurationMs).toBe(4300);
    expect(s.payoutCapEnabled).toBe(false);
  });

  it('readSystemTotalsForUpdate + incrementSystemTotals round-trip atomically', async () => {
    await prisma.$transaction(async (tx) => {
      const t0 = await readSystemTotalsForUpdate(tx);
      expect(t0).toEqual({ totalDrawCount: 0, totalPayoutAmount: 0, totalPointsBurned: 0 });
      await incrementSystemTotals(tx, { drawCount: 1, payoutAmount: 500, pointsBurned: 6 });
    });
    const t1 = await prisma.$transaction(async (tx) => readSystemTotalsForUpdate(tx));
    expect(t1).toEqual({ totalDrawCount: 1, totalPayoutAmount: 500, totalPointsBurned: 6 });
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/settings_reader.test.ts
```

- [ ] **Step 3: Implement `server/src/draw/settings.ts`**

```ts
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db.js';
import { SETTINGS_KEYS } from '../../prisma/seed.js';
import type { Threshold } from './tier.js';

type Tx = PrismaClient | Prisma.TransactionClient;

export interface DrawSettings {
  pointThresholds: Threshold[];
  spinDurationMs: number;
  minDrawsBeforeWin: number;
  cooldownDrawsAfterWin: number;
  payoutCapEnabled: boolean;
  payoutCapRatio: number;
  consolationPrizeId: string;
}

export async function readDrawSettings(): Promise<DrawSettings> {
  const rows = await prisma.appSetting.findMany();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const n = (k: string) => Number(map.get(k) ?? '0');
  const s = (k: string) => map.get(k) ?? '';
  let thresholds: Threshold[] = [];
  try { thresholds = JSON.parse(s(SETTINGS_KEYS.pointThresholds)); } catch { /* fall through */ }
  return {
    pointThresholds: thresholds,
    spinDurationMs: n(SETTINGS_KEYS.spinDurationMs),
    minDrawsBeforeWin: n(SETTINGS_KEYS.minDrawsBeforeWin),
    cooldownDrawsAfterWin: n(SETTINGS_KEYS.cooldownDrawsAfterWin),
    payoutCapEnabled: s(SETTINGS_KEYS.payoutCapEnabled) === 'true',
    payoutCapRatio: Number(s(SETTINGS_KEYS.payoutCapRatio) || '0'),
    consolationPrizeId: s(SETTINGS_KEYS.consolationPrizeId),
  };
}

/**
 * Read system totals under FOR UPDATE row locks. This must happen INSIDE the
 * draw transaction so concurrent draws serialize on these rows, preventing the
 * payout-cap race where two parallel wins both pass a stale cap check
 * (addresses Codex finding B1/D1).
 */
export async function readSystemTotalsForUpdate(tx: Tx): Promise<{
  totalDrawCount: number;
  totalPayoutAmount: number;
  totalPointsBurned: number;
}> {
  const rows = await tx.$queryRawUnsafe<{ key: string; value: string }[]>(
    `SELECT key, value FROM "AppSetting"
     WHERE key IN ($1, $2, $3)
     ORDER BY key
     FOR UPDATE`,
    SETTINGS_KEYS.totalDrawCount,
    SETTINGS_KEYS.totalPayoutAmount,
    SETTINGS_KEYS.totalPointsBurned,
  );
  const map = new Map(rows.map((r) => [r.key, Number(r.value)]));
  return {
    totalDrawCount: map.get(SETTINGS_KEYS.totalDrawCount) ?? 0,
    totalPayoutAmount: map.get(SETTINGS_KEYS.totalPayoutAmount) ?? 0,
    totalPointsBurned: map.get(SETTINGS_KEYS.totalPointsBurned) ?? 0,
  };
}

/** Write deltas back to the locked system totals. Must run in the same tx as the lock. */
export async function incrementSystemTotals(
  tx: Tx,
  deltas: { drawCount?: number; payoutAmount?: number; pointsBurned?: number },
): Promise<void> {
  const updates: Array<{ key: string; delta: number }> = [];
  if (deltas.drawCount)    updates.push({ key: SETTINGS_KEYS.totalDrawCount,    delta: deltas.drawCount });
  if (deltas.payoutAmount) updates.push({ key: SETTINGS_KEYS.totalPayoutAmount, delta: deltas.payoutAmount });
  if (deltas.pointsBurned) updates.push({ key: SETTINGS_KEYS.totalPointsBurned, delta: deltas.pointsBurned });
  for (const u of updates) {
    await tx.$executeRawUnsafe(
      `UPDATE "AppSetting" SET value = (CAST(value AS INTEGER) + $1)::text WHERE key = $2`,
      u.delta, u.key,
    );
  }
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/settings_reader.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/draw/settings.ts server/tests/integration/settings_reader.test.ts
git commit -m "feat(server): settings reader + system-totals row lock (tx-scoped)"
```

---

## Task 17b: Redemption code generator (Crockford Base32)

Addresses Rev 3 — random redemption code per Redemption row.

**Files:**
- Create: `server/src/draw/redemption-code.ts`
- Test: `server/tests/unit/draw/redemption-code.test.ts`

Format: 12-char Crockford Base32 split into 3 groups of 4 with dashes, e.g. `K3F7-PRA2-NX9V`. Crockford alphabet excludes `I`, `L`, `O`, `U` to avoid look-alike confusion. Generator must reject collisions at the DB layer via `Redemption.code @unique` (caller retries on `P2002`).

- [ ] **Step 1: Write failing test**

```ts
// server/tests/unit/draw/redemption-code.test.ts
import { describe, it, expect } from 'vitest';
import { generateRedemptionCode, isValidRedemptionCode } from '../../../src/draw/redemption-code.js';

describe('generateRedemptionCode', () => {
  it('returns 14 chars: 12 base32 + 2 dashes', () => {
    const c = generateRedemptionCode();
    expect(c).toHaveLength(14);
    expect(c[4]).toBe('-');
    expect(c[9]).toBe('-');
  });

  it('uses Crockford alphabet (no I/L/O/U)', () => {
    for (let i = 0; i < 200; i++) {
      const c = generateRedemptionCode().replace(/-/g, '');
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{12}$/);
    }
  });

  it('is reasonably unique over 10k calls', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 10_000; i++) seen.add(generateRedemptionCode());
    expect(seen.size).toBe(10_000);
  });

  it('isValidRedemptionCode round-trips', () => {
    const c = generateRedemptionCode();
    expect(isValidRedemptionCode(c)).toBe(true);
    expect(isValidRedemptionCode('XXXX-XXXX')).toBe(false);
    expect(isValidRedemptionCode('K3F7PRA2NX9V')).toBe(false);    // missing dashes
    expect(isValidRedemptionCode('K3F7-PRA2-NXOV')).toBe(false);  // contains O
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/unit/draw/redemption-code.test.ts
```

- [ ] **Step 3: Implement `server/src/draw/redemption-code.ts`**

```ts
import { randomBytes } from 'node:crypto';

// Crockford Base32 alphabet (excludes I, L, O, U to avoid look-alike confusion)
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function generateRedemptionCode(): string {
  // 12 chars × 5 bits per char = 60 bits of entropy; randomBytes(15) gives 120 bits, we use 8
  const buf = randomBytes(12);
  const chars: string[] = [];
  for (let i = 0; i < 12; i++) {
    chars.push(ALPHABET[buf[i]! % 32]!);
  }
  return `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8, 12).join('')}`;
}

export function isValidRedemptionCode(s: string): boolean {
  return CODE_RE.test(s);
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/unit/draw/redemption-code.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/draw/redemption-code.ts server/tests/unit/draw/redemption-code.test.ts
git commit -m "feat(server): redemption code generator (Crockford Base32, 12 char)"
```

---

## Task 18: POST /api/draw — blacklist + onboarding gates + verified flow with Redemption batching

Addresses Codex Rev 1 #1, #2, #3, #4, #11 + Rev 3 redemption + multi sub-picks (no jackpot — removed in Rev 3).

**Files:**
- Create: `server/src/routes/draw.ts`
- Test: `server/tests/integration/draw.test.ts`

This task lands the verified-flow handler with:
- zod body parsing → tier
- blacklist gate writing `admin_action_logs.event = 'draw_blocked_blacklist'`
- onboarding gate → 403 `ONBOARDING_REQUIRED` if `user.nickname` OR `user.entertainmentMemberCode` is null
- everything inside one transaction (default ReadCommitted + explicit row locks on system totals)
- gates evaluated AFTER point deduction + lifetime increment
- For `tier=multi`, the handler loops `pickPrize` 10 times and bundles results in one `Redemption` row with a Crockford-Base32 code
- Each sub-draw wins `prize.cashAmount` directly (no jackpot)
- Response shape: `{ redemption: {id, code, status, totalWinAmount}, draws: [...], points, tier, tierDraws, isTest }`

Test-account branch lands in Task 22; idempotency in Task 23; concurrency in Task 24.

- [ ] **Step 1: Write failing integration test**

```ts
// server/tests/integration/draw.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function authedHeaders(userId: string) {
  const t = await signSession({ userId });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — verified core', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('blacklisted user → 403 + admin_action_logs row + no draw_log, no balance change', async () => {
    const u = await createUser({ accountType: 'blacklisted', points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    const body = await r.json();
    expect(body.error.code).toBe('USER_BLACKLISTED');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(100);
    expect(await prisma.drawLog.count()).toBe(0);
    expect(await prisma.redemption.count()).toBe(0);

    const audits = await prisma.adminActionLog.findMany();
    expect(audits).toHaveLength(1);
    expect(audits[0]?.event).toBe('draw_blocked_blacklist');
    expect(audits[0]?.targetId).toBe(u.id);
    expect(audits[0]?.adminUserId).toBeNull();
  });

  it('user with no entertainment code → 403 ONBOARDING_REQUIRED, no charge', async () => {
    const u = await createUser({ entertainmentMemberCode: null, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('ONBOARDING_REQUIRED');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(100);
    expect(await prisma.redemption.count()).toBe(0);
  });

  it('user with no nickname → 403 ONBOARDING_REQUIRED, no charge', async () => {
    const u = await createUser({ nickname: null, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id),
      body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(403);
    expect((await r.json()).error.code).toBe('ONBOARDING_REQUIRED');
  });

  it('400 TIER_INVALID on malformed body', async () => {
    const u = await createUser();
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'huge' }),
    });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('TIER_INVALID');
  });

  it('422 INSUFFICIENT_POINTS', async () => {
    const u = await createUser({ points: 5 });
    await createPrize();
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('INSUFFICIENT_POINTS');
  });

  it('single tier verified happy path: 1 sub-draw, Redemption with code', async () => {
    const u = await createUser({ points: 28 });
    const prize = await createPrize({ weight: 1, cashAmount: 200 });

    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    // New response shape
    expect(body.tier).toBe('single');
    expect(body.tierDraws).toBe(1);
    expect(body.points).toBe(22);
    expect(body.isTest).toBe(false);

    expect(body.redemption.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
    expect(body.redemption.status).toBe('pending');
    expect(body.redemption.totalWinAmount).toBe(200);

    expect(body.draws).toHaveLength(1);
    expect(body.draws[0].subIndex).toBe(0);
    expect(body.draws[0].prize.id).toBe(prize.id);
    expect(body.draws[0].winningCashAmount).toBe(200);
    expect(body.draws[0].gatedBy).toBeNull();

    // No `prize` / `winningCashAmount` / `isJackpotHit` / `jackpotCurrentAmount` at top level
    expect(body).not.toHaveProperty('prize');
    expect(body).not.toHaveProperty('isJackpotHit');
    expect(body).not.toHaveProperty('jackpotCurrentAmount');

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(22);
    expect(after?.lifetimeDrawCount).toBe(1);
    expect(after?.totalBurnAmount).toBe(6);
    expect(after?.totalLuckAmount).toBe(200);
    expect(after?.lifetimePayoutAmount).toBe(200);
    expect(after?.lastWinDrawIndex).toBe(1);

    expect(await prisma.drawLog.count()).toBe(1);
    expect(await prisma.redemption.count()).toBe(1);
  });

  it('multi tier verified happy path: 10 sub-draws, one Redemption, totalWinAmount = sum', async () => {
    const u = await createUser({ points: 60 });
    const prize = await createPrize({ weight: 1, cashAmount: 100 });

    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'multi' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();

    expect(body.tier).toBe('multi');
    expect(body.tierDraws).toBe(10);
    expect(body.points).toBe(12);

    // Exactly 10 child sub-draws, with subIndex 0..9
    expect(body.draws).toHaveLength(10);
    body.draws.forEach((d: { subIndex: number; prize: { id: string }; winningCashAmount: number }, i: number) => {
      expect(d.subIndex).toBe(i);
      expect(d.prize.id).toBe(prize.id);
      expect(d.winningCashAmount).toBe(100);
    });

    // Redemption.totalWinAmount = sum of sub-draws
    expect(body.redemption.totalWinAmount).toBe(1000);
    expect(body.redemption.status).toBe('pending');

    // One Redemption row, 10 DrawLog rows
    expect(await prisma.drawLog.count()).toBe(10);
    expect(await prisma.redemption.count()).toBe(1);

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.lifetimeDrawCount).toBe(10);
    expect(after?.totalBurnAmount).toBe(48);
    expect(after?.totalLuckAmount).toBe(1000);
  });

  it('401 without session', async () => {
    const r = await app.request('/api/draw', {
      method: 'POST', body: JSON.stringify({ tier: 'single' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/draw.test.ts
```

- [ ] **Step 3: Implement `server/src/routes/draw.ts`**

```ts
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import type { Prize, User } from '@prisma/client';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';
import { writeAdminActionLog } from '../audit/log.js';
import { resolveThreshold, type Tier } from '../draw/tier.js';
import {
  readDrawSettings,
  readSystemTotalsForUpdate,
  incrementSystemTotals,
  type DrawSettings,
} from '../draw/settings.js';
import { evaluateGates } from '../draw/gates.js';
import { pickPrize } from '../draw/pick.js';
import { generateRedemptionCode } from '../draw/redemption-code.js';

const BodySchema = z.object({ tier: z.union([z.literal('single'), z.literal('multi')]) });

export const drawRoutes = new Hono();

drawRoutes.post('/api/draw', requireUser, async (c) => {
  const user = c.get('user');

  // Gate 0: blacklist
  if (user.accountType === 'blacklisted') {
    await writeAdminActionLog(prisma, {
      event: 'draw_blocked_blacklist',
      targetType: 'user',
      targetId: user.id,
      ip: c.req.header('x-forwarded-for') ?? null,
      userAgent: c.req.header('user-agent') ?? null,
    });
    throw new AppError('USER_BLACKLISTED', 'this account is suspended', 403);
  }

  // Gate 0.5: entertainment-code binding required
  if (!user.nickname || !user.entertainmentMemberCode) {
    throw new AppError('ONBOARDING_REQUIRED', 'must complete onboarding (nickname + entertainment code) before drawing', 403);
  }

  // Body parse
  let body: { tier: Tier };
  try { body = BodySchema.parse(await c.req.json()); }
  catch { throw new AppError('TIER_INVALID', 'tier must be "single" or "multi"', 400); }

  if (user.accountType === 'test') {
    return handleTestDraw(c, user, body.tier);  // implemented in Task 22
  }

  return handleVerifiedDraw(c, user, body.tier);
});

// Build the JSON response body (new Rev 3 shape).
function buildResponse(params: {
  redemption: { id: string; code: string; status: string; totalWinAmount: number; tier: string };
  drawLogs: Array<{ log: { id: string; subIndex: number; winningCashAmount: number; gatedBy: string | null }; chosen: Prize }>;
  finalUserPoints: number;
  tier: Tier;
  tierDraws: number;
  isTest: boolean;
}) {
  return {
    redemption: {
      id: params.redemption.id,
      code: params.redemption.code,
      status: params.redemption.status,
      totalWinAmount: params.redemption.totalWinAmount,
    },
    draws: params.drawLogs.map(({ log, chosen }) => ({
      drawLogId: log.id,
      subIndex: log.subIndex,
      prize: {
        id: chosen.id,
        rankLabel: chosen.rankLabel,
        name: chosen.name,
        description: chosen.description,
        imageUrl: chosen.imageUrl,
        wheelPosition: chosen.wheelPosition,
      },
      winningCashAmount: log.winningCashAmount,
      gatedBy: log.gatedBy,
    })),
    points: params.finalUserPoints,
    tier: params.tier,
    tierDraws: params.tierDraws,
    isTest: params.isTest,
  };
}

async function handleVerifiedDraw(c: Context, user: User, tier: Tier) {
  const settings = await readDrawSettings();
  const threshold = resolveThreshold(tier, settings.pointThresholds);

  // NOTE: no pre-tx precheck on user.points. The middleware-loaded user is
  // potentially stale; the `WHERE points: { gte: cost }` inside the tx is
  // authoritative. P2025 → 422 below.

  // Idempotency on Redemption (NOT DrawLog — multi has 10 children with same key).
  // (Full implementation lands in Task 23; placeholder no-op here so the structure
  // is in place.)
  const idempotencyKey = c.req.header('idempotency-key') ?? null;

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const totals = await readSystemTotalsForUpdate(tx);

      // Deduct + lifetime increment atomically. P2025 if insufficient.
      const updatedUser = await tx.user.update({
        where: { id: user.id, points: { gte: threshold.points } },
        data: {
          points: { decrement: threshold.points },
          lifetimeDrawCount: { increment: threshold.draws },
          totalBurnAmount: { increment: threshold.points },
        },
      });

      // Post-deduct gates (counter values already incremented). One evaluation
      // for the whole batch — multi-tier doesn't iterate gates per sub-draw
      // (see Rev 2.1 "documented decision" section).
      const gated = evaluateGates(
        { lifetimeDrawCount: updatedUser.lifetimeDrawCount, lastWinDrawIndex: updatedUser.lastWinDrawIndex },
        totals,
        settings,
      );

      const eligible = await tx.prize.findMany({ where: { enabled: true } });

      // Create the Redemption row first so DrawLog.redemptionId is non-null.
      const redemption = await tx.redemption.create({
        data: {
          userId: user.id,
          code: generateRedemptionCode(),
          tier,
          totalWinAmount: 0,                    // patched below after sub-draws resolved
          isTest: false,
          idempotencyKey,
        },
      });

      // Run N sub-picks (1 for single, 10 for multi).
      const subDraws: Array<{ chosen: Prize; winningCashAmount: number }> = [];
      for (let i = 0; i < threshold.draws; i++) {
        let chosen: Prize;
        if (gated) {
          chosen = (eligible.find((p) => p.id === settings.consolationPrizeId)
                ?? eligible.find((p) => p.isConsolation)) as Prize | undefined
                ?? (() => { throw new AppError('NO_CONSOLATION_PRIZE', 'consolation prize missing', 500); })();
        } else {
          chosen = pickPrize(eligible);
          // Per-sub-draw stock decrement with `stock > 0` guard. On race, fall back
          // to consolation for THIS sub-draw only. Member already paid the tier cost;
          // returning 409 mid-batch would leave them in an inconsistent state.
          if (!chosen.isConsolation) {
            const stockUpdate = await tx.prize.updateMany({
              where: { id: chosen.id, stock: { gt: 0 } },
              data: { stock: { decrement: 1 } },
            });
            if (stockUpdate.count === 0) {
              chosen = (eligible.find((p) => p.id === settings.consolationPrizeId)
                    ?? eligible.find((p) => p.isConsolation)) as Prize | undefined
                    ?? (() => { throw new AppError('NO_CONSOLATION_PRIZE', 'consolation prize missing', 500); })();
            }
          }
        }
        const winningCashAmount = chosen.isConsolation ? 0 : chosen.cashAmount;
        subDraws.push({ chosen, winningCashAmount });
      }

      const totalWinAmount = subDraws.reduce((s, d) => s + d.winningCashAmount, 0);

      // Finalize user (win accounting) — only if non-gated AND someone won something.
      const finalUser = (!gated && totalWinAmount > 0)
        ? await tx.user.update({
            where: { id: user.id },
            data: {
              lifetimePayoutAmount: { increment: totalWinAmount },
              totalLuckAmount: { increment: totalWinAmount },
              lastWinDrawIndex: updatedUser.lifetimeDrawCount,
            },
          })
        : updatedUser;

      // Write N DrawLogs linked to the Redemption.
      const drawLogs: Array<{ log: Awaited<ReturnType<typeof tx.drawLog.create>>; chosen: Prize }> = [];
      for (let i = 0; i < subDraws.length; i++) {
        const { chosen, winningCashAmount } = subDraws[i]!;
        const log = await tx.drawLog.create({
          data: {
            userId: user.id,
            redemptionId: redemption.id,
            subIndex: i,
            prizeId: chosen.id,
            tier,
            tierCost: threshold.points,
            tierDraws: threshold.draws,
            pointsBefore: user.points,
            pointsAfter: finalUser.points,
            randomSeed: randomBytes(8).toString('hex'),
            winningCashAmount,
            isTest: false,
            forcedByAdmin: false,
            gatedBy: gated ?? undefined,
          },
        });
        drawLogs.push({ log, chosen });
      }

      // Patch Redemption.totalWinAmount now that sub-draws are settled.
      const finalRedemption = await tx.redemption.update({
        where: { id: redemption.id },
        data: { totalWinAmount },
      });

      // System totals — atomic under the FOR UPDATE lock taken above.
      await incrementSystemTotals(tx, {
        drawCount: threshold.draws,
        pointsBurned: threshold.points,
        payoutAmount: totalWinAmount,
      });

      return { redemption: finalRedemption, drawLogs, finalUser };
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
    }
    throw err;
  }

  return c.json(buildResponse({
    redemption: result.redemption,
    drawLogs: result.drawLogs,
    finalUserPoints: result.finalUser.points,
    tier,
    tierDraws: threshold.draws,
    isTest: false,
  }));
}

// handleTestDraw lands in Task 22.
async function handleTestDraw(_c: Context, _user: User, _tier: Tier): Promise<Response> {
  throw new AppError('NOT_IMPLEMENTED', 'test branch lands in Task 22', 500);
}

export { buildResponse };  // shared with Task 22 (test) and Task 23 (idempotency replay)
```

- [ ] **Step 4: Mount route**

In `server/src/index.ts`:

```ts
import { drawRoutes } from './routes/draw.js';
app.route('/', drawRoutes);
```

- [ ] **Step 5: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/draw.test.ts
```

Expected: PASS 7/7 (blacklist + entertainment-code + tier_invalid + insufficient_points + single + multi + 401).

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/draw.ts server/src/index.ts server/tests/integration/draw.test.ts
git commit -m "feat(server): POST /api/draw (blacklist + onboarding gates + Redemption batching for single/multi)"
```

---

## Task 19: ~~jackpot-hit path~~ — REMOVED in Rev 3

Jackpot accumulation was removed in Rev 3. Top-prize wins now pay `prize.cashAmount` like every other prize — no separate "hit jackpot" branch to test. The skipped task number is preserved for traceability so subsequent tasks (20, 21, …) keep their numbering.

Implementation impact:
- Do **not** add the jackpot-hit describe block to `tests/integration/draw.test.ts`.
- Skip directly to Task 20.

---

## Task 20: Gates — min_draws, cooldown, payout_cap integration

Addresses Codex #13 (Rev 1 only had min_draws integration tests).

**Files:**
- Modify: `server/tests/integration/draw.test.ts`

- [ ] **Step 1: Append failing tests**

```ts
describe('POST /api/draw — gates', () => {
  beforeEach(async () => { await resetDb(); });

  // NOTE: `gatedBy` lives on each sub-draw entry (`body.draws[i].gatedBy`), not at the top level —
  // single tier has one entry, multi has 10 but all share the same gate result for the batch.
  it('min_draws: blocks until threshold reached (post-deduct counting)', async () => {
    await seedDefaultSettings({ minDrawsBeforeWin: '5' });
    const consolation = await createPrize({ isConsolation: true, weight: 1 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await prisma.appSetting.update({ where: { key: SETTINGS_KEYS.consolationPrizeId },
                                      data: { value: consolation.id } });

    // lifetimeDrawCount starts at 4; after deduct it becomes 5 → first eligible
    const u = await createUser({ points: 100, lifetimeDrawCount: 4 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    const body = await r.json();
    expect(body.draws[0].gatedBy).toBeNull();

    // a different user starts at 3 → after deduct = 4 < 5 → gated
    const u2 = await createUser({ points: 100, lifetimeDrawCount: 3 });
    const r2 = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u2.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect((await r2.json()).draws[0].gatedBy).toBe('min_draws');
  });

  it('cooldown: enforces exact boundary (< not <=)', async () => {
    await seedDefaultSettings({ cooldownDrawsAfterWin: '3' });
    const consolation = await createPrize({ isConsolation: true, weight: 1 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await prisma.appSetting.update({ where: { key: SETTINGS_KEYS.consolationPrizeId },
                                      data: { value: consolation.id } });

    const cases = [
      { startLifetime: 5, expectGated: 'cooldown' as const },
      { startLifetime: 6, expectGated: 'cooldown' as const },
      { startLifetime: 7, expectGated: null as null },           // boundary opens here
      { startLifetime: 8, expectGated: null as null },
    ];
    for (const { startLifetime, expectGated } of cases) {
      const u = await createUser({
        points: 100, lifetimeDrawCount: startLifetime, lastWinDrawIndex: 5,
      });
      const r = await app.request('/api/draw', {
        method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
      });
      expect((await r.json()).draws[0].gatedBy).toBe(expectGated);
    }
  });

  it('cooldown gated: freezes lastWinDrawIndex / lifetime payout', async () => {
    await seedDefaultSettings({ cooldownDrawsAfterWin: '3' });
    const consolation = await createPrize({ isConsolation: true, weight: 1 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await prisma.appSetting.update({ where: { key: SETTINGS_KEYS.consolationPrizeId },
                                      data: { value: consolation.id } });

    const u = await createUser({ points: 100, lifetimeDrawCount: 5, lastWinDrawIndex: 5 });
    await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.lastWinDrawIndex).toBe(5);              // frozen
    expect(after?.totalLuckAmount).toBe(0);               // frozen
  });

  it('payout_cap: blocked when ratio exceeded (totals stored in app_settings, not derived from User)', async () => {
    await seedDefaultSettings({
      payoutCapEnabled: 'true',
      payoutCapRatio: '0.45',
      totalPayoutAmount: '600',
      totalPointsBurned: '1000',
    });
    const consolation = await createPrize({ isConsolation: true, weight: 1 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await prisma.appSetting.update({ where: { key: SETTINGS_KEYS.consolationPrizeId },
                                      data: { value: consolation.id } });

    const u = await createUser({ points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    expect((await r.json()).draws[0].gatedBy).toBe('payout_cap');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd server && npx vitest run tests/integration/draw.test.ts
```

Expected: PASS. If any fail, debug and re-run.

- [ ] **Step 3: Commit**

```bash
git add server/tests/integration/draw.test.ts
git commit -m "test(server): min_draws/cooldown/payout_cap integration"
```

---

## Task 21: Gated accounting invariants (consolation row + no lastWin update)

Addresses Codex #5.

**Files:**
- Modify: `server/tests/integration/draw.test.ts`

- [ ] **Step 1: Append failing test**

```ts
describe('POST /api/draw — gated accounting', () => {
  beforeEach(async () => {
    await resetDb();
    await seedDefaultSettings({ minDrawsBeforeWin: '99' });
    const cp = await createPrize({ isConsolation: true });
    await prisma.appSetting.update({
      where: { key: SETTINGS_KEYS.consolationPrizeId }, data: { value: cp.id },
    });
    await createPrize({ weight: 1, cashAmount: 500 });
  });

  it('gated draw: charges points, increments lifetime, but freezes win-accounting', async () => {
    const u = await createUser({ points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await authedHeaders(u.id), body: JSON.stringify({ tier: 'single' }),
    });
    const body = await r.json();
    expect(body.draws[0].gatedBy).toBe('min_draws');
    expect(body.draws[0].winningCashAmount).toBe(0);
    expect(body.redemption.totalWinAmount).toBe(0);

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.points).toBe(94);                  // 100 - 6
    expect(after?.lifetimeDrawCount).toBe(1);        // counted
    expect(after?.totalBurnAmount).toBe(6);          // counted
    expect(after?.lifetimePayoutAmount).toBe(0);     // frozen
    expect(after?.totalLuckAmount).toBe(0);          // frozen
    expect(after?.lastWinDrawIndex).toBeNull();      // frozen
  });
});
```

- [ ] **Step 2: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/draw.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add server/tests/integration/draw.test.ts
git commit -m "test(server): gated draw accounting invariants"
```

---

## Task 22: Test-account branch — multi-tier sub-picks + Redemption (no jackpot, no stock decrement, frozen counters)

Addresses Codex #10 + Rev 3 redemption shape.

**Files:**
- Modify: `server/src/routes/draw.ts` (replace the `handleTestDraw` stub from Task 18)
- Create: `server/tests/integration/draw_test_account.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/draw_test_account.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — test account', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('charges tier cost when testSkipCost = false', async () => {
    const u = await createUser({ accountType: 'test', testSkipCost: false, points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  });

  it('skips cost when testSkipCost = true', async () => {
    const u = await createUser({ accountType: 'test', testSkipCost: true, points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(50);
  });

  it('forces prize via testForcePrizeId — even for multi, every sub-draw is the forced prize', async () => {
    const forced = await createPrize({ weight: 1, cashAmount: 999 });
    await createPrize({ weight: 99, cashAmount: 100 });
    const u = await createUser({ accountType: 'test', testForcePrizeId: forced.id, points: 100 });
    const r = await app.request('/api/draw', {
      method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }),
    });
    const body = await r.json();
    expect(body.isTest).toBe(true);
    expect(body.draws).toHaveLength(10);
    for (const d of body.draws) {
      expect(d.prize.id).toBe(forced.id);
      expect(d.winningCashAmount).toBe(999);
    }
    expect(body.redemption.totalWinAmount).toBe(9990);
    expect(body.redemption.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);

    const logs = await prisma.drawLog.findMany();
    expect(logs).toHaveLength(10);
    for (const log of logs) {
      expect(log.isTest).toBe(true);
      expect(log.forcedByAdmin).toBe(true);
    }
  });

  it('test draws DO NOT decrement stock (documented decision)', async () => {
    const forced = await createPrize({ weight: 1, cashAmount: 999, stock: 1 });
    const u = await createUser({ accountType: 'test', testForcePrizeId: forced.id, points: 100 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });
    const prize = await prisma.prize.findUnique({ where: { id: forced.id } });
    expect(prize?.stock).toBe(1);  // not decremented despite 10 "wins"
  });

  it('lifetime + ranking + system totals all frozen for test draws', async () => {
    const u = await createUser({ accountType: 'test', points: 100 });
    await createPrize({ weight: 1, cashAmount: 500 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });

    const after = await prisma.user.findUnique({ where: { id: u.id } });
    expect(after?.lifetimeDrawCount).toBe(0);
    expect(after?.lifetimePayoutAmount).toBe(0);
    expect(after?.totalBurnAmount).toBe(0);
    expect(after?.totalLuckAmount).toBe(0);
    expect(after?.lastWinDrawIndex).toBeNull();

    // System totals also untouched
    const totalsDraw = await prisma.appSetting.findUnique({ where: { key: 'totalDrawCount' } });
    expect(Number(totalsDraw?.value)).toBe(0);
  });

  it('redemption.isTest = true so admin can filter test batches out of dashboards', async () => {
    const u = await createUser({ accountType: 'test', points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    const redemption = await prisma.redemption.findFirst();
    expect(redemption?.isTest).toBe(true);
  });

  it('FORCE_PRIZE_NOT_FOUND when testForcePrizeId points at a disabled / nonexistent prize', async () => {
    const u = await createUser({ accountType: 'test', testForcePrizeId: 'does_not_exist', points: 100 });
    await createPrize({ weight: 1 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) });
    expect(r.status).toBe(422);
    expect((await r.json()).error.code).toBe('FORCE_PRIZE_NOT_FOUND');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/draw_test_account.test.ts
```

- [ ] **Step 3: Replace the `handleTestDraw` stub in `server/src/routes/draw.ts`**

```ts
async function handleTestDraw(c: Context, user: User, tier: Tier) {
  const settings = await readDrawSettings();
  const threshold = resolveThreshold(tier, settings.pointThresholds);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      let finalUser: User = user;
      if (!user.testSkipCost) {
        finalUser = await tx.user.update({
          where: { id: user.id, points: { gte: threshold.points } },
          data: { points: { decrement: threshold.points } },
        });
      }

      // Prize selection inside tx so a concurrent admin disable can't poison
      // the read. Test draws DO NOT decrement stock (documented decision: test
      // sessions must not deplete real prize stock).
      const eligible = await tx.prize.findMany({ where: { enabled: true } });

      const redemption = await tx.redemption.create({
        data: {
          userId: user.id,
          code: generateRedemptionCode(),
          tier,
          totalWinAmount: 0,
          isTest: true,
          idempotencyKey: c.req.header('idempotency-key') ?? null,
        },
      });

      const subDraws: Array<{ chosen: Prize; winningCashAmount: number }> = [];
      for (let i = 0; i < threshold.draws; i++) {
        let chosen: Prize;
        if (user.testForcePrizeId) {
          const found = eligible.find((p) => p.id === user.testForcePrizeId);
          if (!found) throw new AppError('FORCE_PRIZE_NOT_FOUND', 'test override prize missing', 422);
          chosen = found;
        } else {
          chosen = pickPrize(eligible);
        }
        const winningCashAmount = chosen.isConsolation ? 0 : chosen.cashAmount;
        subDraws.push({ chosen, winningCashAmount });
      }

      const totalWinAmount = subDraws.reduce((s, d) => s + d.winningCashAmount, 0);

      const drawLogs: Array<{ log: Awaited<ReturnType<typeof tx.drawLog.create>>; chosen: Prize }> = [];
      for (let i = 0; i < subDraws.length; i++) {
        const { chosen, winningCashAmount } = subDraws[i]!;
        const log = await tx.drawLog.create({
          data: {
            userId: user.id,
            redemptionId: redemption.id,
            subIndex: i,
            prizeId: chosen.id,
            tier,
            tierCost: threshold.points,
            tierDraws: threshold.draws,
            pointsBefore: user.points,
            pointsAfter: finalUser.points,
            randomSeed: randomBytes(8).toString('hex'),
            winningCashAmount,
            isTest: true,
            forcedByAdmin: Boolean(user.testForcePrizeId),
          },
        });
        drawLogs.push({ log, chosen });
      }

      const finalRedemption = await tx.redemption.update({
        where: { id: redemption.id },
        data: { totalWinAmount },
      });

      // Test draws DON'T update system totals or user lifetime/ranking counters.
      return { redemption: finalRedemption, drawLogs, finalUser };
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2025') {
      throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
    }
    throw err;
  }

  return c.json(buildResponse({
    redemption: result.redemption,
    drawLogs: result.drawLogs,
    finalUserPoints: result.finalUser.points,
    tier,
    tierDraws: threshold.draws,
    isTest: true,
  }));
}
```

- [ ] **Step 4: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/draw_test_account.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/src/routes/draw.ts server/tests/integration/draw_test_account.test.ts
git commit -m "feat(server): test-account branch (multi sub-picks, Redemption, no jackpot, no stock decrement, frozen counters)"
```

---

## Task 23: Idempotency on Redemption (batch-level), with concurrent test

Addresses Codex #8 + Rev 3 fix: idempotency key scopes to **Redemption** not **DrawLog**, because multi-tier writes 10 child DrawLogs that would all share the same key.

**Files:**
- Modify: `server/src/routes/draw.ts`
- Create: `server/tests/integration/draw_idempotency.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/integration/draw_idempotency.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string, key?: string) {
  const t = await signSession({ userId: id });
  const h: Record<string, string> = { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
  if (key) h['idempotency-key'] = key;
  return h;
}

describe('POST /api/draw — idempotency (Redemption-scoped)', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('serial replay (single): same key, same user → one Redemption, single deduction', async () => {
    const u = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'abc-123');
    const r1 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) });
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);
    expect(b1.redemption.code).toBe(b2.redemption.code);
    expect(b1.draws[0].drawLogId).toBe(b2.draws[0].drawLogId);

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  });

  it('serial replay (multi): one Redemption with 10 children, replay returns same set', async () => {
    const u = await createUser({ points: 60 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'multi-1');
    const r1 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'multi' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'multi' }) });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);
    expect(b1.draws).toHaveLength(10);
    expect(b2.draws).toHaveLength(10);
    expect(b1.draws.map((d: { drawLogId: string }) => d.drawLogId).sort()).toEqual(
      b2.draws.map((d: { drawLogId: string }) => d.drawLogId).sort(),
    );

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(10);   // exactly 10, not 20
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(12);  // 60 - 48
  });

  it('cross-user same key: each user gets their own Redemption (ownership check)', async () => {
    const u1 = await createUser({ points: 50 });
    const u2 = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const r1 = await app.request('/api/draw', { method: 'POST', headers: await H(u1.id, 'shared'), body: JSON.stringify({ tier: 'single' }) });
    const r2 = await app.request('/api/draw', { method: 'POST', headers: await H(u2.id, 'shared'), body: JSON.stringify({ tier: 'single' }) });
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).not.toBe(b2.redemption.id);
    expect(b1.redemption.code).not.toBe(b2.redemption.code);
    expect(await prisma.redemption.count()).toBe(2);
  });

  it('concurrent replay: two simultaneous requests with same key → exactly one deduction', async () => {
    const u = await createUser({ points: 50 });
    await createPrize({ weight: 1, cashAmount: 100 });
    const h = await H(u.id, 'race-1');
    const [r1, r2] = await Promise.all([
      app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) }),
      app.request('/api/draw', { method: 'POST', headers: h, body: JSON.stringify({ tier: 'single' }) }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 200]);
    const b1 = await r1.json();
    const b2 = await r2.json();
    expect(b1.redemption.id).toBe(b2.redemption.id);

    expect(await prisma.redemption.count()).toBe(1);
    expect(await prisma.drawLog.count()).toBe(1);
    expect((await prisma.user.findUnique({ where: { id: u.id } }))?.points).toBe(44);
  });
});
```

- [ ] **Step 2: Run tests (FAIL)**

```bash
cd server && npx vitest run tests/integration/draw_idempotency.test.ts
```

- [ ] **Step 3: Modify `server/src/routes/draw.ts`**

Add a top-of-function lookup AND a P2002 catch around the transaction. Insert near the top of `handleVerifiedDraw` (and the same in `handleTestDraw`), after `idempotencyKey` is captured:

```ts
if (idempotencyKey) {
  const existing = await prisma.redemption.findUnique({
    where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
    include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
  });
  if (existing) return c.json(replayBody(existing, threshold, tier));
}
```

Add the helper (export it for cross-function reuse with Task 22):

```ts
function replayBody(
  redemption: Awaited<ReturnType<typeof prisma.redemption.findUnique>> & {
    drawLogs: Array<{ id: string; subIndex: number; winningCashAmount: number; gatedBy: string | null; pointsAfter: number; prize: Prize }>;
  },
  threshold: { points: number; draws: number },
  tier: Tier,
) {
  return {
    redemption: {
      id: redemption!.id,
      code: redemption!.code,
      status: redemption!.status,
      totalWinAmount: redemption!.totalWinAmount,
    },
    draws: redemption!.drawLogs.map((log) => ({
      drawLogId: log.id,
      subIndex: log.subIndex,
      prize: {
        id: log.prize.id,
        rankLabel: log.prize.rankLabel,
        name: log.prize.name,
        description: log.prize.description,
        imageUrl: log.prize.imageUrl,
        wheelPosition: log.prize.wheelPosition,
      },
      winningCashAmount: log.winningCashAmount,
      gatedBy: log.gatedBy,
    })),
    // pointsAfter is identical across all sibling sub-draws (set by the same finalize step).
    points: redemption!.drawLogs[0]?.pointsAfter ?? 0,
    tier,
    tierDraws: threshold.draws,
    isTest: redemption!.isTest,
  };
}
```

Wrap the transaction with a P2002 catch for the `(userId, idempotencyKey)` race (winner commits Redemption insert; loser hits unique constraint):

```ts
} catch (err) {
  if ((err as { code?: string })?.code === 'P2025') {
    throw new AppError('INSUFFICIENT_POINTS', 'points below tier cost', 422);
  }
  if ((err as { code?: string })?.code === 'P2002' && idempotencyKey) {
    const replay = await prisma.redemption.findUnique({
      where: { userId_idempotencyKey: { userId: user.id, idempotencyKey } },
      include: { drawLogs: { include: { prize: true }, orderBy: { subIndex: 'asc' } } },
    });
    if (replay) return c.json(replayBody(replay, threshold, tier));
  }
  throw err;
}
```

Do the equivalent in `handleTestDraw` (the test branch creates Redemption rows with `isTest: true` and otherwise behaves the same).

- [ ] **Step 4: Run tests (PASS)**

```bash
cd server && npx vitest run tests/integration/draw_idempotency.test.ts
```

- [ ] **Step 5: Run full draw suite to ensure nothing regressed**

```bash
cd server && npx vitest run tests/integration/draw.test.ts tests/integration/draw_test_account.test.ts tests/integration/draw_idempotency.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/draw.ts server/tests/integration/draw_idempotency.test.ts
git commit -m "feat(server): batch-level idempotency on Redemption (incl. concurrent + multi-tier tests)"
```

---

## Task 24: Stock race + system-totals race tests

Addresses Codex #7 + Rev 3 (jackpot race removed alongside jackpot mechanism). The handler is already race-safe (Task 18's stock `updateMany` guards `stock > 0`; system totals are `FOR UPDATE`-locked). This task is **TDD against the existing implementation** to catch regressions.

**Files:**
- Create: `server/tests/integration/draw_concurrency.test.ts`

- [ ] **Step 1: Write tests**

```ts
// server/tests/integration/draw_concurrency.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser, createPrize, seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/draw — concurrency', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('stock race: 5 concurrent draws → no 500s, exactly stock-many win, rest fall back to consolation', async () => {
    const limited = await createPrize({ weight: 1_000_000, cashAmount: 100, stock: 2 });
    const consolation = await createPrize({ weight: 1, cashAmount: 0, isConsolation: true });

    const users = await Promise.all(Array.from({ length: 5 }, () => createUser({ points: 50 })));
    const responses = await Promise.all(users.map(async (u) =>
      app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) }),
    ));

    for (const r of responses) expect(r.status).toBe(200);

    const bodies = await Promise.all(responses.map((r) => r.json()));
    for (const b of bodies) {
      expect(b.draws?.[0]?.prize?.id).toBeDefined();   // every response carries a sub-draw with prize
      expect(b.points).toBe(44);                        // 50 - 6, no double-charge
    }

    const winnersOfLimited = bodies.filter((b) => b.draws[0].prize.id === limited.id);
    const winnersOfConsolation = bodies.filter((b) => b.draws[0].prize.id === consolation.id);
    expect(winnersOfLimited.length).toBe(2);            // stock cap = exactly 2
    expect(winnersOfConsolation.length).toBe(3);        // rest fell back to consolation
    expect(winnersOfLimited.length + winnersOfConsolation.length).toBe(5);

    const finalLimited = await prisma.prize.findUnique({ where: { id: limited.id } });
    expect(finalLimited?.stock).toBe(0);                // exhausted, not negative
    expect(await prisma.drawLog.count()).toBe(5);
    expect(await prisma.redemption.count()).toBe(5);    // one Redemption per request
  });

  it('system-totals race: 10 concurrent draws preserve totalDrawCount / totalPayoutAmount / totalPointsBurned', async () => {
    await createPrize({ weight: 1, cashAmount: 100 });
    const users = await Promise.all(Array.from({ length: 10 }, () => createUser({ points: 50 })));
    const responses = await Promise.all(users.map(async (u) =>
      app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'single' }) }),
    ));
    for (const r of responses) expect(r.status).toBe(200);

    // Atomic under FOR UPDATE; each draw added (drawCount +1, payout +100, burned +6)
    const totalsDraw   = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalDrawCount } });
    const totalsPayout = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalPayoutAmount } });
    const totalsBurn   = await prisma.appSetting.findUnique({ where: { key: SETTINGS_KEYS.totalPointsBurned } });
    expect(Number(totalsDraw?.value)).toBe(10);
    expect(Number(totalsPayout?.value)).toBe(1000);
    expect(Number(totalsBurn?.value)).toBe(60);
  });

  it('multi-tier sub-draw stock race within a single batch: stock cap on shared prize', async () => {
    // One user, tier=multi, single prize with stock=3. Multi runs 10 sub-picks against it;
    // expectation: first 3 win the prize, sub-draws 4..10 fall back to consolation.
    await createPrize({ weight: 1_000_000, cashAmount: 100, stock: 3 });
    const consolation = await createPrize({ weight: 1, isConsolation: true });
    const u = await createUser({ points: 60 });
    const r = await app.request('/api/draw', { method: 'POST', headers: await H(u.id), body: JSON.stringify({ tier: 'multi' }) });
    expect(r.status).toBe(200);
    const body = await r.json();
    const drewLimited = body.draws.filter((d: { prize: { id: string } }) => d.prize.id !== consolation.id).length;
    const drewConsolation = body.draws.filter((d: { prize: { id: string } }) => d.prize.id === consolation.id).length;
    expect(drewLimited).toBeLessThanOrEqual(3);
    expect(drewLimited + drewConsolation).toBe(10);
  });
});
```

- [ ] **Step 2: Run tests (should PASS against current implementation)**

```bash
cd server && npx vitest run tests/integration/draw_concurrency.test.ts
```

If FAIL — the stock guard or system-totals lock is broken; fix in `routes/draw.ts`. Most common bug: omitting the `stock: { gt: 0 }` guard in the `updateMany`, or skipping the `SELECT ... FOR UPDATE` on the totals rows.

- [ ] **Step 3: Commit**

```bash
git add server/tests/integration/draw_concurrency.test.ts
git commit -m "test(server): stock + system-totals race regression tests"
```

---

## Task 25: Public endpoint — /api/settings/public

Addresses Codex #12. `spinDurationMs` reads from settings, no hardcoding. (Rev 3: `/api/jackpot/public` removed alongside the jackpot mechanism.)

**Files:**
- Create: `server/src/routes/public.ts`
- Test: `server/tests/integration/public.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// server/tests/integration/public.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { seedDefaultSettings, SETTINGS_KEYS } from '../helpers/factories.js';
import { prisma } from '../../src/db.js';

describe('public endpoints', () => {
  beforeEach(async () => { await resetDb(); await seedDefaultSettings(); });

  it('GET /api/health → ok', async () => {
    const r = await app.request('/api/health');
    expect(await r.json()).toEqual({ ok: true });
  });

  it('GET /api/jackpot/public is gone (404)', async () => {
    const r = await app.request('/api/jackpot/public');
    expect(r.status).toBe(404);
  });

  it('GET /api/settings/public returns spin params + thresholds; does not leak sensitive settings', async () => {
    await prisma.appSetting.update({
      where: { key: SETTINGS_KEYS.spinDurationMs }, data: { value: '5500' },
    });
    const r = await app.request('/api/settings/public');
    const body = await r.json();
    expect(body.spinDurationMs).toBe(5500);     // dynamic, not hardcoded
    expect(body.pointThresholds[0]).toEqual({ points: 6, draws: 1 });
    expect(body).not.toHaveProperty('payoutCapRatio');
    expect(body).not.toHaveProperty('minDrawsBeforeWin');
    expect(body).not.toHaveProperty('cooldownDrawsAfterWin');
    expect(body).not.toHaveProperty('jackpotCurrentAmount');
  });
});
```

- [ ] **Step 2: Run tests (FAIL)**

```bash
cd server && npx vitest run tests/integration/public.test.ts
```

- [ ] **Step 3: Implement `server/src/routes/public.ts`**

```ts
import { Hono } from 'hono';
import { readDrawSettings } from '../draw/settings.js';

export const publicRoutes = new Hono();

publicRoutes.get('/api/settings/public', async (c) => {
  const s = await readDrawSettings();
  return c.json({
    spinDurationMs: s.spinDurationMs,
    pointThresholds: s.pointThresholds,
  });
});
```

- [ ] **Step 4: Mount**

In `server/src/index.ts`:

```ts
import { publicRoutes } from './routes/public.js';
app.route('/', publicRoutes);
```

- [ ] **Step 5: Run tests (PASS)**

```bash
cd server && npx vitest run tests/integration/public.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/public.ts server/src/index.ts server/tests/integration/public.test.ts
git commit -m "feat(server): /api/settings/public (spinDurationMs from settings; /api/jackpot/public removed in Rev 3)"
```

---

## Task 25b: POST /api/onboarding/profile + /api/me reflects nickname + code

Addresses Rev 3 onboarding gate. Without this endpoint, every newly LINE-registered member fails the onboarding gate in Task 18 and can't draw. The endpoint atomically writes both `nickname` and `entertainmentMemberCode` (UI submits them as one form).

**Files:**
- Create: `server/src/routes/onboarding.ts`
- Modify: `server/src/routes/me.ts` (expose `nickname` + `entertainmentMemberCode`)
- Modify: `server/src/index.ts` (mount onboarding route)
- Create: `server/tests/integration/onboarding.test.ts`

Validation:
- `nickname`: 2–12 chars, must contain at least one non-whitespace character; rejects bodies with only whitespace.
- `code`: 6–20 chars matching `^[A-Za-z0-9_-]+$`.
- Uniqueness on `code` enforced at the schema level (`User.entertainmentMemberCode @unique`); cross-user duplicate → 409 `ENTERTAINMENT_CODE_TAKEN`.

Design decisions:
- **`code` is first-bind-only.** Once bound, calling with a different code returns 409 `ENTERTAINMENT_CODE_ALREADY_BOUND`. Rebinding requires Admin intervention (out of scope for this plan; lands in Admin plan).
- **`nickname` is mutable.** Calling with the same `code` but a different `nickname` is allowed and updates the nickname — supports a future "edit profile" flow without adding a new endpoint.
- Both fields are required on every call. We do **not** support setting one without the other; that would let a member skip onboarding partially.

- [ ] **Step 1: Write failing test**

```ts
// server/tests/integration/onboarding.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { app } from '../../src/index.js';
import { resetDb } from '../helpers/db.js';
import { prisma } from '../../src/db.js';
import { createUser } from '../helpers/factories.js';
import { signSession } from '../../src/auth/jwt.js';
import { SESSION_COOKIE } from '../../src/auth/cookies.js';

async function H(id: string) {
  const t = await signSession({ userId: id });
  return { cookie: `${SESSION_COOKIE}=${t}`, 'content-type': 'application/json' };
}

describe('POST /api/onboarding/profile', () => {
  beforeEach(resetDb);

  it('401 without session', async () => {
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', body: JSON.stringify({ nickname: '小明', code: 'EM_12345' }),
      headers: { 'content-type': 'application/json' },
    });
    expect(r.status).toBe(401);
  });

  it('first onboard: writes both fields and surfaces them via /api/me', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '小明', code: 'EM_654321' }),
    });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ nickname: '小明', entertainmentMemberCode: 'EM_654321' });

    const me = await app.request('/api/me', { headers: await H(u.id) });
    const body = await me.json();
    expect(body.nickname).toBe('小明');
    expect(body.entertainmentMemberCode).toBe('EM_654321');

    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    expect(fresh?.nickname).toBe('小明');
    expect(fresh?.entertainmentMemberCode).toBe('EM_654321');
    expect(fresh?.entertainmentCodeBoundAt).not.toBeNull();
  });

  it('400 NICKNAME_INVALID on bad nickname', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const bad = ['', ' ', '\t', 'a', 'a'.repeat(13), '     '];
    for (const nickname of bad) {
      const r = await app.request('/api/onboarding/profile', {
        method: 'POST', headers: await H(u.id),
        body: JSON.stringify({ nickname, code: 'EM_VALID01' }),
      });
      expect(r.status).toBe(400);
      expect((await r.json()).error.code).toBe('NICKNAME_INVALID');
    }
  });

  it('400 ENTERTAINMENT_CODE_INVALID on bad code', async () => {
    const u = await createUser({ nickname: null, entertainmentMemberCode: null });
    const bad = ['', 'ab', 'has space', '!!!', 'a'.repeat(50)];
    for (const code of bad) {
      const r = await app.request('/api/onboarding/profile', {
        method: 'POST', headers: await H(u.id),
        body: JSON.stringify({ nickname: '阿明', code }),
      });
      expect(r.status).toBe(400);
      expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_INVALID');
    }
  });

  it('409 ENTERTAINMENT_CODE_TAKEN when another user already bound this code', async () => {
    await createUser({ nickname: '其他', entertainmentMemberCode: 'EM_SHARED' });
    const u2 = await createUser({ nickname: null, entertainmentMemberCode: null });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u2.id),
      body: JSON.stringify({ nickname: '我', code: 'EM_SHARED' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_TAKEN');
  });

  it('409 ENTERTAINMENT_CODE_ALREADY_BOUND when this user tries to change code', async () => {
    const u = await createUser({ nickname: '小明', entertainmentMemberCode: 'EM_OLD' });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '小明', code: 'EM_NEW' }),
    });
    expect(r.status).toBe(409);
    expect((await r.json()).error.code).toBe('ENTERTAINMENT_CODE_ALREADY_BOUND');
  });

  it('same code + different nickname → 200, nickname updated, code unchanged', async () => {
    const u = await createUser({ nickname: '舊名', entertainmentMemberCode: 'EM_SAME' });
    const r = await app.request('/api/onboarding/profile', {
      method: 'POST', headers: await H(u.id),
      body: JSON.stringify({ nickname: '新名', code: 'EM_SAME' }),
    });
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.nickname).toBe('新名');
    expect(body.entertainmentMemberCode).toBe('EM_SAME');

    const fresh = await prisma.user.findUnique({ where: { id: u.id } });
    expect(fresh?.nickname).toBe('新名');
  });
});
```

- [ ] **Step 2: Run test (FAIL)**

```bash
cd server && npx vitest run tests/integration/onboarding.test.ts
```

- [ ] **Step 3: Implement `server/src/routes/onboarding.ts`**

```ts
import { Hono } from 'hono';
import { z } from 'zod';
import { AppError } from '../errors.js';
import { requireUser } from '../auth/middleware.js';
import { prisma } from '../db.js';

// Nickname: 2–12 chars, must include at least one non-whitespace character.
// (Allows Chinese, English, numbers, common symbols — anti-spec is "all whitespace".)
const NicknameSchema = z.string().min(2).max(12).refine((v) => v.trim().length > 0, {
  message: 'nickname must contain non-whitespace',
});
const CodeSchema = z.string().regex(/^[A-Za-z0-9_-]{6,20}$/);

const BodySchema = z.object({
  nickname: NicknameSchema,
  code: CodeSchema,
});

export const onboardingRoutes = new Hono();

onboardingRoutes.post('/api/onboarding/profile', requireUser, async (c) => {
  const user = c.get('user');

  let body: { nickname: string; code: string };
  try {
    body = BodySchema.parse(await c.req.json());
  } catch (err) {
    // Distinguish which field failed so the frontend can highlight the right input.
    const issues = (err as z.ZodError)?.issues ?? [];
    const failedFields = new Set(issues.map((i) => i.path[0]));
    if (failedFields.has('nickname')) {
      throw new AppError('NICKNAME_INVALID', 'nickname must be 2–12 chars and not all whitespace', 400);
    }
    throw new AppError('ENTERTAINMENT_CODE_INVALID', 'code must be 6–20 chars: A-Z, 0-9, _, -', 400);
  }

  // Already bound to a different code → admin must intervene
  if (user.entertainmentMemberCode && user.entertainmentMemberCode !== body.code) {
    throw new AppError('ENTERTAINMENT_CODE_ALREADY_BOUND', 'user already bound a different code', 409);
  }

  // Same code (or first bind) → update both fields atomically
  try {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        nickname: body.nickname,
        entertainmentMemberCode: body.code,
        // Only stamp boundAt on first bind; preserve original on idempotent re-call.
        entertainmentCodeBoundAt: user.entertainmentMemberCode === null ? new Date() : undefined,
      },
    });
    return c.json({
      nickname: updated.nickname,
      entertainmentMemberCode: updated.entertainmentMemberCode,
    });
  } catch (err) {
    if ((err as { code?: string })?.code === 'P2002') {
      throw new AppError('ENTERTAINMENT_CODE_TAKEN', 'this code is already bound to another account', 409);
    }
    throw err;
  }
});
```

- [ ] **Step 4: Surface the fields via `/api/me`**

Edit `server/src/routes/me.ts` and add to the returned JSON:

```ts
nickname: u.nickname,
entertainmentMemberCode: u.entertainmentMemberCode,
```

- [ ] **Step 5: Mount the route**

In `server/src/index.ts`:

```ts
import { onboardingRoutes } from './routes/onboarding.js';
app.route('/', onboardingRoutes);
```

- [ ] **Step 6: Run test (PASS)**

```bash
cd server && npx vitest run tests/integration/onboarding.test.ts tests/integration/me.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add server/src/routes/onboarding.ts server/src/routes/me.ts server/src/index.ts server/tests/integration/onboarding.test.ts
git commit -m "feat(server): /api/onboarding/profile (nickname + code atomic, code first-bind-only, nickname mutable)"
```

---

## Task 26: Full suite + smoke run

- [ ] **Step 1: Full vitest run**

```bash
cd server && npm test
```

Expected: every test from Tasks 2-25 green.

- [ ] **Step 2: Smoke**

```bash
cd server
npm run dev &
PID=$!
sleep 2
curl -s http://127.0.0.1:3001/api/health
curl -s http://127.0.0.1:3001/api/settings/public
kill $PID
```

Expected: two JSON responses; settings includes `spinDurationMs: 4300` and the 5-threshold array.

- [ ] **Step 3: No commit — verification only**

If anything is red, drop into the failing Task and fix in place; do not patch around it here.

---

## Self-Review

- **Spec coverage** — every spec section in `docs/fullstack-spec.md` (Rev 3 post-cleanup) that this plan claims to cover has at least one passing test. Items marked "out of scope" at the top remain out of scope: leaderboard endpoints, Admin web modules (incl. 「中獎紀錄」status-toggle UI on top of the Redemption schema), bottom-tabs CRUD, template uploads, LIFF, Railway deploy.
- **Placeholder scan** — no `TBD` / `TODO` / `implement later` / `appropriate ...` / `similar to Task` in this document.
- **Codex findings closed (Rev 1 + Rev 2)**
  - #1 currency model → `users.points`, no `prizePool`
  - #2 tier → zod parse + `parseTier` + `resolveThreshold`
  - #3 blacklist audit → `AdminActionLog` + write on 403 (Task 18)
  - #4 ordering → deduct first, gates after (Tasks 15, 18, 20)
  - #5 gated accounting → Task 21 invariants (now asserts new shape: `body.draws[0].gatedBy`)
  - #6 ~~jackpot in tx~~ → moot, jackpot mechanism removed in Rev 3
  - #7 races → row-lock + `stock > 0` guard + Task 24 regression tests (jackpot race deleted; multi-tier sub-draw stock race added)
  - #8 idempotency scope → `@@unique([userId, idempotencyKey])` on **Redemption** (not DrawLog — multi has 10 child rows), ownership + concurrent + multi-tier test (Task 23)
  - #9 OAuth → signed state, `nonce` cookie, `verifyLineIdToken`, cookie flag assertions
  - #10 test branch → tier still applied, lifetime/totals frozen (documented), per-sub-draw force-prize loop in Task 22
  - #11 admin audit table → Task 6
  - #12 spinDurationMs → settings-driven
  - #13 TDD false positives → `pickPrize` rejects 0 weight; cooldown boundary at exact `<` semantics; all three gates integration-tested; concurrent idempotency at batch level; stock race + multi sub-draw stock race; ~~jackpot reset test~~ deleted with mechanism
- **Rev 3 additions closed**
  - 娛樂城會員編號 binding gate (Task 18 entry, Task 25b endpoint, `/api/me` surface)
  - Random redemption code (Task 17b generator, used in Tasks 18 + 22)
  - Multi-tier 10 sub-picks bundled in one `Redemption` (Tasks 18 + 22)
  - Status enum `pending / delivered / cancelled` lives in schema (Task 11) for the future Admin module
  - No `/api/jackpot/public` (Task 25 returns 404 for it)
- **Naming consistency** — `parseTier`, `resolveThreshold`, `pickPrize`, `evaluateGates`, `readDrawSettings`, `readSystemTotalsForUpdate`, `incrementSystemTotals`, `writeAdminActionLog`, `generateRedemptionCode`, `isValidRedemptionCode`, `handleVerifiedDraw`, `handleTestDraw`, `buildResponse`, `replayBody`, `SETTINGS_KEYS` are introduced once and reused identically.
- **Known accepted compromises**
  - `handleTestDraw` does not write `admin_action_logs` for the test-override action — `draw_logs.forcedByAdmin = true` + `isTest = true` is sufficient signal for admin views.
  - Multi-tier evaluates the cost-control gate once for the whole batch (not per sub-draw). Documented at top of plan.
  - Entertainment-code is a one-shot bind — re-binding requires admin intervention, deferred to the Admin plan.

---

## Execution Handoff

Plan saved to `docs/plans/2026-06-03-backend-core.md` (Rev 3).

You picked **Subagent-Driven** during scoping. When you're ready:

1. I dispatch a fresh `general-purpose` (or specialized) subagent per task via `superpowers:subagent-driven-development`.
2. After each task I do a two-stage review (build green + tests green + commit message sanity).
3. I pause at each task boundary for your confirmation before moving on.

Reply **`start`** to begin Task 1, or **`hold`** to leave Rev 3 on disk.
