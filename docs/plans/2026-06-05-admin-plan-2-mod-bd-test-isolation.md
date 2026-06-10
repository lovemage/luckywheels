# Admin Plan 2 (Module B + D) + Test DB Isolation

> **Execution:** Subagent-driven for non-trivial tasks, inline for small surgical edits.

**Goal:** Three operationally-critical pieces:
1. **Admin Module B** — Prize and AppSetting CRUD so the operator can change game rules from the dashboard without `tsx` scripts.
2. **Admin Module D (image upload only)** — file upload backed by Railway Bucket (S3-compatible) so Prize images and future banners can be managed without redeploys.
3. **Test DB isolation** — stop pointing vitest at production Postgres.

**Tech additions:** `@aws-sdk/client-s3` (for Railway Bucket), `@aws-sdk/s3-request-presigner` (for direct-upload signed URLs if used).

**Out of scope here (deferred):**
- Module C (bottom-tabs CRUD)
- Module D phase 2 (template gallery, drag-reorder, bulk delete)
- Image cropping / resizing
- Multi-bucket / multi-tenant
- Module B: leaderboard editor (separate `leaderboard_overrides` editor)

---

## Pre-flight requirements for the operator

Before this plan can deploy, **add these 4 Railway env-var references on the `luckywheels` service** (you said `BUCKET` is already linked). On the Railway dashboard for the service → Variables → Add Reference, point each at the corresponding variable on your **Bucket service**:

```
ACCESS_KEY_ID       = ${{ Bucket.ACCESS_KEY_ID }}
SECRET_ACCESS_KEY   = ${{ Bucket.SECRET_ACCESS_KEY }}
ENDPOINT            = ${{ Bucket.ENDPOINT }}            # https://storage.railway.app
REGION              = ${{ Bucket.REGION }}              # auto
```

(Names assume the bucket service is named `Bucket`. Replace `${{ Bucket.X }}` with the actual service name if different — `railway service <name>` to check.)

`BUCKET`, `ENDPOINT`, `REGION` are non-secret; `ACCESS_KEY_ID` + `SECRET_ACCESS_KEY` are secrets. All 5 will be read by the file-storage helper in Task D.1.

---

## File map (new + modified)

```
server/
  package.json                            # + @aws-sdk/client-s3, @aws-sdk/s3-request-presigner
  src/
    env.ts                                # + 5 bucket vars (optional in dev, required in prod)
    admin/routes/
      prizes.ts                 NEW       # CRUD: list, create, update, delete, reorder
      settings.ts               NEW       # AppSetting edit (pointThresholds, spinDurationMs, gates)
      uploads.ts                NEW       # POST /api/admin/uploads (multipart → bucket)
    storage/
      bucket.ts                 NEW       # S3Client wrapper, putObject, deleteObject, presign GET
  tests/
    integration/admin/
      prizes_crud.test.ts       NEW
      settings_edit.test.ts     NEW
      uploads.test.ts           NEW       # uses mocked S3 client (no real bucket in CI)
    helpers/
      s3-mock.ts                NEW       # in-memory S3 stub for tests
  scripts/
    create-test-db.ts           NEW       # one-off: provision separate test Postgres OR document local docker-compose path
  vitest.config.ts              MODIFY    # support TEST_DATABASE_URL override
  tests/setup.ts                MODIFY    # set TEST_DATABASE_URL into DATABASE_URL when running tests
  admin-ui/
    src/
      api/
        prizes.ts               NEW
        settings.ts             NEW
        uploads.ts              NEW
      routes/
        Prizes.tsx              NEW       # list + create + edit + delete + reorder
        Settings.tsx            NEW       # AppSetting form
      components/
        ImageUploadInput.tsx    NEW       # file input → upload → returns URL
      App.tsx                   MODIFY    # add /prizes, /settings routes
      components/AppShell.tsx   MODIFY    # add sidebar links
```

---

## Task T (Test DB Isolation) — do this FIRST

Until tests stop writing to production Postgres, any change risks data loss. This is a small, surgical task.

**Files:**
- Modify: `server/tests/setup.ts`
- Modify: `server/.env.example` (document TEST_DATABASE_URL)
- Modify: `server/README` if exists; otherwise note in `CLAUDE.md`

### Step 1: Add separate test DB env var support

`tests/setup.ts` already pre-loads `.env`. Extend it to override `DATABASE_URL` with `TEST_DATABASE_URL` (if defined) **before** prisma client init:

```ts
// in tests/setup.ts, after the existing .env loader, before the defaults loop:
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
```

### Step 2: Document the workflow

Add to `server/.env.example`:
```
# Tests must NOT run against the production / dev Railway DB.
# Set TEST_DATABASE_URL to a separate Postgres (a local docker-compose
# postgres or a dedicated Railway DB) before running `npm test`.
# TEST_DATABASE_URL=postgresql://lucky:lucky@127.0.0.1:5433/luckywheels_test
```

### Step 3: Make .env load TEST_DATABASE_URL by default

Add `TEST_DATABASE_URL` to `server/.env` (local-only, gitignored) so contributors immediately point at a safe DB.

### Step 4: Loud warning if both equal

```ts
if (
  process.env.DATABASE_URL &&
  process.env.TEST_DATABASE_URL &&
  process.env.DATABASE_URL === process.env.TEST_DATABASE_URL
) {
  console.warn('⚠ TEST_DATABASE_URL equals DATABASE_URL — tests will mutate production data');
}
```

### Step 5: Smoke run

```bash
cd server && TEST_DATABASE_URL=postgresql://... npx vitest run tests/integration/_db_helper.test.ts
```

Confirm it hits the test DB (not production). Verify prizes / users on production are untouched.

### Step 6: Commit
```bash
git add server/tests/setup.ts server/.env.example
git commit -m "test(server): isolate vitest DB via TEST_DATABASE_URL override"
```

---

## Task B.1 — Backend: Prize CRUD

Six endpoints: list, get, create, update, delete, reorder.

**Files:**
- Create: `server/src/admin/routes/prizes.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/prizes_crud.test.ts`

### Endpoints

```
GET    /api/admin/prizes                  list all (including disabled)
GET    /api/admin/prizes/:id              detail
POST   /api/admin/prizes                  create
PATCH  /api/admin/prizes/:id              update (any subset of fields)
DELETE /api/admin/prizes/:id              delete (refuses if any DrawLog references it; suggest "disable" instead)
PATCH  /api/admin/prizes/reorder          body: { ids: [...] } → updates wheelPosition by array order
```

### Create body (zod)
```ts
const CreateBody = z.object({
  rankLabel: z.string().min(1).max(20),
  name: z.string().min(1).max(40),
  description: z.string().max(200).nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  cashAmount: z.number().int().min(0),
  weight: z.number().int().min(0),
  stock: z.number().int().min(0),
  segmentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isConsolation: z.boolean().optional(),
  enabled: z.boolean().optional(),
});
```

### Update behavior
- `isConsolation = true` flip: also writes the prize id to `app_settings.consolationPrizeId`. Only ONE prize may be `isConsolation = true` at a time — endpoint clears the flag on any other prize first, in the same transaction.
- `enabled = false`: no FK problem; just hides from `/api/prizes/public` and from `pickPrize`.
- `wheelPosition`: per-prize update allowed; reorder endpoint is just the convenience.

### Delete behavior
- Refuse with `PRIZE_HAS_DRAW_LOGS` 422 if any `DrawLog.prizeId = id`. The operator must "disable" instead.

### Audit
Every mutation writes an `AdminActionLog` row with event `prize.created`, `prize.updated`, `prize.deleted`, `prize.reordered` and full payloadBefore/After.

### Tests (10)
- 401 without session
- list returns 0 then 1 then N
- create + payloadAfter audit row
- update only specified fields (partial PATCH semantics)
- delete refused when DrawLog references prize → 422 + still in DB
- delete succeeds when no DrawLog
- isConsolation: setting it on prize A flips off the old consolation prize and writes consolationPrizeId
- reorder updates wheelPosition by array order; audit logs `prize.reordered` with the id list
- validation: invalid hex color → 400
- validation: negative cashAmount → 400

Commit: `feat(admin): Prize CRUD endpoints + reorder`

---

## Task B.2 — Backend: AppSetting edit

The four user-editable settings:
- `pointThresholds` — JSON array
- `spinDurationMs` — number
- `minDrawsBeforeWin` — number
- `cooldownDrawsAfterWin` — number
- `payoutCapEnabled` — boolean
- `payoutCapRatio` — number 0..1

Other settings (`totalDrawCount`, `consolationPrizeId`, etc.) are system-maintained — read-only via API.

**Files:**
- Create: `server/src/admin/routes/settings.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/settings_edit.test.ts`

### Endpoints

```
GET   /api/admin/settings                  current values of the 6 editable settings + 3 system totals
PATCH /api/admin/settings                  body: { pointThresholds?, spinDurationMs?, ... }
```

### PATCH body (zod)

```ts
const SettingsBody = z.object({
  pointThresholds: z.array(z.object({
    points: z.number().int().min(1),
    draws: z.number().int().min(1),
  })).min(1).max(10).optional(),
  spinDurationMs: z.number().int().min(500).max(20000).optional(),
  minDrawsBeforeWin: z.number().int().min(0).max(100).optional(),
  cooldownDrawsAfterWin: z.number().int().min(0).max(100).optional(),
  payoutCapEnabled: z.boolean().optional(),
  payoutCapRatio: z.number().min(0).max(1).optional(),
});
```

### Validation rules

- `pointThresholds`: must be sorted by `points` ascending; `draws` must also be ascending; first threshold's draws must be >= 1; last threshold's draws must be <= 10 (single tier max = 1, multi max = 10).
- All other settings: simple range checks per zod.

### Audit
Each PATCH writes `app_settings.update` with payloadBefore + payloadAfter showing exactly which keys changed.

### Tests (6)
- GET returns the 6 editable settings
- PATCH partial: updating only `spinDurationMs` doesn't change others
- PATCH pointThresholds: persisted + readable via `/api/settings/public`
- PATCH pointThresholds invalid (out-of-order) → 400 `POINT_THRESHOLDS_INVALID`
- PATCH payoutCapRatio > 1 → 400
- PATCH writes audit with the right keys

Commit: `feat(admin): AppSetting edit (game rules + spin params + gates)`

---

## Task D.1 — Backend: File storage helper + Bucket env wiring

Wraps the S3 SDK around Railway Bucket. Reads env vars; exposes `put(key, body, contentType)`, `delete(key)`, `publicUrl(key)`.

**Files:**
- Modify: `server/package.json` — add `@aws-sdk/client-s3`
- Modify: `server/src/env.ts` — add 5 bucket vars (optional in dev)
- Create: `server/src/storage/bucket.ts`
- Test: `server/tests/unit/storage/bucket.test.ts`

### env.ts additions

```ts
BUCKET: z.string().optional(),
ACCESS_KEY_ID: z.string().optional(),
SECRET_ACCESS_KEY: z.string().optional(),
ENDPOINT: z.string().url().optional(),
REGION: z.string().optional(),
```

Optional so dev works without bucket. Production: the runtime check throws `BUCKET_NOT_CONFIGURED` when an upload is attempted.

### `bucket.ts`

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../env.js';
import { AppError } from '../errors.js';

let client: S3Client | null = null;

function getClient(): S3Client {
  if (client) return client;
  if (!env.BUCKET || !env.ACCESS_KEY_ID || !env.SECRET_ACCESS_KEY || !env.ENDPOINT) {
    throw new AppError('BUCKET_NOT_CONFIGURED', 'set BUCKET / ACCESS_KEY_ID / SECRET_ACCESS_KEY / ENDPOINT', 500);
  }
  client = new S3Client({
    endpoint: env.ENDPOINT,
    region: env.REGION ?? 'auto',
    credentials: {
      accessKeyId: env.ACCESS_KEY_ID,
      secretAccessKey: env.SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  });
  return client;
}

export interface UploadInput {
  key: string;
  body: Uint8Array | Buffer | Blob;
  contentType: string;
}

export async function putObject(input: UploadInput): Promise<{ key: string; url: string }> {
  const c = getClient();
  await c.send(new PutObjectCommand({
    Bucket: env.BUCKET!,
    Key: input.key,
    Body: input.body as any,
    ContentType: input.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { key: input.key, url: publicUrl(input.key) };
}

export async function deleteObject(key: string): Promise<void> {
  const c = getClient();
  await c.send(new DeleteObjectCommand({ Bucket: env.BUCKET!, Key: key }));
}

export function publicUrl(key: string): string {
  if (!env.ENDPOINT || !env.BUCKET) {
    throw new AppError('BUCKET_NOT_CONFIGURED', 'cannot compute URL', 500);
  }
  return `${env.ENDPOINT.replace(/\/$/, '')}/${env.BUCKET}/${key}`;
}
```

### Unit tests
- `publicUrl` joins endpoint + bucket + key correctly (no double slashes)
- `getClient` throws `BUCKET_NOT_CONFIGURED` when env is empty

Commit: `feat(server): Railway Bucket storage helper (S3-compatible)`

---

## Task D.2 — Backend: Upload endpoint

Single endpoint that accepts multipart form-data, validates image, uploads to bucket, returns URL.

**Files:**
- Create: `server/src/admin/routes/uploads.ts`
- Modify: `server/src/index.ts` (mount)
- Test: `server/tests/integration/admin/uploads.test.ts`

### Endpoint

```
POST /api/admin/uploads
  multipart/form-data: { file: <image> }
  → { url: "https://storage.railway.app/...", key: "..." }
```

### Constraints
- Allowed mime types: `image/png`, `image/jpeg`, `image/webp`, `image/gif`
- Max size: 5 MB (`UPLOAD_TOO_LARGE` 413)
- Key format: `prize-images/{cuid()}.{ext}` so each upload is unique and bounded to a logical folder

### Audit
Writes `admin.upload` with payloadAfter `{ key, url, sizeBytes, contentType }`.

### Tests (5)
- 401 without session
- valid PNG → 200 + URL stored (test uses a mocked s3 stub that records putObject calls)
- mime type not in allow-list → 415 `UPLOAD_MIME_REJECTED`
- > 5MB → 413 `UPLOAD_TOO_LARGE`
- audit log written

Commit: `feat(admin): POST /api/admin/uploads (image to Railway Bucket)`

---

## Task B.3 — Frontend: Prize CRUD UI

`/admin/prizes` route. List with reorder handles, "新增獎品" button, click row → edit modal.

**Files:**
- Create: `server/admin-ui/src/api/prizes.ts`
- Create: `server/admin-ui/src/routes/Prizes.tsx`
- Modify: `server/admin-ui/src/App.tsx` (route)
- Modify: `server/admin-ui/src/components/AppShell.tsx` (sidebar link)
- Test: `server/admin-ui/tests/unit/Prizes.test.tsx`

### Behavior
- Table columns: 拖曳柄 / 排名 / 名稱 / cash / weight / stock / 顏色 / 啟用 / 動作
- Reorder: drag rows, on drop POST `/api/admin/prizes/reorder`
- Edit modal: fields for all CreateBody zod fields + image picker (Task D.3)
- New prize button → same modal in "create" mode
- Delete: confirmation modal; shows error if 422 PRIZE_HAS_DRAW_LOGS with suggestion to "改為停用"

### Tests
- Renders rows from mocked fetch
- Click 新增 opens modal with empty form

Commit: `feat(admin): Prize CRUD page (table + drag-reorder + modal)`

---

## Task B.4 — Frontend: AppSetting form

`/admin/settings` route. Simple form for the 6 editable settings.

**Files:**
- Create: `server/admin-ui/src/api/settings.ts`
- Create: `server/admin-ui/src/routes/Settings.tsx`
- Modify: `server/admin-ui/src/App.tsx`
- Modify: `server/admin-ui/src/components/AppShell.tsx`

### Behavior
- pointThresholds: list editor with +/- rows; default shows 5 rows
- spinDurationMs: number input (500..20000)
- gates: number inputs + payoutCapEnabled checkbox + payoutCapRatio slider 0..1
- Save button → PATCH
- Show validation errors inline

Commit: `feat(admin): AppSetting edit page`

---

## Task D.3 — Frontend: ImageUploadInput component

Reusable file picker that posts to `/api/admin/uploads` and returns the URL. Used by Prize edit modal.

**Files:**
- Create: `server/admin-ui/src/api/uploads.ts`
- Create: `server/admin-ui/src/components/ImageUploadInput.tsx`
- Test: `server/admin-ui/tests/unit/ImageUploadInput.test.tsx`

### Behavior
- File picker; on select, posts multipart to backend; shows preview while uploading; sets onChange(url) when done
- Shows current image if `value` prop is set; "移除" button clears it
- Errors render inline

### Tests
- Mock fetch; verify file selected → onChange called with returned URL

Commit: `feat(admin): ImageUploadInput component`

---

## Wire-up & smoke

### Task W — App.tsx + AppShell.tsx final wiring

```tsx
// App.tsx
<Route path="prizes" element={<Prizes />} />
<Route path="settings" element={<Settings />} />
```

```tsx
// AppShell sidebar:
{ to: '/prizes', label: '獎品設定' },
{ to: '/settings', label: '遊戲規則' },
```

Commit: `feat(admin): wire Prizes + Settings routes in shell`

### Task S — Smoke

1. `cd server && npm test` — full suite green against TEST_DATABASE_URL
2. `cd server && npm run build` — admin-ui + backend dist generated
3. Deploy via `git push origin main`
4. Login to the production admin URL, click 獎品設定, edit a prize, save, verify on the production member URL that the wheel reflects the change
5. Upload a test image via 獎品設定 → ImageUploadInput; verify image visible on member-facing wheel

No commit if all green.

---

## Self-review

- **Spec coverage:** every spec section addressed (B = Prize+Settings, D = Upload+ImageUploadInput, T = test isolation)
- **No placeholders.** Every task has explicit code, file paths, and commit messages.
- **Type / name consistency.** `putObject` / `publicUrl` / `deleteObject` used identically across bucket.ts, uploads.ts, prizes UI delete (cascading bucket cleanup is left for a future cleanup task — current MVP doesn't delete bucket objects when prize.imageUrl changes; documented as a known compromise).
- **Known compromises:**
  - Image cleanup on prize delete / re-upload is not implemented (orphan files). Acceptable for MVP given Railway Bucket pricing.
  - No image resizing; admins responsible for uploading reasonably-sized files.
  - No file-type sniffing beyond `content-type` header — operator must upload trusted files.
