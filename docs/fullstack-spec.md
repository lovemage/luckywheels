# 幸運輪盤前後端規格

## 系統目標

建立一套 LINE 會員抽獎系統，包含：

- LINE 會員登入/註冊
- Admin 手動儲值點數
- 會員使用點數兌換抽獎次數
- 會員抽獎
- Admin 管理獎品、上傳獎品圖片、設定庫存與權重
- 會員查看我的獎品
- Admin 查看抽獎紀錄與領獎狀態

目前已先完成前端展示版，使用假資料模擬流程。正式版需串接後端與資料庫。

## 建議技術架構

### 前端

```text
Next.js 或 Vite + React
TypeScript
CSS Modules / Tailwind / 原生 CSS
```

目前展示版使用：

```text
Vite
React
TypeScript
lucide-react
```

### 後端

建議：

```text
Next.js API routes / NestJS
PostgreSQL
Prisma
```

### 圖片儲存

建議：

```text
Cloudflare R2
AWS S3
Supabase Storage
```

獎品圖片需支援去背 PNG。

### 登入

若主要流量從 LINE 官方帳號進入：

```text
LIFF
```

若是一般網站登入：

```text
LINE Login
```

## 角色權限

### 會員

可以：

- 使用 LINE 登入
- 查看點數餘額
- 查看抽獎次數
- 使用點數兌換抽獎次數
- 抽獎
- 查看我的獎品
- 查看活動規則
- 查看排行榜

不可：

- 自行修改點數
- 自行修改抽獎次數
- 指定中獎結果
- 修改獎品資料

### Admin

可以：

- 查看會員列表
- 搜尋會員
- 手動儲值點數
- 手動調整抽獎次數
- 查看點數流水
- 查看抽獎次數流水
- 新增/編輯/停用獎品
- 上傳獎品圖片
- 設定獎品庫存
- 設定中獎權重
- 設定每個獎品在輪盤上的位置
- 設定輪盤旋轉時間
- 查看抽獎紀錄
- 更新領獎狀態

## 核心流程

### 1. LINE 登入/註冊

1. 會員從 LINE 或網站進入活動頁。
2. 系統導向 LINE 授權。
3. 後端取得 LINE profile。
4. 若 userId 不存在，建立會員。
5. 若 userId 已存在，更新名稱與頭像。
6. 回到輪盤首頁。

會員資料至少包含：

```text
lineUserId
displayName
pictureUrl
vipLevel
pointsBalance
drawBalance
```

### 2. Admin 儲值點數

1. Admin 搜尋會員。
2. 輸入儲值點數。
3. 後端建立點數流水。
4. 更新會員點數餘額。
5. 回傳最新餘額。

注意：

- 點數一定要有流水紀錄。
- 不可只改 `pointsBalance`。
- 流水需記錄 Admin 操作者與原因。

### 3. 會員點數兌換抽獎次數

1. 會員打開兌換頁。
2. 選擇兌換方案。
3. 後端檢查點數是否足夠。
4. 扣除點數。
5. 增加抽獎次數。
6. 建立點數流水與抽獎次數流水。
7. 回傳最新餘額。

範例方案：

| 方案 | 消耗點數 | 取得次數 |
|---|---:|---:|
| 單次試手氣 | 100 | 1 |
| 人氣五連抽 | 450 | 5 |
| 豪華十連抽 | 850 | 10 |

### 4. 會員抽獎

1. 會員點擊中心旋鈕或下方立即抽獎。
2. 前端呼叫後端抽獎 API。
3. 後端檢查抽獎次數是否足夠。
4. 後端扣除 1 次抽獎次數。
5. 後端依照啟用獎品與權重抽出結果。
6. 若獎品有庫存，扣除庫存。
7. 建立抽獎紀錄。
8. 若中獎，建立會員獎品紀錄。
9. 回傳中獎結果與目標獎品 id。
10. 前端依照結果播放轉盤動畫。

前端播放動畫時需使用 Admin 設定：

```text
spinDurationMs
spinExtraTurns
spinEasing
```

重要規則：

- 抽獎結果必須由後端決定。
- 前端只負責播放動畫。
- 不可由前端自行 random 決定結果。

### 5. Admin 管理獎品

Admin 可設定：

```text
獎項名稱
獎項等級
獎品描述
獎品圖片
庫存
中獎權重
輪盤位置
排序
啟用/停用
是否為安慰獎
```

注意：

- `中獎權重` 控制抽獎機率。
- `輪盤位置` 控制畫面上落在哪一格。
- 權重與位置是兩個不同欄位，不應混用。
- Admin 調整位置只影響視覺排序，不應直接改變中獎機率。

圖片規格：

```text
PNG/WebP
建議去背
正方形或接近正方形
前端 object-fit: contain
```

## 資料庫 Schema 草案

### users

```text
id
lineUserId
displayName
pictureUrl
vipLevel
pointsBalance
drawBalance
createdAt
updatedAt
```

### admin_users

```text
id
email
passwordHash
role
createdAt
updatedAt
```

### point_transactions

```text
id
userId
type              // admin_topup, exchange_cost, refund, adjustment
amount
balanceAfter
adminUserId
note
createdAt
```

### draw_credit_transactions

```text
id
userId
type              // exchange_gain, draw_cost, admin_adjustment
amount
balanceAfter
adminUserId
note
createdAt
```

### draw_packages

```text
id
title
pointsCost
drawCount
badgeText
enabled
sortOrder
createdAt
updatedAt
```

### prizes

```text
id
rankLabel
name
description
imageUrl
stock
weight            // 中獎權重
wheelPosition     // 輪盤位置，從 0 開始或 1 開始需統一
sortOrder         // 後台列表排序，可與 wheelPosition 分開
enabled
isConsolation
createdAt
updatedAt
```

### draw_logs

```text
id
userId
prizeId
drawCreditBefore
drawCreditAfter
randomSeed
createdAt
```

### user_prizes

```text
id
userId
prizeId
drawLogId
status            // pending, claimed, void
claimedAt
adminUserId
note
createdAt
updatedAt
```

### app_settings

```text
id
key
value
updatedAt
```

建議設定 key：

```text
spinDurationMs       // 輪盤旋轉時間，毫秒，例如 4300
spinExtraTurns       // 額外旋轉圈數，例如 4
spinEasing           // easing 名稱，例如 easeOutQuint
drawCostCredits      // 每次抽獎消耗次數，預設 1
```

## API 草案

### Auth

```text
GET  /api/auth/line/start
GET  /api/auth/line/callback
GET  /api/me
POST /api/logout
```

### Member

```text
GET  /api/member/wallet
GET  /api/member/prizes
GET  /api/member/draw-history
```

### Exchange

```text
GET  /api/draw-packages
POST /api/exchange
```

Request:

```json
{
  "packageId": "package_id"
}
```

Response:

```json
{
  "pointsBalance": 830,
  "drawBalance": 10
}
```

### Draw

```text
POST /api/draw
```

Response:

```json
{
  "drawLogId": "draw_log_id",
  "prize": {
    "id": "prize_id",
    "rankLabel": "三獎",
    "name": "超商禮券",
    "description": "500 元",
    "imageUrl": "https://..."
  },
  "drawBalance": 4
}
```

### Admin Members

```text
GET  /api/admin/users
GET  /api/admin/users/:id
POST /api/admin/users/:id/points
POST /api/admin/users/:id/draw-credits
GET  /api/admin/users/:id/transactions
```

### Admin Prizes

```text
GET    /api/admin/prizes
POST   /api/admin/prizes
PATCH  /api/admin/prizes/:id
DELETE /api/admin/prizes/:id
POST   /api/admin/uploads/prize-image
```

Admin 更新獎品時可調整：

```json
{
  "rankLabel": "頭獎",
  "name": "旗艦手機",
  "description": "Grand Prize",
  "imageUrl": "https://...",
  "stock": 1,
  "weight": 2,
  "wheelPosition": 0,
  "enabled": true,
  "isConsolation": false
}
```

### Admin Settings

```text
GET   /api/admin/settings
PATCH /api/admin/settings
```

Request:

```json
{
  "spinDurationMs": 4300,
  "spinExtraTurns": 4,
  "spinEasing": "easeOutQuint"
}
```

前台需讀取公開活動設定：

```text
GET /api/settings/public
```

Response:

```json
{
  "spinDurationMs": 4300,
  "spinExtraTurns": 4,
  "spinEasing": "easeOutQuint"
}
```

### Admin Draw Logs

```text
GET   /api/admin/draw-logs
GET   /api/admin/user-prizes
PATCH /api/admin/user-prizes/:id/status
```

## 抽獎演算法規格

1. 只取 `enabled = true` 且 `stock > 0` 的獎品。
2. 依照 `weight` 加權。
3. `weight` 是中獎權重，不是輪盤位置。
4. `wheelPosition` 是畫面位置，不直接代表機率。
5. 抽中後若不是無庫存型安慰獎，扣除庫存。
6. 所有操作需在 transaction 內完成。
7. 同一會員連點抽獎時，需避免重複扣點或超抽。

機率計算：

```text
單一獎品機率 = 該獎品 weight / 所有啟用且可抽獎獎品 weight 總和
```

範例：

| 獎品 | wheelPosition | weight | 機率 |
|---|---:|---:|---:|
| 頭獎 | 0 | 2 | 2 / total |
| 二獎 | 1 | 6 | 6 / total |
| 三獎 | 2 | 16 | 16 / total |

輪盤停止角度：

```text
由後端回傳 prizeId
前端用 prize.wheelPosition 計算目標角度
再加上 spinExtraTurns 圈數
動畫時間使用 spinDurationMs
```

交易順序：

```text
begin transaction
lock user row
check drawBalance > 0
decrease drawBalance
select active prizes
weighted random
if prize requires stock, decrease stock
create draw log
if winning prize, create user_prize
commit
```

## 前端頁面清單

### 會員端

```text
/                 輪盤首頁
/ranking          排行榜
/rules            活動規則
/my-prizes        我的獎品
/exchange         點數兌換抽獎次數
```

目前展示版在單頁中使用 tab 切換，正式版可保留 tab 或改路由。

### Admin

```text
/admin/login
/admin/users
/admin/users/:id
/admin/prizes
/admin/draw-packages
/admin/draw-logs
/admin/user-prizes
/admin/settings
```

## 前端狀態規格

會員首頁需取得：

```text
會員資料
點數餘額
抽獎次數
獎品清單
活動設定
```

抽獎中狀態：

```text
disable CTA
disable center knob
call POST /api/draw
receive result
read spinDurationMs / spinExtraTurns / spinEasing
rotate wheel to prize.wheelPosition
show result modal/toast
refresh wallet and prizes
```

## 實作順序建議

1. 建立 PostgreSQL + Prisma schema。
2. 建立 LINE 登入。
3. 建立會員資料與 wallet API。
4. 建立 Admin 登入與會員列表。
5. 建立 Admin 手動儲值點數。
6. 建立兌換方案與兌換 API。
7. 建立獎品 CRUD 與圖片上傳。
8. 建立 Admin 活動設定，包含輪盤旋轉時間。
9. 建立正式抽獎 API。
10. 前端接 API，移除假資料。
11. 加入抽獎紀錄、我的獎品、領獎狀態。

## 安全要求

- 抽獎結果只能由後端產生。
- Admin API 需要權限驗證。
- 點數與抽獎次數異動都要有流水。
- 上傳圖片需限制副檔名、大小與 MIME type。
- 抽獎 API 需要防重送。
- 後台操作需記錄 adminUserId。

## 目前展示版限制

- 使用假資料。
- 尚未串 LINE Login/LIFF。
- 尚未串資料庫。
- 獎品圖片上傳目前只做瀏覽器本地預覽。
- 抽獎結果目前由前端模擬，正式版需改由後端 API 回傳。
