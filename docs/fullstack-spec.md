# 幸運輪盤前後端規格

## 系統目標

建立一套 LINE 會員抽獎系統，包含：

- LINE 會員登入/註冊
- LINE 註冊完成後，會員綁定娛樂城會員編號（抽獎前置條件）
- Admin 手動派發積分
- 會員以積分直接抽獎（單抽 / 連抽 tier，由系統依「集點抽獎門檻」扣積分）
- Admin 管理獎品、上傳獎品圖片、設定庫存與權重
- 會員以 Redemption 隨機碼向 Admin 兌換中獎彩金
- Admin 查看抽獎紀錄、Redemption 狀態（未完成 / 已派送 / 已取消）

### 2026-06-03 業主會議結論

依據業主會議結論，第一階段的產品定位與範圍補充如下：

- **抽獎入場以積分制運作**（後續補充）。會員以 `points` 作為抽獎門票，由 Admin 派發；每次抽獎依「集點抽獎門檻」階層表扣積分。原本的「prizePool / 彩金作為入場貨幣」設計已淘汰，**`cashAmount` 僅作為中獎獎金**的描述，與入場貨幣分離。
- 預設門檻表（`app_settings.pointThresholds`）：

  | 集滿積分 | 可抽次數 |
  |---:|---:|
  | 6 | 1 |
  | 15 | 3 |
  | 25 | 5 |
  | 35 | 7 |
  | 48 | 10 |

  前台「可抽次數」= 找出最大的 `threshold.points ≤ users.points`，取其 `draws`。
- 抽獎 API 帶 `tier` 參數（`single` / `multi`），分別扣 `thresholds[0]` 與 `thresholds[last]` 的積分、累計對應次數。
- **獎項型態為固定金額彩金**。輪盤上每一格獎項（頭獎～六獎）對應一個固定 `cashAmount`，中獎即視同中現金；無累積機制，每次中獎金額由獎項當下的 `cashAmount` 決定。實體禮品延後處理。
- **會員分兩類帳號**：
  - **正式會員**：LINE 登入後經 Admin 人工審核通過。抽獎機率固定為系統權重，Admin 不可覆寫單次中獎結果。
  - **測試帳號**：由 Admin 手動標記。Admin 可設定該帳號抽獎時是否扣點，以及是否強制中指定獎品。用於 Demo、QA、教育訓練，不污染排行榜。
- **排行榜分為兩種**：
  - **消耗排行榜**：依會員累計消耗點數排名。
  - **幸運排行榜**：依會員累計中獎金額排名。
  - 兩榜均開放 Admin 後台手動編輯名單、金額與排名。

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
- 綁定娛樂城會員編號（一次性、由 Admin 在後台異動）
- 查看積分餘額
- 查看「可抽次數」（由積分對照 `pointThresholds` 推導）
- 抽獎（single / multi tier，直接扣積分）
- 查看我的中獎紀錄與 Redemption 隨機碼
- 查看活動規則
- 查看排行榜（消耗排行榜、幸運排行榜）

不可：

- 自行修改積分
- 自行覆寫娛樂城會員編號（綁定後僅 Admin 可改）
- 指定中獎結果
- 修改獎品資料

### 帳號類型細分

依照 2026-06-03 業主會議結論及後續 Admin 規範補充，會員的 `accountType` 共三種狀態，行為差異會落到抽獎流程與排行榜：

#### 正式會員（verified）

- LINE 註冊後**預設**進入此狀態（不再經過 `pending` 人工審核閘）。
- 抽獎中獎結果**完全由系統依權重決定**，Admin 不可調整其勝率或指定中獎獎品。
- 每次抽獎一律依「請求 tier 對應的 `pointThresholds`」扣積分，無例外。
- 抽獎紀錄、消耗點數、中獎金額皆計入兩種排行榜。
- 中獎金額由獎項當下的 `cashAmount` 決定，無累積邏輯。

#### 測試會員（test）

- 由 Admin 在後台會員列表手動編輯後切換，該會員自動從「正式會員」分頁移到「測試會員」分頁。
- Admin 可針對該會員設定：
  - `testSkipCost`：抽獎時是否扣彩金。
  - `testForcePrizeId`：是否強制中指定獎品（用於展示特定中獎結果）。
- 抽獎結果**不依循系統預設機率**，可由 Admin 自由覆寫。
- 抽獎紀錄需可被識別為 test（`draw_logs.isTest = true`）。
- **不計入任何排行榜**，**不進入成本控管閘門**。
- 用於 Demo、QA、教育訓練、與業主驗收。

#### 黑名單（blacklisted）

- 由 Admin 在會員列表標記。可從正式會員或測試會員任一狀態切過去。
- 黑名單會員的 `POST /api/draw` 直接回 `403 USER_BLACKLISTED`，**不扣彩金、不寫 draw_logs、不播放動畫**。
- 前端在抽獎頁需顯示「此帳號已被停用」等中性訊息，不揭露具體原因。
- 黑名單會員仍可查看 LINE 登入後的會員資料，但所有寫入型 API（兌換、儲值請求、抽獎）皆拒絕。
- 解除黑名單需由 Admin 在後台執行，並寫入稽核紀錄。

> **狀態切換流程**：所有 `accountType` 切換、`testSkipCost` / `testForcePrizeId` 變更、黑名單上/下線皆寫入 `admin_action_logs`，包含操作者、時間、舊值、新值、原因備註。

### Admin

可以：

- 查看會員列表
- 搜尋會員
- 手動派發積分（含流水）
- 查看會員積分異動紀錄
- 查看會員的 Redemption 紀錄並切換狀態（未完成 / 已派送 / 已取消）
- 新增/編輯/停用獎品
- 上傳獎品圖片
- 設定獎品庫存
- 設定中獎權重
- 設定每個獎品在輪盤上的位置
- 設定獎品對應的固定彩金金額（`cashAmount`）
- 設定輪盤旋轉時間
- 查看抽獎紀錄
- 更新領獎狀態
- 將會員 `accountType` 標記為 `verified` / `test` / `pending`
- 編輯測試帳號的抽獎覆寫設定（`testSkipCost`、`testForcePrizeId`）
- 編輯消耗排行榜與幸運排行榜的展示名單（顯示名稱、金額、排名、是否顯示）
- 調整成本控管參數（`minDrawsBeforeWin`、`cooldownDrawsAfterWin`、`payoutCapEnabled`、`payoutCapRatio`）
- 查看 dashboard：全系統累計抽獎次數、累計派彩金額、累計消耗點數、當前派彩比例，以及各閘門近期觸發次數

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
points              // 唯一入場貨幣；依 pointThresholds 階層扣抵
```

### 2. Admin 儲值點數

1. Admin 搜尋會員。
2. 輸入儲值點數。
3. 後端建立點數流水。
4. 更新會員點數餘額。
5. 回傳最新餘額。

注意：

- 積分一定要有流水紀錄。
- 不可只改 `users.points`。
- 流水需記錄 Admin 操作者與原因。

### 3. ~~會員點數兌換抽獎次數~~（已廢止）

積分制取代了「點數 → 抽獎次數」雙幣別模型。`users.points` 即為抽獎入場貨幣，由 `POST /api/draw` 帶 `tier` 直接依 `pointThresholds` 扣抵；不存在 `drawBalance` / `draw_credit_transactions` / `draw_packages` / `/api/exchange`。正式版實作直接略過本流程。

### 4. 會員抽獎

1. 會員按下 CTA（單抽 / 連抽）。
2. 前端呼叫 `POST /api/draw`，帶 `tier` 與 `Idempotency-Key` header。
3. 後端依序檢查 blacklist → entertainment-code → tier；通過則進交易。
4. 交易內：lock 系統累計、扣積分 + 累計次數、跑 N 次加權抽出（multi N=10）、扣對應庫存、寫 N 筆 `draw_logs`，最後寫一筆 `Redemption`（含隨機 code、totalWinAmount）並 increment 系統累計。
5. 回傳 `{ redemption, draws[], points, tier, tierDraws, isTest }`。
6. 前端依 `draws[0].prize.wheelPosition` 計算停止角度，播放動畫；停盤後彈窗顯示 N 筆中獎金額 + Redemption 隨機碼供截圖。

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

## 彩金與排行榜規則

### 彩金（cashAmount）

- 每個輪盤獎項在 `prizes` 表內含一個固定 `cashAmount`，單位為新台幣。
- 中獎金額一律使用該獎項的 `cashAmount`，無動態累積機制。
- 中獎結果送回前端時，需同時帶出 `cashAmount`，前端中獎彈窗顯示金額。
- 安慰獎（謝謝參加）`cashAmount = 0` 並 `isConsolation = true`，仍會被視為一次有效抽獎，但不會累計到幸運排行榜的中獎金額。

### 排行榜（兩榜並存）

```text
boardType = burn    // 消耗排行榜，依消耗點數排名
boardType = luck    // 幸運排行榜，依累計中獎金額排名
```

預設計算方式（正式會員）：

- 消耗排行榜：對 `point_transactions` 中 `type IN ('exchange_cost', 'draw_cost')` 的點數加總，或對 `users.totalBurnAmount` 欄位即時更新（兩種實作擇一，後者讀取較快）。
- 幸運排行榜：對 `draw_logs` 中 `isTest = false` 的 `winningCashAmount` 加總，或對 `users.totalLuckAmount` 欄位即時更新。

Admin 編輯能力：

- 可建立、修改、刪除「手動條目」（`leaderboard_overrides`），用於：
  - 隱藏不適合公開的真實會員
  - 補上活動期間的特別榜上人物
  - 直接調整顯示名稱、金額、排名
- 公開 API 回傳時，需把「自動計算結果」與「手動 override」依排名合併，並標記 override 條目以便稽核（前端不需顯示標記）。

### 抽獎成本控管機制

依 2026-06-03 業主會議結論補充。為了在實際營運時能精確控制派彩成本，後端在權重抽出之前，必須先通過下列「成本控管閘門」。這些閘門整合「會員 / 全系統累計抽獎次數與金額」與「中獎機率」，提供 Admin 一組可即時調整的成本參數。

#### 新增的 `app_settings` keys

```text
minDrawsBeforeWin       // 每位會員需累計多少次抽獎後才開始有機率中獎（0 = 不限制）
cooldownDrawsAfterWin   // 會員中獎後需經過幾次抽獎才可能再次中獎（0 = 不限制）
payoutCapEnabled        // 是否啟用「累計派彩 / 累計消耗點數」比例上限保護
payoutCapRatio          // 上限比例，例如 0.45 代表派彩金額不可超過總消耗點數的 45%
consolationPrizeId      // 強制安慰獎時，draw_logs 紀錄的目標獎品 id
```

#### 新增的 `users` 欄位

```text
lifetimeDrawCount       // 此會員累計抽獎次數（含被閘門攔下的抽獎）
lifetimePayoutAmount    // 此會員累計中獎彩金
lastWinDrawIndex        // 上次中獎時的 lifetimeDrawCount，用於計算冷卻窗
```

#### 新增的 `system_metrics`（或集中於 `app_settings`）

```text
totalDrawCount          // 全系統累計抽獎次數
totalPayoutAmount       // 全系統累計派彩金額
totalPointsBurned       // 全系統累計消耗點數（兌換 + 直接扣抽獎次數的等價點數）
```

每次抽獎結束時同步更新。

#### 抽獎演算法插入步驟

下列閘門僅對 `accountType = verified` 使用者執行，**測試帳號完全不受影響**。執行順序如下（在「依帳號類型分流」之後、「依共通規則加權抽出」之前）：

1. **最低抽獎次數閘門**
   - 若 `users.lifetimeDrawCount < minDrawsBeforeWin` → 強制中 `consolationPrizeId`，跳過權重抽出。
   - `draw_logs.gatedBy = 'min_draws'`。
2. **中獎冷卻閘門**
   - 若 `users.lifetimeDrawCount - users.lastWinDrawIndex < cooldownDrawsAfterWin` → 強制安慰獎。
   - `draw_logs.gatedBy = 'cooldown'`。
3. **派彩比例上限閘門**
   - 若 `payoutCapEnabled = true` 且 `totalPayoutAmount / max(totalPointsBurned, 1) > payoutCapRatio` → 強制安慰獎。
   - `draw_logs.gatedBy = 'payout_cap'`。
4. **通過所有閘門 →** 走共通規則的加權抽出，`draw_logs.gatedBy = null`。

#### 規則保證

- 被閘門攔下的抽獎仍會扣抽獎次數、仍會寫 `draw_logs`，前端動畫與一般抽獎無異。
- 強制安慰獎仍計入 `lifetimeDrawCount`，但不更新 `lastWinDrawIndex`、不增加 `totalPayoutAmount`。
- 所有閘門參數的異動需寫稽核紀錄（誰、何時、從什麼變成什麼）。
- Admin Dashboard 需提供：
  - 即時的 `totalDrawCount` / `totalPayoutAmount` / `totalPointsBurned` / 當前派彩比例
  - 每個閘門的觸發次數（最近 1 / 7 / 30 天）
  - 把上述指標和 `minDrawsBeforeWin` / `cooldownDrawsAfterWin` / `payoutCapRatio` 並排，方便調校

### 帳號類型對流程的差異總表

| 行為 | 正式會員 verified | 測試帳號 test |
|---|---|---|
| 扣積分 | 依請求 tier 扣對應 `pointThresholds` | 由 `testSkipCost` 決定 |
| 中獎機率 | 系統權重 | 可由 `testForcePrizeId` 強制指定，否則走系統權重 |
| 進入排行榜 | 是 | 否 |
| 進入成本控管閘門 | 是 | 否 |
| draw_logs.isTest | false | true |

## 資料庫 Schema 草案

### users

```text
id
lineUserId
displayName
pictureUrl
vipLevel
points                       // 入場貨幣，依 pointThresholds 階層扣抵
entertainmentMemberCode      // 娛樂城會員編號，nullable，unique；綁定後才能抽獎
entertainmentCodeBoundAt     // 綁定時間，nullable
accountType                  // verified, test, blacklisted（預設 verified）
verifiedAt                   // LINE 註冊完成時間，自動填入
testSkipCost                 // 僅 accountType=test 時生效，是否略過扣積分
testForcePrizeId             // 僅 accountType=test 時生效，nullable，強制中此獎品
blacklistedAt                // 被列入黑名單時間，nullable
blacklistedByAdminUserId     // 操作者，nullable
blacklistReason              // 備註，nullable
totalBurnAmount              // 累計消耗積分，用於消耗排行榜
totalLuckAmount              // 累計中獎彩金（cash），用於幸運排行榜
lifetimeDrawCount            // 累計抽獎次數（含被成本控管閘門攔下的）
lifetimePayoutAmount         // 累計實際中獎彩金
lastWinDrawIndex             // 上次中獎時的 lifetimeDrawCount，用於冷卻判斷
createdAt
updatedAt
```

備註：

- `accountType` 預設為 `verified`。LINE 註冊完成即視同正式會員（依後續會議決議移除 pending 人工審核閘）。後台仍可手動切回 `test` 或 `blacklisted`。
- `testSkipCost` 與 `testForcePrizeId` 對 `verified` 帳號**無效**，後端必須忽略這兩個欄位。
- `entertainmentMemberCode` 為 unique，預設 null。會員透過 `POST /api/onboarding/entertainment-code` 完成綁定後 `entertainmentCodeBoundAt` 自動填入。一旦綁定，再次呼叫且帶不同碼回 409；同碼則 idempotent 200。要改值需 Admin 介入。
- 未綁定的會員打 `POST /api/draw` 直接回 `403 ENTERTAINMENT_CODE_REQUIRED`，前端引導到綁定頁。

### admin_users

```text
id
email
passwordHash
role                    // super, operator, viewer
lastLoginAt
passwordChangedAt       // 提供「請定期更新密碼」提示
createdAt
updatedAt
```

備註：

- Admin 可由 `PATCH /api/admin/me/password` 自行變更密碼，需驗證舊密碼。
- 密碼以 bcrypt / argon2 雜湊存放，不可寫明碼。

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
cashAmount        // 對應固定彩金金額，單位 TWD；安慰獎為 0
segmentColor      // 輪盤該格底色（hex），由 Admin 控制，不寫死於前端
textColor         // 輪盤該格文字顏色（hex），與 segmentColor 對比
enabled
isConsolation
createdAt
updatedAt
```

備註：

- 中獎金額一律使用該獎項當下的 `cashAmount`，無累積機制。
- 頭獎與其他獎項唯一差別是 `cashAmount` 較高與 `weight` 較低，沒有特殊累積邏輯。

### draw_logs

```text
id
userId
redemptionId            // 每筆 draw_log 必屬於一個 Redemption（single 為 1 筆，multi 為 10 筆）
subIndex                // 在該 Redemption 內的編號：single 固定 0；multi 為 0..9
prizeId
tier                    // single | multi
tierCost                // 該批扣的積分總額（與其他 sub-row 相同）
tierDraws               // 該批的 draws 總數（與其他 sub-row 相同）
pointsBefore            // 該 sub-draw 寫入前的會員 points
pointsAfter             // 該 sub-draw 寫入後的會員 points（finalize 後同批 sub-rows 相同）
randomSeed
winningCashAmount       // = prizes.cashAmount，安慰獎 / 被閘門攔下時為 0
isTest                  // 測試帳號抽出；true 時不進排行榜也不影響系統累計
forcedByAdmin           // 測試帳號被 testForcePrizeId 強制中獎時為 true
gatedBy                 // 被成本控管閘門攔下時的原因：min_draws / cooldown / payout_cap；通過所有閘門為 null
createdAt
```

備註：

- `idempotencyKey` **不**在 draw_logs。請見 `redemptions` 表（批次層綁定，避免 multi 10 筆 sub-row 撞 unique）。
- `(redemptionId, subIndex)` 設 unique，保證同一批次內 sub-draw 不會重號。

### redemptions

每一筆 `POST /api/draw` 請求對應一筆 `Redemption`，內含一組對外公開的隨機兌換碼。會員把碼截圖傳給管理員，管理員依碼查詢並切換狀態。Multi tier 連抽的 10 筆 `draw_logs` 全部掛在同一筆 `Redemption` 下。

```text
id
userId
code                    // Crockford Base32 12 字 + 兩個 dash，格式 XXXX-XXXX-XXXX；unique
tier                    // single | multi
totalWinAmount          // 該批 draw_logs 的 winningCashAmount 加總（tx 末段一次性寫入）
status                  // pending | delivered | cancelled
statusChangedAt
statusChangedByAdminUserId
cancelReason            // 狀態變 cancelled 時的原因，nullable
isTest                  // mirror draw_logs.isTest，方便管理員 dashboard 過濾
idempotencyKey          // 由用戶端 header `Idempotency-Key` 帶入；nullable
createdAt
updatedAt
```

備註與索引：

- `@@unique([userId, idempotencyKey])` — 同一會員以同一 key 重送，回 replay 不會建立第二筆 Redemption。
- `code` 設 unique；產生時若撞 `P2002`，後端重產一組碼重試（成本極低，120 bits 熵）。
- `status` 預設 `pending`；管理員透過 Admin 後台「中獎紀錄」模組切換到 `delivered` 或 `cancelled`，每次切換寫一筆 `admin_action_logs`。
- 索引：`[userId, createdAt]`、`[status, createdAt]`、`[isTest, createdAt]`。

### app_settings

```text
id
key
value
updatedAt
```

建議設定 key：

```text
spinDurationMs            // 輪盤旋轉時間，毫秒，例如 4300
spinExtraTurns            // 額外旋轉圈數，例如 4
spinEasing                // easing 名稱，例如 easeOutQuint
pointThresholds           // JSON 字串，例如 [{"points":6,"draws":1},{"points":15,"draws":3},{"points":25,"draws":5},{"points":35,"draws":7},{"points":48,"draws":10}]
```

### admin_action_logs

依 2026-06-03 業主 Admin 規範，所有後台寫入型操作皆寫入此表，供「系統設置 → 歷史紀錄」頁面查詢。

```text
id
adminUserId
event              // user.account_type_changed, user.blacklist_set, user.blacklist_cleared,
                   // user.points_topup, user.points_deduct,
                   // prize.created, prize.updated, prize.disabled,
                   // settings.cost_gate_updated, leaderboard.entry_created,
                   // bottom_tabs.updated, template.updated, admin.password_changed,
                   // draw_blocked_blacklist (系統事件，adminUserId 為 null)
targetType         // user, prize, settings, leaderboard, template, system
targetId           // 對應的資源 id，nullable
payloadBefore      // JSON snapshot of changed fields
payloadAfter       // JSON snapshot of changed fields
ip                 // 操作者 IP
userAgent
note               // 操作者填寫的備註，nullable
createdAt
```

備註：

- 一律寫，不可被任何後台 UI skip。
- 「會員抽獎歷史」由 `draw_logs` 提供，不重複寫入 `admin_action_logs`。
- 黑名單會員的被阻擋抽獎請求 (`draw_blocked_blacklist`) 也寫進此表，便於後台稽核惡意請求頻率。

### bottom_tabs_config

對應「Admin 後台 → 頁面設置」可編輯的下方導航列。

```text
id
key                // wheel, ranking, rules, mine, etc.
label              // 顯示文字，例如「輪盤」
iconName           // lucide icon 名稱，例如 RotateCw
sortOrder
visible            // 是否在前台顯示
updatedAt
updatedByAdminUserId
```

備註：

- 預設 4 筆（輪盤 / 排行榜 / 活動規則 / 我的獎品）。
- Admin 可改 `label` / `iconName` / `sortOrder` / `visible`，但 `key` 不可改（與前端路由綁定）。
- 任何修改寫入 `admin_action_logs.event = 'bottom_tabs.updated'`。

### template_assets

對應「Admin 後台 → 自定模板」可上傳的前端視覺資產。

```text
id
slot               // background, logo, wheel_frame
imageUrl
originalFileName
fileSize
width
height
uploadedByAdminUserId
uploadedAt
isActive           // 是否為當前生效的版本
```

備註：

- 每個 `slot` 同時間只有一筆 `isActive = true`，舊版本保留供回滾。
- 上傳 API 需驗證副檔名、MIME type、檔案大小、寬高。
- 後台介面需在上傳前**明確顯示「現有測試開發圖片的尺寸與檔案規格」**，避免上傳尺寸不符造成版面跑位：
  - `background`：建議 1080 × 1920、PNG，最大 2 MB。
  - `logo`：建議 720 × 480、去背 PNG，最大 800 KB。
  - `wheel_frame`：建議 1254 × 1254（與目前 `public/assets/wheel-frame.png` 一致）、PNG，最大 2 MB。
- 上傳後寫入 `admin_action_logs.event = 'template.updated'`。

### leaderboard_overrides

```text
id
boardType         // burn (消耗排行榜) 或 luck (幸運排行榜)
displayName       // 顯示名稱，可與真實會員無關
amount            // 對應金額（消耗點數或中獎金額）
rank              // 手動指定排名，nullable；nullable 時依 amount 排序
linkedUserId      // 可選，連結到真實會員
visible           // 是否在前台顯示
adminUserId       // 最後編輯者
note
createdAt
updatedAt
```

備註：

- 公開排行榜 API 回傳前，需把自動計算結果（依 `users.totalBurnAmount` / `users.totalLuckAmount`）與 `leaderboard_overrides` 合併輸出。
- 同一 `boardType` 下不可有重複的非空 `rank`。

## API 草案

### Auth

```text
GET  /api/auth/line/start
GET  /api/auth/line/callback
GET  /api/me              // 含 entertainmentMemberCode 欄位
POST /api/logout
```

### Onboarding

```text
POST /api/onboarding/entertainment-code
```

Request：

```json
{
  "code": "EM_654321"
}
```

Response 200：

```json
{
  "entertainmentMemberCode": "EM_654321"
}
```

行為：

- code 必須 6–20 字、`A-Z 0-9 _ -`，否則 400 `ENTERTAINMENT_CODE_INVALID`。
- 該 code 已被別的會員綁定 → 409 `ENTERTAINMENT_CODE_TAKEN`。
- 該會員已綁了不同 code → 409 `ENTERTAINMENT_CODE_ALREADY_BOUND`（重綁需 Admin 介入）。
- 該會員已綁同樣 code → 200 idempotent 成功。

### Member

```text
GET  /api/member/wallet
GET  /api/member/prizes
GET  /api/member/draw-history
```

### Draw

```text
POST /api/draw
```

Request：

```json
{
  "tier": "single"
}
```

`tier` 必須為 `single` 或 `multi`，對應 `pointThresholds[0]`、`pointThresholds[last]`。後端解析後得到 `tierCost` 與 `tierDraws`。

Response:

```json
{
  "redemption": {
    "id": "redemption_id",
    "code": "K3F7-PRA2-NX9V",
    "status": "pending",
    "totalWinAmount": 500
  },
  "draws": [
    {
      "drawLogId": "draw_log_id",
      "subIndex": 0,
      "prize": {
        "id": "prize_id",
        "rankLabel": "三獎",
        "name": "彩金",
        "description": "1,000 元",
        "imageUrl": "https://...",
        "wheelPosition": 2
      },
      "winningCashAmount": 1000,
      "gatedBy": null
    }
  ],
  "points": 22,
  "tier": "single",
  "tierDraws": 1,
  "isTest": false
}
```

備註：

- `tier = single` 時 `draws.length = 1`；`tier = multi` 時 `draws.length = 10`，每筆 sub-draw 都有自己的 `prize` / `winningCashAmount` / `subIndex`。
- 中獎金額 = `prize.cashAmount`（安慰獎或被閘門攔下時為 0），無動態累積機制。
- `redemption.code` 為 12-char Crockford Base32 隨機碼，會員截圖給管理員兌換用；管理員可由此碼查紀錄並切換 `status`。
- 測試帳號的回傳 `isTest = true`，紀錄不進入排行榜。

### Admin Members

```text
GET   /api/admin/users
GET   /api/admin/users/:id
POST  /api/admin/users/:id/points
POST  /api/admin/users/:id/draw-credits
GET   /api/admin/users/:id/transactions
PATCH /api/admin/users/:id/account-type     // 切換 verified / test / pending
PATCH /api/admin/users/:id/test-settings    // 僅當 accountType=test 時可改
```

`PATCH /api/admin/users/:id/test-settings` request：

```json
{
  "testSkipCost": true,
  "testForcePrizeId": "prize_id_or_null"
}
```

後端在 `PATCH /api/admin/users/:id/account-type` 把帳號從 `test` 切回 `verified` 時，應同時把 `testSkipCost` 重設為 false、`testForcePrizeId` 清為 null，避免之後若再標回 test 殘留舊設定。

額外端點：

```text
PATCH /api/admin/users/:id/blacklist
GET   /api/admin/users/:id/draw-history
POST  /api/admin/users/:id/points             // 派發 / 扣除積分
```

`PATCH /api/admin/users/:id/blacklist` request：

```json
{
  "blacklisted": true,
  "reason": "可選的內部備註"
}
```

`POST /api/admin/users/:id/points` request：

```json
{
  "delta": 48,
  "note": "活動補償"
}
```

備註：

- 會員列表分為「正式會員」/「測試會員」兩個 tab，分別對應 `accountType=verified` / `accountType=test`。**黑名單會員無論原本是哪個分頁，皆在原分頁中以視覺標記呈現**，方便 Admin 找回。
- `POST .../points` 的 `delta` 為正數則派發、負數則扣除；扣除時若結果為負，回 422 並要求 Admin 二次確認。
- 上述三個端點皆寫入 `admin_action_logs`。

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

### Admin Leaderboards

```text
GET    /api/admin/leaderboard?type=burn
GET    /api/admin/leaderboard?type=luck
POST   /api/admin/leaderboard         // 新增手動條目
PATCH  /api/admin/leaderboard/:id     // 修改 displayName / amount / rank / visible
DELETE /api/admin/leaderboard/:id
```

`POST /api/admin/leaderboard` request：

```json
{
  "boardType": "luck",
  "displayName": "陳**",
  "amount": 88000,
  "rank": 1,
  "visible": true,
  "linkedUserId": null,
  "note": "活動冠軍代言人"
}
```

### Public Leaderboard

```text
GET /api/leaderboard?type=burn
GET /api/leaderboard?type=luck
```

回傳已合併自動條目與 `leaderboard_overrides` 的最終名單；不揭露哪一筆是 override。

### Admin Bottom Tabs

```text
GET   /api/admin/bottom-tabs
PATCH /api/admin/bottom-tabs/:id     // 修改 label / iconName / sortOrder / visible
```

Public 端使用 `GET /api/bottom-tabs/public` 取得當前生效設定。

### Admin Templates

```text
GET   /api/admin/templates                       // 列出所有 slot 的歷史與當前生效版本
POST  /api/admin/templates/:slot                 // 上傳新版本，slot ∈ {background, logo, wheel_frame}
PATCH /api/admin/templates/:slot/active          // 切換當前生效版本
```

`POST` 為 multipart，欄位：`file`。後端需驗：

- 副檔名 / MIME：限 `image/png`、`image/webp`、`image/jpeg`。
- 檔案大小：依 slot 設上限（見 `template_assets` 表備註）。
- 寬高需在建議值 ±20% 內，否則回 422 並提示「請使用對應 slot 的建議尺寸」。

### Admin System

```text
PATCH /api/admin/me/password                     // 變更自己密碼，需驗證舊密碼
GET   /api/admin/action-logs                     // 後台操作歷史，支援 adminUserId / event / 日期區間 / targetType 篩選
GET   /api/admin/users/:id/draw-history          // 單一會員的抽獎歷史（與 GET /api/admin/draw-logs?userId= 等價，作為導航捷徑）
```

`PATCH /api/admin/me/password` request：

```json
{
  "currentPassword": "...",
  "newPassword": "..."
}
```

成功時把 `passwordChangedAt` 更新為當下，並寫入 `admin_action_logs.event = 'admin.password_changed'`（不寫密碼明碼或雜湊）。

## 抽獎演算法規格

### 共通基本規則

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

### 依帳號類型分流

抽獎 API 進入時，先讀取會員 `accountType`：

#### accountType = blacklisted（黑名單）

- **任何寫入操作都被擋下**：直接回 `403 USER_BLACKLISTED`，不檢查彩金、不扣彩金、不寫 `draw_logs`、不更新任何累計欄位。
- 後端必須在 API 入口就完成此判斷，不可信任前端是否已隱藏抽獎按鈕。
- 同步寫一筆 `admin_action_logs.event = 'draw_blocked_blacklist'` 以便稽核（含會員 id、時間、IP）。

#### accountType = verified（正式會員）

1. 讀取請求 `tier`（`single` / `multi`），解析對應的 `pointThresholds[i]`：取 `tierCost = thresholds.points`、`tierDraws = thresholds.draws`。
2. 檢查 `users.points >= tierCost`，否則 422 `INSUFFICIENT_POINTS`。
3. `users.points -= tierCost`，`lifetimeDrawCount += tierDraws`，`totalPointsBurned += tierCost`。
4. 依序通過「成本控管閘門」（見上節）：
   - `min_draws` 未達 → 強制 `consolationPrizeId`，跳到步驟 6。
   - `cooldown` 未過 → 強制 `consolationPrizeId`，跳到步驟 6。
   - `payout_cap` 超過 → 強制 `consolationPrizeId`，跳到步驟 6。
5. 對 `tierDraws` 數量（1 for single, 10 for multi）跑 N 次加權抽出，每次產生一筆 sub-draw 結果。
6. 進入「中獎處理」流程（見下節）。
7. `draw_logs.isTest = false`、`forcedByAdmin = false`、`gatedBy` 依步驟 4 的結果填入。

**注意：正式會員任何時候都不能套用 `testSkipCost` 或 `testForcePrizeId`。**

#### accountType = test（測試帳號）

1. 若 `testSkipCost = true`，不檢查也不扣 `users.points`；否則照正式會員方式依 tier 扣積分。
2. 若 `testForcePrizeId` 不為空且該獎品 `enabled = true`，直接以該獎品為 `prize`，標記 `forcedByAdmin = true`；否則照共通規則加權抽出。
3. 進入「中獎處理」流程。
4. `draw_logs.isTest = true`。


### 中獎處理（僅 verified）

對每一筆 sub-draw（single 為 1 筆、multi 為 10 筆）獨立判斷：

- **被閘門攔下（`gatedBy ≠ null`）或抽到 `isConsolation = true`**：
  - `winningCashAmount = 0`
  - 不更新 `users.lastWinDrawIndex`
  - 不增加 `users.lifetimePayoutAmount` 與 `totalPayoutAmount`
- **中到一般獎品**：
  - `winningCashAmount = prize.cashAmount`（直接使用獎品當下的固定金額，無累積機制）
  - `users.lastWinDrawIndex = lifetimeDrawCount`、`lifetimePayoutAmount += winningCashAmount`、`totalPayoutAmount += winningCashAmount`

最後將 N 筆 sub-draw 包進同一筆 `Redemption`，`Redemption.totalWinAmount = SUM(draws[].winningCashAmount)`，產生隨機 `code` 回傳給前端。

### 排行榜累計（僅 verified）

- 同一交易內：
  - `users.totalBurnAmount += tierCost`（本次扣抵的積分）
  - 若 `winningCashAmount > 0`，`users.totalLuckAmount += winningCashAmount`

### 測試帳號的稽核

- 測試帳號的 `draw_logs` 不可混進 `GET /api/admin/draw-logs` 的預設查詢；需透過 `?includeTest=true` 才回傳。
- Admin Console 對測試帳號的 draw_logs 應有明顯視覺區分。

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
# API entry (pre-tx)
check accountType != blacklisted              # else 403 + admin_action_logs(draw_blocked_blacklist)
check user.entertainmentMemberCode != null    # else 403 ENTERTAINMENT_CODE_REQUIRED
parse body { tier }                            # else 400 TIER_INVALID
resolve tier -> tierCost, tierDraws
if accountType == 'test': branch to handleTestDraw

# Verified transaction (default ReadCommitted + explicit row locks)
begin transaction
  read system totals FOR UPDATE              # atomic payout_cap data
  atomic UPDATE user SET points -= tierCost,
                         lifetimeDrawCount += tierDraws,
                         totalBurnAmount += tierCost
                   WHERE points >= tierCost   # P2025 → 422 INSUFFICIENT_POINTS
  evaluate gates on post-deduct counters (min_draws / cooldown / payout_cap)
  read active prizes
  create Redemption with random code(), totalWinAmount=0, isTest=false, idempotencyKey
                                              # P2002 on (userId, key) → replay original
  for i in 0..tierDraws-1:
    chosen = gated ? consolation : pickPrize(active)
    if not chosen.isConsolation:
      decrement prize stock atomically WHERE stock > 0
      if no row affected (race): chosen = consolation
    create draw_log(redemptionId, subIndex=i, prizeId, winningCashAmount, gatedBy, ...)
  totalWinAmount = sum of draw_logs[].winningCashAmount
  if not gated and totalWinAmount > 0:
    UPDATE user SET lifetimePayoutAmount += totalWinAmount,
                    totalLuckAmount += totalWinAmount,
                    lastWinDrawIndex = lifetimeDrawCount (post-deduct)
  UPDATE Redemption SET totalWinAmount = ...
  increment system totals (drawCount, pointsBurned, payoutAmount)
commit
```

備註：

- 所有 jackpot 相關步驟（reset / increment / history）已隨機制移除。
- Multi tier 在同一交易內跑 N 次 pickPrize，每次獨立扣 stock；其中任一次撞 race → 該 sub-draw fallback 到 consolation，其他 sub-draws 不受影響。

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
/admin/users/:id              // 含 accountType 切換與測試帳號設定
/admin/prizes                 // 含 cashAmount 欄位
/admin/draw-packages
/admin/draw-logs              // 預設僅顯示正式會員紀錄，可切換顯示測試紀錄
/admin/user-prizes
/admin/leaderboards           // 編輯消耗 / 幸運兩榜的手動條目
/admin/settings
```

## 前端狀態規格

會員首頁需取得：

```text
會員資料（含 accountType）
點數餘額
抽獎次數
獎品清單（含 cashAmount）
活動設定
```

抽獎中狀態：

```text
disable CTA
disable center knob
call POST /api/draw（帶 tier 與 idempotency-key）
receive result（含 redemption.code + draws[]）
read spinDurationMs / spinExtraTurns / spinEasing
rotate wheel to draws[0].prize.wheelPosition
show result modal，顯示每筆中獎金額 + 兌換碼
refresh wallet
```

## 實作順序建議

1. 建立 PostgreSQL + Prisma schema（含 `accountType`、`cashAmount`、`Redemption`、`leaderboard_overrides`）。
2. 建立 LINE 登入；新註冊預設 `accountType = verified`（無 pending 審核閘，符合後續會議決議）。
3. 建立會員資料與 wallet API。
4. 建立 Admin 登入與會員列表。
5. 建立 Admin 手動儲值點數。
6. 建立兌換方案與兌換 API。
7. 建立獎品 CRUD 與圖片上傳，含 `cashAmount`。
8. 建立 Admin 活動設定，包含輪盤旋轉時間、`pointThresholds` 階層。
9. 建立 Admin 帳號類型管理（verified / test / blacklisted 切換 + 測試帳號設定）。
10. 建立正式抽獎 API，含依 `accountType` 分流、Redemption + 隨機碼產生。
11. 建立排行榜計算與 `leaderboard_overrides` 編輯介面。
12. 前端接 API，移除假資料；輪盤頁加入兌換碼彈窗顯示。
13. 加入抽獎紀錄、我的獎品、領獎狀態。

## 安全要求

- 抽獎結果只能由後端產生。
- Admin API 需要權限驗證。
- 點數與抽獎次數異動都要有流水。
- 上傳圖片需限制副檔名、大小與 MIME type。
- 抽獎 API 需要防重送。
- 後台操作需記錄 adminUserId。
- **`testSkipCost` 與 `testForcePrizeId` 僅可作用於 `accountType = test` 的使用者**。後端需在 `POST /api/draw` 強制重新讀取 `accountType` 後再判斷，不可信任前端或 cache。
- `accountType` 切換需寫入稽核紀錄（誰、何時、從什麼狀態變成什麼狀態）。
- 排行榜公開 API 不可洩漏 `linkedUserId` 與 override 標記。
- 成本控管閘門的判斷（`min_draws` / `cooldown` / `payout_cap`）必須在伺服器端完成，前端不得參與，亦不得透過任何欄位告知會員「你被閘門攔下」。
- 成本控管參數的異動需寫稽核紀錄（誰、何時、從什麼數值變成什麼數值）。
- **黑名單檢查必須在所有寫入型 API 入口完成**（抽獎、兌換、彩金請求等），不可只在前端隱藏按鈕。被擋的請求需寫入 `admin_action_logs.event = 'draw_blocked_blacklist'` 或對應事件。
- 解除黑名單與新增彩金、扣除彩金需要 Admin 二次確認 UI（前端），後端不依賴此 UI，但必須在 `admin_action_logs` 留下完整 before/after 紀錄。
- 自定模板上傳的圖片需經副檔名、MIME、大小、寬高驗證，並掃描惡意檔頭（避免 SVG 內嵌 script）。
- Admin 密碼以 bcrypt / argon2 雜湊存放；變更密碼端點需驗證舊密碼，並在 `admin_action_logs` 中記錄事件但**絕不**寫密碼明碼或雜湊。
- `admin_action_logs` 不可由 Admin 介面刪除或編輯；如需保留期限政策，需透過資料庫運維程序執行並再開另一份稽核。

## 目前展示版限制

- 使用假資料。
- 尚未串 LINE Login/LIFF。
- 尚未串資料庫。
- 獎品圖片上傳目前只做瀏覽器本地預覽。
- 抽獎結果目前由前端模擬，正式版需改由後端 API 回傳。
- 尚未實作 `accountType` 分流，前端目前所有抽獎皆走「正式會員」邏輯。
- 排行榜目前為硬編碼假名單，尚未對接 `users.totalBurnAmount` / `users.totalLuckAmount` 與 `leaderboard_overrides`。
- 尚未實作成本控管閘門（`minDrawsBeforeWin` / `cooldownDrawsAfterWin` / `payoutCapRatio`）。
- 前端展示版內嵌的 `AdminConsole` 為快速 demo，**正式 Admin 後台不沿用前台紫金色主題**，應以一般 dashboard 風格獨立實作（詳見 `docs/design-spec.md` 的「Admin 後台介面設計規範」）。
