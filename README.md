# LINE 會員幸運輪盤抽獎系統

以 **LINE 登入**的會員幸運輪盤抽獎系統。一份程式碼建置出四個 app（玩家端、後端 API、管理後台、跨站總管），在 Railway 上以**多個服務**部署。

> 給 AI / 進階開發者的工程細節見 [`CLAUDE.md`](./CLAUDE.md)；產品規格見 [`docs/`](./docs/)。

---

## 架構總覽

| App | 路徑 | 技術 | 服務於 |
| --- | --- | --- | --- |
| 玩家端 SPA | `src/` | Vite + React 19 + zustand | `/` |
| 後端 API | `server/` | Hono + Prisma (PostgreSQL) + jose JWT | `/api/*` |
| 管理後台 | `server/admin-ui/` | Vite + React 19 + React Router + React Query | `/admin` |
| 跨站總管 (Superadmin) | `server/src/superadmin/*` + `server/superadmin-ui/` | 共用後端套件，獨立 Hono 進入點 + SPA | 自己的網域 `/` |

### 正式部署拓樸（三服務、兩資料庫）

同一份程式碼在 Railway 同一個專案中部署多次：

- **兩個會員站**，各自一個 service、一個 PostgreSQL、一個網域。**同一份 Prisma schema、兩份獨立資料**。兩站共用**同一個 LINE channel**，所以同一個人在兩站的 `lineUserId` 相同，但是**各站一筆獨立的 `User`**（因此 `entertainmentMemberCode` 只在「單一站內」唯一，跨站不保證）。
- **一個 superadmin 服務**，同時連線**兩個** DB，做跨站會員審核/管理與統計。**不跑任何 migration**。

```
                          玩家（LINE 登入）
              luckyds.com  │            │  ds-lucky.com
        ┌──────────────────┘            └──────────────────┐
        ▼                                                   ▼
┌────────────────────┐                          ┌────────────────────┐
│ 站 A  luckywheels   │                          │ 站 B  luckywheels-2 │
│  玩家 SPA  /         │                          │  玩家 SPA  /         │
│  後台      /admin    │                          │  後台      /admin    │
│  API       /api/*    │                          │  API       /api/*    │
└─────────┬──────────┘                          └──────────┬─────────┘
          │ DATABASE_URL                                    │ DATABASE_URL
          ▼                                                 ▼
   ┌─────────────┐                                  ┌───────────────┐
   │ Postgres A  │                                  │ Postgres-K2uq │
   └──────▲──────┘                                  └───────▲───────┘
          │ SITE_A_DATABASE_URL        SITE_B_DATABASE_URL  │
          └───────────────┬──────────────────┬─────────────┘
                          │                   │
                   ┌──────┴───────────────────┴──────┐
                   │   Superadmin 服務（自己的網域）  │
                   │   跨站審核 / 搬遷會員 / 週月統計  │
                   └──────────────────────────────────┘
```

---

## 專案結構

```
src/                     玩家端 SPA（輪盤、登入、onboarding、中獎彈窗）
server/
  src/
    index.ts             會員/後台服務進入點（掛載 API + 服務兩個 SPA）
    db.ts                單一全域 PrismaClient（綁 DATABASE_URL）
    env.ts               以 zod 驗證環境變數（三把 secret 必須相異）
    routes/              玩家 API：auth(LINE)/draw/me/onboarding/public/media-proxy
    draw/                抽獎核心：pick(加權隨機)/tier/settings/gates
    auth/                會員 JWT realm（LINE OAuth、cookie、requireUser）
    admin/               後台 realm：auth/routes/audit；users/ops.ts 為共用會員操作
    storage/bucket.ts    Railway Bucket（S3）封裝
    superadmin/          跨站總管：index.ts 進入點、clients.ts 雙 DB、auth、routes
  admin-ui/              管理後台 SPA（base "/admin/"）
  superadmin-ui/         跨站總管 SPA（base "/"）
  prisma/                schema.prisma + migrations + seed
docs/                    設計規格、實作計畫
Dockerfile               會員站映像（玩家 SPA + 後台 + 後端）
Dockerfile.superadmin    superadmin 映像（superadmin SPA + 後端，不跑 migration）
```

---

## 本機開發

需要 Node 22+、Docker（本機 Postgres）。

```bash
# 1) 後端 + 資料庫
cd server
npm install
npm run db:up          # docker compose 起一個本機 Postgres
npm run db:migrate     # prisma migrate dev
npm run db:seed        # 種獎品 + AppSetting 預設值
npm run admin:create -- --account admin@x.com --password '...'   # 建一個後台帳號
npm run dev            # tsx watch → 0.0.0.0:3001

# 2) 玩家端 SPA（另開終端，repo 根目錄）
npm install
npm run dev            # vite 127.0.0.1:5173，/api 代理到 127.0.0.1:3001

# 3) 管理後台 SPA（另開終端）
cd server && npm run admin-ui:dev      # 127.0.0.1:5174
```

> dev/preview 主機刻意綁 `127.0.0.1`，請勿改成 `0.0.0.0` 對外。後端綁 `0.0.0.0:3001` 是因為跑在容器內。
> **沒有 linter**；型別錯誤會讓每個 build 失敗（各處 `vite build` 前都先跑 `tsc`）。

### 測試

```bash
cd server && npm test        # vitest（整合 + 單元），需要一個 Postgres
```

測試會**大量 truncate 資料表** —— 請用獨立的測試庫，設 `TEST_DATABASE_URL`，**切勿指向有真實資料的 DB**。

---

## 環境變數（重點）

完整清單見 [`server/.env.example`](./server/.env.example)。

- **資料庫**：`DATABASE_URL`（會員/後台服務）；測試用 `TEST_DATABASE_URL`。
- **Secrets（各 ≥ 32 bytes，且彼此相異，否則開機被擋）**：`JWT_SECRET`（會員 session）、`STATE_SECRET`（OAuth state）、`ADMIN_JWT_SECRET`（後台 session）。
- **LINE Login**：`LINE_CHANNEL_ID` / `LINE_CHANNEL_SECRET` / `LINE_REDIRECT_URI` 等。
- **Railway Bucket（圖片）**：`BUCKET` / `ACCESS_KEY_ID` / `SECRET_ACCESS_KEY` / `ENDPOINT` / `REGION`（本機可不設，上傳/代理會回 `BUCKET_NOT_CONFIGURED`）。
- **Superadmin 服務專用**：`SITE_A_DATABASE_URL` / `SITE_B_DATABASE_URL` / `SUPERADMIN_JWT_SECRET`，選填 `SUPERADMIN_CONTROL_SITE`（預設 `A`）、`SITE_A_LABEL` / `SITE_B_LABEL`。

---

## 資料庫連線方式

- 會員/後台服務：`server/src/db.ts` 匯出**單一**、module 層級的 `PrismaClient`，在 import 時綁定 `DATABASE_URL`；所有 route 都用這個全域 `prisma`。測試靠 `tests/setup.ts` 在 import `db.ts` **之前**把 `process.env.DATABASE_URL` 換成 `TEST_DATABASE_URL`。
- Superadmin：唯一同時持有**兩條連線**的地方。`server/src/superadmin/clients.ts` 用 `new PrismaClient({ datasources: { db: { url } } })` 各站建一個 client（`clientFor('A'|'B')`），讀 `SITE_A_DATABASE_URL` / `SITE_B_DATABASE_URL`。兩個 DB 是同一份 schema，所以同一個生成的 client 通用。在 Railway 上這兩個 URL 是指向兩個 Postgres 服務的 reference variable，走**私有網路**（`*.railway.internal`）。

---

## 圖片 / 媒體連線方式

獎品圖片放在 **Railway Bucket**（S3 相容，`@aws-sdk/client-s3`，`server/src/storage/bucket.ts`，`forcePathStyle`）。

```
上傳： 後台 ──POST /api/admin/uploads──▶ Hono ──putObject──▶ Bucket(S3)
        （multipart `file`；png/jpeg/webp/gif、≤5MB；存成 prize-images/<uuid>.<ext>）
        Prize.imageUrl = bucket 公開網址 ${ENDPOINT}/${BUCKET}/<key>

顯示： SPA ──proxiedImageUrl()──▶ /api/media-proxy?url=<bucket 公開網址>
        media-proxy 檢查 host+bucket 前綴是否吻合 ENDPOINT/BUCKET（白名單 / SSRF 防護，不符回 403）
        ──getObject──▶ 串流回前端（長效 immutable 快取 + nosniff）
```

前端**永不直連 bucket** —— 一律經由 `/api/media-proxy`，藉此避開 hotlink/CORS，並把 bucket 金鑰留在伺服器端。

---

## 後端路由處理

- 路由都是 Hono router，全部掛在 `/`（完整路徑寫在各 router 內），於 `server/src/index.ts`（會員/後台）與 `server/src/superadmin/index.ts`（superadmin）組裝。
- `app.onError` 把每個丟出的 `AppError` 經 `formatError` 轉成 `{ error: { code, message } }` + 對應狀態碼。
- **順序很重要**：先掛 API route → 再服務靜態 SPA → 最後 `GET *` 回傳 SPA 的 `index.html`（讓前端路由能深連結）。會員服務另外會改寫 `/admin/assets/*`，因為 admin-ui 以 vite `base: "/admin/"` 建置。
- 共用的會員操作邏輯集中在 `server/src/admin/users/ops.ts`（可注入 client、帶 `AuditActor`），後台與 superadmin 都呼叫同一份，避免兩邊行為漂移。

| 範圍 | route 檔 |
| --- | --- |
| 會員 | `routes/{auth,draw,me,onboarding,public,media-proxy}` |
| 後台 | `admin/routes/{auth,users,redemptions,prizes,settings,action-logs,uploads,me}` |
| Superadmin | `superadmin/routes/{auth,users,stats}` |

---

## Superadmin（跨站總管）

- 跨站會員列表（合併兩站、可用「全部 / 一站 / 二站」篩選）、審核、黑名單、積分、刪除。
- **搬遷會員**（含積分）：搬到另一站並刪除來源；目的站已有同一人則擋下。跨 DB，先寫目的站再刪來源以避免弄丟點數。
- **統計**分頁：預設週、可切月；2 站合計的抽獎次數（連抽正確計數）、已派送中獎金額、新增會員等。
- 自成一套認證：`SUPERADMIN_JWT_SECRET`、cookie `lw_superadmin_session`、`requireSuperadmin` 檢查控制 DB 內 `AdminUser.role === 'superadmin'`。
- 建立登入帳號：

```bash
cd server
SITE_A_DATABASE_URL='<控制站 Postgres 公開或私有 URL>' \
  npm run superadmin:create -- --account boss@x.com --password '...' --site A
```

---

## 部署（Railway）

- **會員站**：以根目錄 `Dockerfile` 建置（玩家 SPA + 後台 + 後端一個映像），`railway.json` 設 healthcheck `/api/healthz`；容器 `CMD` 先 `prisma migrate deploy` 再啟動，**各站自己 migrate 自己的 DB**。
- **Superadmin**：以 `Dockerfile.superadmin` 建置（superadmin SPA + 後端），啟動 `dist/src/superadmin/index.js`，**不跑 migration**。因為 Railway 的 config-as-code 會蓋過 dashboard 設定，superadmin 服務把 `railwayConfigFile` 指向專屬的 `railway.superadmin.json`，才能在不動到會員站的前提下使用 `Dockerfile.superadmin`。
- `railway up --service <name>` 部署的是**本機工作目錄**到指定服務，所以會員站只有在自己重新部署時才會吃到共用程式（例如 `admin/users/ops.ts` 重構）的變更 —— 合併共用變更前請留意。

---

## 核心不變量（請勿打破）

抽獎結果**只**由 `POST /api/draw` 決定（`server/src/routes/draw.ts` + `draw/pick.ts`，加權隨機，整段在一個 Prisma `$transaction` 內）。前端只負責動畫轉到 `prize.wheelPosition`，**絕不**在 client 端決定中獎結果。
