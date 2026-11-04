# 老虎機數據助手 — 第一階段執行計劃

- 日期：2026-11-01
- 狀態：合約已簽，待啟動
- 合約依據：`docs/老虎機數據助手_新提案參考.html`（2026-10-26，第一階段網頁 PWA 版，NT$65,000）
- 參考：`docs/老虎機數據助手_產品需求規格.md`（PRD）、`docs/PWA示意圖/`、`docs/曜金數據助手_提案與AI交接_V4.html`（舊版，僅供視覺與措辭參考）
- **範圍以「新提案參考」為準**：沿用現有 LINE 會員／積分／後台；**不含金流、不含 Google 登入、不含 AI 美女導流、不含第二階段 App**。PRD 中超出新提案的項目一律不做。

---

## 會議決議（2026-11-02）

1. **工作順序**：先把 ATG 爬蟲（M2）做好，UI 之後再調整。理由是主要 backend 還沒接上，現在先定前端，之後變動會很大。助手畫面的設計風格先維持目前版本（`src/assistant/` 原型）。
2. **登入與輪盤入口統一放在助手裡**：
   - 未登入 → 跳轉 LINE 登入
   - 已登入 → 直接在助手裡面顯示輪盤，不跳到另一個前端
3. **新舊版面並存，會員可以自行切換**：有些會員主要玩百家樂，所以保留舊版輪盤畫面。業主主推老虎機（新版助手），其他推廣人員推百家樂（舊版）。
   - 新版：數據助手外框＋內嵌輪盤
   - 舊版：現有輪盤 SPA，畫面與行為不變
   - 兩版共用同一個 LINE session、積分與抽獎 API，抽獎結果仍只由 `POST /api/draw` 決定
   - **預設顯示新版**（2026-11-02 業主確認）
   - **推廣連結可指定版面**（2026-11-02 業主確認）：後台提供「複製推廣連結」，管理員選擇新版或舊版後複製，例如 `https://luckyds.com/?layout=assistant`、`https://luckyds.com/?layout=classic`
   - 優先順序：網址上的 `layout` 參數 → 會員自己切換過的選擇 → 預設新版。從推廣連結進入時，把該版面記為會員的選擇（之後會員仍可自行切換）。`layout` 值不正確時忽略，視同沒有帶參數
   - 推廣連結經過 LINE 登入跳轉後必須保留 `layout`：目前登入 callback 固定導回 `/`（`routes/auth.ts`）、不帶參數，所以前端一讀到 `layout` 就先寫入 localStorage，再顯示登入。登入回來後從 localStorage 還原，後端登入流程不用改。否則未登入會員從舊版連結進來，登入後會變成新版
   - 切換偏好先存在瀏覽器（localStorage）。若需要跨裝置記住，另開新表，**不在 `User` 加欄位**（第 0.2 節第 4 點）
   - `DATA_ASSISTANT_ENABLED` 關閉時，只有舊版，不顯示切換按鈕

## 業主討論（2026-11-03，紀錄：`docs/曜金數據助手_2026-11-03_討論紀錄.md`）

已定案：
1. **機台資料保存 3 天**後覆寫（折衷：24 小時太短、7 天量太大）；房間走勢與趨勢分析只用 3 天內的資料
2. **綜合分數由我方設計**，業主不指定公式；權重做成後台可調。對會員可說「AI 計算」，但只能是「排序參考」，不得暗示提高中獎機會
3. **本金推薦不看可玩轉數、不選單注**：會員輸入本金＋今日獲利目標（本金的 1–5 倍）；依「本金級距 → 綜合分數門檻」篩選；一律建議單注 10 元以上；推薦理由由本金、目標倍數與房間數據產生
4. **未登入只能停在助手首頁**，其他頁面一律導向登入（M5）
5. **積分與輪盤共用**：儲值滿 5,000 給 1 點積分；積分換使用時長的比例待業主決定（M1 可能不需要「金幣」這一層，待確認）
6. 推薦組數：業主傾向多推幾組（5 組也可以），理由是狀態最快 20 分鐘才更新一次

待確認（業主）：
- 推薦組數最終幾組；本金級距對應的分數門檻；「1–5 倍」指獲利目標還是目標金額上限；1 點積分換幾小時
- **訊號做法**：業主提出 100–200 組 AI 隨機生成的圖組、隨機發送、不綁房間。我方建議折衷：圖組隨機，但每則訊號都綁一間當下符合條件的真實空台，並用該房「今日 RTP 變動 5–10%」判斷是否換訊號。若堅持純隨機，介面不得寫「AI 分析」「數據偵測」「即時訊號」，並標示「隨機組合，僅供娛樂參考」

更正：業主以為採集一輪要 15 分鐘；實測一輪約 5 分鐘（313 秒），每 20 分鐘一輪；細項每輪 1,000 台，全部輪完約 100 分鐘

---

## 0. 站台範圍（最高優先：業主指定）

| 站台 | Railway 服務 | 本案處理 |
| --- | --- | --- |
| **luckyds.com** | `luckywheels`（id `dc04dff7…`，Dockerfile 建置） | **唯一**加入數據助手的站台 |
| ds-lucky.com | `luckywheels-2`（id `97cb09bf…`，Railpack 建置） | **不做任何修改、不升級、不重新部署** |
| super-admin | `super-admin` | 本案不新增功能；只需確保不受影響 |

### 0.1 目前的風險

兩個會員站目前**都從 `lovemage/luckywheels` 的 `main` 自動部署**。只要合併到 `main`，ds-lucky.com 就會一起升級並跑 migration，違反業主要求。

### 0.2 隔離措施（開發前完成，M0）

> **決策（2026-11-01）**：不遷移 Cloudflare，留在 Railway，直接在現有 server 開發；兩個會員站的部署拆開處理。super-admin 目前很少使用，本案不處理它。

1. **線上版本（2026-11-01 查詢）**

   | 服務 | 線上 deployment | 部署來源 |
   | --- | --- | --- |
   | `luckywheels`（luckyds.com） | `ed2d84d`（2026-10-27） | GitHub `main` 自動部署 |
   | `luckywheels-2`（ds-lucky.com） | `ed2d84d`（2026-10-27，deployment `d2b70104…`） | GitHub `main` 自動部署 ← **需拆開** |
   | `super-admin` | 2026-10-27 手動 `railway up`（deployment `3a625a16…`） | **未連 GitHub**，推送不會觸發部署，已隔離 |

2. **拆開 ds-lucky.com**：在 Railway 後台 `luckywheels-2` → Settings → Source → **Disconnect** GitHub repo。
   - 中斷連線不會重新部署，線上的 `ed2d84d` 會繼續運作；之後推送 `main` 不再觸發這一站。
   - **不使用** MCP 的 `connect-service-source`（commitSha 固定）：它會立刻重新建置並部署一次，等於動到這一站（這個服務 2026-10-22 曾經重新部署失敗過一次）。
   - **不主動建立 release 分支。** 只有在需要替 ds-lucky.com 做緊急修正，且使用者明確同意時，才從 `ed2d84d` 建分支。
3. **super-admin**：維持現狀，本案期間不執行 `railway up`。
4. **Schema 規則：只新增資料表，不在既有 model（`User`、`AdminUser`、`AppSetting`…）加欄位。**
   - super-admin 不重新部署，舊版 Prisma client 只會讀舊欄位，所以就算 luckyds.com 的 DB 多了欄位也不會出錯。但如果日後用新 schema 重新部署 super-admin，它讀 ds-lucky 的 DB 時 `User` 會缺欄位而出錯（`superadmin/routes/users.ts` 的 `user.findUnique` 沒有 `select`）。為了保留這個彈性，仍然維持只開新表。
   - 新資料全部放在以 `userId` 關聯的新表。既有的 `User.points` 只讀取／扣除，不改結構。
   - 程式碼裡 ds-lucky.com 停在 `ed2d84d`；`main` 從此只代表 luckyds.com。
5. **功能旗標（第二道保險）**：新增環境變數 `DATA_ASSISTANT_ENABLED`，**只在 `luckywheels` 服務設為 `true`**。
   - 未啟用時：助手 API 回 404、排程不啟動、前台不顯示入口、後台不顯示新選單。
   - 就算日後誤部署到 ds-lucky.com，畫面與行為也不會改變（migration 只新增空表）。
6. **luckyds.com 本身也要防止半成品上線**：拆開後，推送到 `main` 會直接部署到 luckyds.com 正式站（包含執行 migration）。開發期間在本機進行，等每個里程碑測試通過、經使用者同意後才推送；新功能預設由 `DATA_ASSISTANT_ENABLED` 關閉。
7. 驗證方式：每次部署 luckyds.com 後，確認 ds-lucky.com 與 super-admin 的線上 deployment 仍是第 1 步記錄的版本。

---

## 1. 架構總覽

```
luckyds.com（luckywheels 服務，同一個映像檔）
├─ 會員 SPA (src/)            + PWA（manifest / service worker / 推播 / 更新提示）
│   └─ 新增「數據助手」分頁、兌換、房間、推薦、通知中心
├─ 落地頁 /assistant          形象落地頁＋廣告投放頁（同一 SPA 內的公開路由）
├─ Backend (server/)          新增 routes/assistant/*、admin/routes/assistant/*
│   └─ 訊號計算與推播（web-push, VAPID）
├─ Admin UI                    新增選單：數據助手／兌換管理／通知管理
└─ /embed/assistant.js         懸浮助手嵌入程式碼（需娛樂城配合，做法 A）

新服務：atg-collector（同一 Railway 專案，獨立 worker）
└─ 以採集帳號登入娛樂城 → 抓 ATG 房間資料 → 寫入 luckyds.com 的 DB（只連這一個 DB）
```

### 1.1 新增資料表（Prisma，全部新表）

| 範圍 | 資料表 | 重點 |
| --- | --- | --- |
| 錢包／時長 | `AssistantWallet` | `userId` unique、`coins`；扣幣用 `WHERE coins >= cost` 條件更新（同抽獎扣點模式） |
| | `CoinLedger` | 每筆金幣異動：來源（積分兌換／時長兌換／人工）、前後餘額、管理員 |
| | `AssistantPass` | `userId` unique、`startsAt`、`expiresAt`；續兌時從 `max(now, expiresAt)` 往後加 |
| | `AssistantExchange` | 兌換紀錄：積分→金幣、金幣→時長、套用比例與活動倍率、idempotency key |
| 遊戲資料 | `GameProvider`、`Game`、`Room` | 含停用旗標、`minBet`／可投注面額（若來源可取得） |
| | `RoomSnapshot` | 定期快照：狀態、今日 RTP、未開轉數、今日下注、今日損益、`capturedAt` |
| | ~~`RoomDailyStat`~~ | 已移除（機台資料只保存 3 天，趨勢直接由快照計算，不需要每日彙總） |
| | `CollectorRun` | 一次採集批次：狀態、錯誤訊息、完成時間；兼作訊號評估的待處理紀錄（`evalStatus`、`evalAttempts`、`evalLockedAt`） |
| 推薦／訊號 | `RecommendationLog` | 本金輸入、結果房號、分數、理由（JSON） |
| | `SignalRule`、`SignalEvent` | 門檻設定；觸發時間、來源批次、失效時間、冷卻；unique `(ruleId, roomId, collectorRunId)` 去重 |
| 通知 | `PushSubscription` | endpoint、keys、裝置資訊、失效標記 |
| | `NotificationTemplate`、`Notification`、`NotificationDelivery` | 站內通知與推播送出結果（成功／失敗、重試次數）；unique `(notificationId, subscriptionId)` 防止重複推播 |
| 懸浮助手 | `EmbedSession` | 懸浮助手專用憑證：`jti`、`userId`、到期時間、撤銷時間（見 1.4） |
| 行為紀錄 | `MemberLoginLog`、`RoomViewLog`、`OutboundClick` | 登入時間／裝置、房間查看、前往娛樂城點擊 |

新的 `AppSetting` key（後台設定頁可改，不需改程式）：`assistantPointsToCoins`、`assistantCoinsToHours`、`assistantPlans`、`assistantPromoMultiplier`（含起訖時間）、`assistantScoreWeights`、`signalCooldownMinutes`、`assistantCasinoUrl`、`assistantExpiryNoticeHours`、`assistantDataMaxAgeSeconds`、`assistantEmbedOrigins`。
（`AppSetting` 是 key/value 表，新增 key 不會改 schema，不影響 super-admin。）

### 1.2 不可違反的規則

- 推薦結果由**伺服器計算**；前端只顯示。
- 積分→金幣、金幣→時長的扣除都在同一個 `$transaction` 內，條件更新防止超扣，並以 idempotency key 防止重送。
- 所有人工調整（派幣／扣幣／加時／扣時）與規則修改寫入現有 `AdminActionLog`。
- 措辭只用「符合條件」「排序參考」。不得出現中獎機率、預測、保證獲利的字眼；歷史資料加註「僅供比較參考」。缺欄位時顯示「待確認」，不以示意數據代替。
- 不做：自動遊玩、自動投注、自動換房、倍速、免遊劇透、停利停損。

### 1.3 collector → 訊號引擎（DB 待處理紀錄）

collector 與主服務之間不做直接呼叫，以 DB 為唯一交接點：

1. collector 在**同一個 transaction** 內寫入該批 `RoomSnapshot`，並把 `CollectorRun` 標為 `succeeded`、`evalStatus = pending`。批次寫入失敗就整批 rollback，不會留下半套資料。
2. 主服務的訊號 worker 每 N 秒（例如 15 秒）以 `SELECT … FOR UPDATE SKIP LOCKED` 認領最舊的 `pending` 批次，**依批次時間順序**評估。多個 replica 或重啟後重跑都安全。
3. 評估結果寫入 `SignalEvent`。unique `(ruleId, roomId, collectorRunId)` 保證同一批不會重複產生訊號；冷卻時間以「同規則同房間上一次有效訊號」判斷。
4. 推播走 `Notification` → `NotificationDelivery`（unique 去重），發送失敗記錄 `attempts` 並以退避重試，達上限標記 `failed`。
5. **重啟補算**：worker 啟動時先接手 `evalStatus = processing` 且 `evalLockedAt` 超過逾時的批次（視為前一個程序中斷），再處理 `pending`。超過資料有效期限（1.5）的舊批次只更新訊號狀態，**不補發推播**。

### 1.4 懸浮助手的跨站身分驗證

現況：會員 session 是 `HttpOnly`＋`SameSite=Lax` cookie，`requireUser` 只認 cookie。娛樂城頁面載入的 JS 拿不到這個登入狀態（Safari 也會擋第三方 cookie），所以懸浮助手需要獨立的受限憑證：

- **發放**：會員在助手內按「前往合作娛樂城」時，伺服器簽發一次性交換碼（單次使用、60 秒有效），附在娛樂城網址的 URL fragment（`#lw_code=…`）。fragment 不會送到娛樂城伺服器，也不會出現在 Referer。
- **交換**：嵌入程式讀取交換碼並立即從網址移除，再呼叫 `POST /api/embed/session` 換取短效 embed token。token 為獨立密鑰（`EMBED_JWT_SECRET`，與既有三個 secret 不同）簽發的 JWT，`aud = embed`、有效 15 分鐘，`jti` 記錄在 `EmbedSession`。token 只存在記憶體，不寫 localStorage。
- **權限範圍**：只能讀取懸浮面板需要的資料（目前房間、訊號、理由、剩餘時間），不能兌換、不能修改任何資料。
- **來源驗證**：`/api/embed/*` 以 `Authorization: Bearer` 驗證，CORS 只允許 `assistantEmbedOrigins` 白名單，並檢查 `Origin` 標頭。
- **撤銷**：每次請求都重新檢查 `EmbedSession` 是否撤銷、助手 Pass 是否到期、會員是否被列黑名單。會員登出、Pass 到期、管理員扣時或封鎖時，撤銷該會員所有 `EmbedSession`。續用以 refresh 換新 token，最長不超過 Pass 到期時間。
- **需實測**（M0 起與娛樂城確認）：娛樂城的導向流程是否保留 URL fragment；不保留時，改請娛樂城工程端在嵌入時傳入交換碼。若娛樂城不配合，依提案改以推播替代（做法 D）。

### 1.5 資料有效期限（防止推薦過期房間）

- 每個房間以最後一次成功快照的 `capturedAt` 判斷新鮮度；超過 `assistantDataMaxAgeSeconds`（預設值待依實測更新頻率決定，例如更新週期的 3 倍）即視為**逾時**。
- 逾時房間：**排除在推薦結果外**；列表與詳細頁標示「資料逾時」，不顯示空台／使用中狀態；不參與訊號評估。
- 該房間現有的有效 `SignalEvent` 一律標為失效（原因 `stale_data`），不再推播；懸浮助手同步顯示「資料暫停更新」。
- 某遊戲整體採集中斷（`CollectorRun` 連續失敗）時，該遊戲所有房間比照逾時處理；推薦頁顯示「資料暫停更新」，不改用舊資料。
- 資料恢復後由新批次重新評估，不回補中斷期間的訊號。

### 1.6 後台 API 權限

後端 `ADMIN_NAV_KEYS` 新增 `assistant`、`exchange`、`notifications`（`sub-accounts.ts` 的子帳號驗證直接沿用這個 enum）。每支新 API 都用 `requireAdminNav` 檢查，不能只靠前端隱藏選單。

| API | 需要的權限 |
| --- | --- |
| `/api/admin/assistant/providers、games、rooms`（含停用）、`/signal-rules`、`/score-settings`、`/collector-runs` | `assistant` |
| `/api/admin/exchange/settings`（比例、方案、活動倍率）、`/exchange/records` | `exchange` |
| `/api/admin/assistant/members/:id/coins`（派幣／扣幣）、`/members/:id/pass`（加時／扣時） | `exchange`（涉及金幣與時長，不歸 `users`） |
| 會員頁顯示金幣、期限（唯讀） | `users` |
| `/api/admin/notifications/templates`、`/send`、`/deliveries`、冷卻設定 | `notifications` |

- 主帳號（`isMain`）可使用全部 API。
- 整合測試：每支 API 測「無權限的子帳號直接呼叫 → 403」「有權限的子帳號 → 200」「主帳號 → 200」。派幣／加時另測未授權呼叫不會寫入帳本或 `AdminActionLog`。

---

## 2. 里程碑與工作拆解

> 時程從「業主必要資料到齊」（見第 3 節）起算，預估 **4 週**。資料來源（M2）是關鍵路徑，可與 M1 並行。

### M0｜隔離與準備（第 1 週前 2 天）
- [x] 查出 `luckywheels-2`、`super-admin` 的線上版本並記錄（第 0.2 節）
- [ ] 使用者在 Railway 後台中斷 `luckywheels-2` 的 GitHub 連線，確認它的 deployment 沒有變動
- [ ] 懸浮助手跨站驗證可行性：向娛樂城確認導向是否保留 URL fragment、能否加入嵌入程式碼（第 1.4 節）
- [ ] 加 `DATA_ASSISTANT_ENABLED` 旗標與 `server/src/assistant/` 模組骨架
- [ ] 本機測試 DB 跑通；產生 VAPID 金鑰（只設定在 luckyds.com）
- [x] 取得業主的採集帳號，開始 ATG 資料結構實測（M2 前置）
  - 2026-11-02 實測：登入無驗證碼、無 Cloudflare，ATG = `game_store=54`；進入遊戲後的房間資料尚待 Chrome agent 偵察（`2026-11-02-atg-chrome-agent-recon-prompt.md`）

### M1｜兌換與使用期限（第 1 週）

> **2026-11-04 使用者指示：不做「金幣」這一層，積分直接兌換時長。** 預設方案 1 點 = 3 小時、2 點 = 8 小時、3 點 = 24 小時（`assistantTimePlans`，後台可調）；前台介紹頁與兌換頁的方案文案由 API 依方案產生，不寫死。業主正式比例確認前先用此預設。

- [x] Migration `20261104100000`：`AssistantPass`、`AssistantExchange`（不建錢包／金幣帳本）
- [x] `GET /api/assistant/me`：積分、使用期限、剩餘秒數、方案（含文案）
- [x] `POST /api/assistant/exchange`（`idempotency-key` header；body `{ points, expectedHours? }`）：同一會員以 advisory lock 排隊，`WHERE points >= cost` 扣點，續期從 `max(now, expiresAt)` 往後加，過期後重新開通會重設起算時間；方案剛被後台改過時回 409 `EXCHANGE_PLAN_CHANGED`；`GET /api/assistant/exchanges` 使用紀錄
- [x] `GET /api/public/assistant/plans`（不需登入，落地頁用；旗標關閉時 404）
- [x] `requireAssistantPass`：遊戲、房間、推薦、訊號需使用期限內，否則 403 `ASSISTANT_EXPIRED`；`/me`、兌換、兌換紀錄、推薦設定不需要
- [x] `ADMIN_NAV_KEYS` 新增 `exchange`（子帳號可勾選、選單依權限顯示）；`notifications` 待 M4
- [x] 後台「兌換管理」（`/admin/assistant/exchange`）：方案編輯（即時預覽前台文案）、兌換紀錄。活動倍率待業主需要時再加
- [x] 後台會員詳細頁「數據助手使用期限」卡片：狀態、到期、剩餘、人工加時／扣時（扣時最多扣到立即到期）、近 10 筆異動（需 `exchange` 權限）
- [x] 權限測試：只有 `assistant` 權限的子帳號呼叫兌換管理 API 回 403 且不寫入；只有 `exchange` 不能讀推薦設定
- [x] 整合測試：超扣、重送、併發兌換（3 筆同時、只夠 1 筆）、續期計算、過期後重新開通

### M2｜ATG 資料採集（第 1–2 週，**最優先**，與 M1 並行）
- [x] 以測試帳號確認：遊戲清單、房間欄位、**是否有最低投注／面額**、更新頻率、登入方式（是否有驗證碼）— 見 `2026-11-02-atg-recon-report.md`
  - 可取得：房號、狀態圖示、今日 RTP、未開轉數、前一／前二、今日下注、近 30 天下注與 RTP
  - **未見**：今日損益（可推算，待確認定義）、7 日數據、最低投注／面額
  - 資料在 Cocos 畫布內，走 socket.io；房間數據的回應**經過加密**，沒有 REST API
- [x] 業主回覆（2026-11-02）：沒有官方資料來源；採集帳號由 admin 在後台輸入；**只採集戰神賽特 II**
- **採集方式決定（2026-11-02）：不破解 ATG 的加密回應。** 用 Playwright 執行真正的遊戲用戶端，讀取遊戲畫面上已顯示的數字：
  - 數字：優先讀 Cocos 場景樹中 Label 節點的文字（遊戲自己解密後顯示的內容）；讀不到再改截圖＋OCR
  - 機台狀態：直接用伺服器推送的明文 `slotTableUpdated`（`Empty`／`Full`），由頁面內的 WebSocket 監聽取得
  - 每輪重新登入取得遊戲 token（token 會過期）；逐頁切換「選擇機台」1–9 頁，**只讀取，不按「確定」「鎖定」**
- [x] 探測（2026-11-02，報告 8.5）：Cocos 3.7.2，場景樹可讀，**不需 OCR**
  - 列表層：切頁即可讀整頁 500 台（機台號、今日 RTP、狀態、隱藏 roomId），9 頁約 4,500 台
  - 細項層：未開轉數、前一／前二、今日／30 日下注與 RTP，需逐台「選取」才會顯示
- **採集節奏決定（2026-11-02）**
  - 每輪：重新登入取 token → 切 9 頁讀列表層（4,500 台全部）→ 讀一批細項
  - 頻率：**測試期間每 10 分鐘、正式上線每 20 分鐘**，由 `AppSetting`（`atgCollectIntervalMinutes`）調整，不需改程式
  - 細項**輪流全抓**：每輪處理一批（`atgDetailBatchSize`，後台可調），優先順序為「從未抓過 → 細項最舊」，4,500 台輪完一遍再重來；批次大小依測試期實測的單台耗時決定
  - 每台細項記錄自己的 `detailCapturedAt`；前台顯示細項的更新時間，過舊（超過 `assistantDataMaxAgeSeconds`）依第 1.5 節處理
  - 機台狀態：列表層每輪讀一次；兩輪之間用即時推送 `slotTableUpdated` 更新空台／使用中
- [x] 採集核心（`server/src/collector/atg/*`，`npm run collector:once`）實測（2026-11-02）
  - 流程：API 登入 → 轉點 0 進入 ATG 大廳 → 依卡片圖片的資源 ID 按「開始遊戲」（大廳網址上的 token 不能直接開遊戲）→ 開始遊戲 → 選擇機台
  - 機台總數 **4,100 台**（9 頁，第 9 頁只有 100 台）；列表層約 9 秒讀完
  - 細項 300 台：82 秒、平均 **275 ms／台**、0 失敗、欄位皆有值；全部 4,100 台約 19 分鐘
  - 點擊用遊戲按鈕自己的 clickEvents，不需滑鼠座標；切頁偶爾無回應，已加 5 秒重試（最多 3 次）
  - 本機 OS（Ubuntu 26.04）不支援 `playwright install`，本機以 `COLLECTOR_BROWSER_CHANNEL=chrome` 使用系統 Chrome；Railway 部署改用 Playwright 官方 Docker 映像
- [ ] 寫一份資料欄位對照表給業主確認（可取得／不可取得）
  - 狀態（實測）：`machinel_icon`＝空台、`other_icon`＝使用中、`otherLock_icon`＝使用中且已鎖定（預約）；即時推送 `slotTableUpdated` 只有 `Empty`／`Full`，鎖定狀態以列表層讀取為準
  - 今日損益、最低投注／面額：業主也不知道 → 畫面顯示「待確認」，不自行推算
  - 7 日數據：**不提供**（來源沒有；機台資料只保存 3 天，2026-11-03 折衷決定）；趨勢分析只用 3 天內的快照；30 日用來源的「近 30 天」
- [x] `atg-collector` 服務：排程採集 → 單一 transaction 寫入 `RoomSnapshot` 並把 `CollectorRun` 標為待評估（第 1.3 節）
  - 程式：`server/src/collector/{index,collect,settings}.ts`、`atg/{browser,parse,store,scene-helper}.ts`；`npm run collector:dev`（本機跑一輪）、`collector:start`（部署）
  - 每輪：讀 4,100 台列表 → 依「新機台／從未抓過 → 細項最舊」挑 `atgDetailBatchSize` 台（預設 1,000）→ 單一 transaction 寫 Room／RoomSnapshot 並設 `evalStatus = pending` → 刪除超過 **3 天**的快照（2026-11-03 由 24 小時改為 3 天，折衷保存量與趨勢分析；固定值 `SNAPSHOT_RETENTION_HOURS = 72`，不開放設定）。資料量估算：每 20 分鐘一輪約 88 萬筆、每 10 分鐘一輪約 177 萬筆
  - 細項階段最多用掉採集間隔的 80%，且不超過 8 分鐘；同時只允許一輪（有 running 紀錄就略過，超過 20 分鐘的視為中斷）；部署的 `drainingSeconds` 為 900 秒，讓本輪跑完
  - `Room.sourceRoomId` 改為一般索引（不設 unique），來源改配 roomId 時整輪寫入不會失敗
  - 測試 DB：Railway 專案 `luckywheels-test`（`TEST_DATABASE_URL`），與正式 DB 分開
- [ ] 部署：`atg-collector` Railway 服務（Playwright 官方 Docker 映像、只連 luckyds.com 的 DB、`DATA_ASSISTANT_ENABLED=true`、`COLLECTOR_CREDENTIALS_KEY`）
  - [x] 部署檔：`Dockerfile.collector`（build 用 node:22，runtime 用 `mcr.microsoft.com/playwright:v1.60.0-noble`；`playwright` 套件版本釘死為 `1.60.0`，升級時兩邊一起改）、`railway.collector.json`（服務的 `railwayConfigFile` 指向它；無 healthcheck；`drainingSeconds: 900` 讓重新部署時本輪跑完）
  - [ ] 部署順序：先部署 luckyds.com（套用 3 個 migration、後台新頁面）→ 後台輸入採集帳號 → 建 `atg-collector` 服務並設定變數（`DATABASE_URL` 參照 luckyds.com 的 Postgres、`DATA_ASSISTANT_ENABLED`、`COLLECTOR_CREDENTIALS_KEY` 與 luckyds.com 相同）
- [ ] 中斷處理：記錄 `CollectorRun` 失敗；前台顯示「最後更新時間＋異常狀態」，逾時資料依第 1.5 節排除
- [ ] 後台「數據助手管理」：遊戲商／遊戲／房間列表、來源狀態、停用
- [x] 後台「數據採集」頁（`/admin/assistant/collector`，需 `assistant` 權限且旗標開啟）：採集帳號新增／編輯／停用／刪除、採集間隔（5–120 分）與每輪細項台數（0–5000）、最近 30 輪採集紀錄與機台數；API `/api/admin/assistant/collector/*`
- [x] 採集帳號由後台輸入（業主決定，2026-11-02，取代原本「只放環境變數」）：
  - 新表 `CollectorAccount`：帳號、密碼以 AES-256-GCM 加密保存，金鑰 `COLLECTOR_CREDENTIALS_KEY` 只放在環境變數（`luckywheels` 與 collector 兩個服務），不入庫
  - 後台密碼欄位**只能寫入、不能讀回**（顯示「已設定」）；API 回應與 log 都不含密碼；帳號只顯示遮罩（例 `co***01`）；網址只保留 origin
  - 修改、停用寫入 `AdminActionLog`；需 `assistant` 權限
  - 本機開發可繼續用 `.env` 的 `ATG_COLLECTOR_*`（DB 沒有啟用中的帳號時才使用）

### M3｜房間、推薦與訊號（第 2–3 週）
- [x] `GET /api/assistant/games`：遊戲清單（房間數、最近更新時間、整體是否逾時）
- [x] `GET /api/assistant/rooms`：狀態篩選（空台 `idle`／有人 `busy`／被預約 `locked`）、排序（房號、今日 RTP、未開轉數、今日下注＝今日排行）、房號搜尋、分頁、遊戲篩選。綜合分數／精品分數排序待第 3 節第 5 點確認後加入
- [x] `GET /api/assistant/rooms/:id`：詳細資料＋走勢（`?range=24h` 預設、`?range=3d` 整個保存期限，來自 RoomSnapshot）＋來源的近 30 天數據
- [x] 資料逾時（第 1.5 節）：分兩層門檻。列表層 `assistantDataMaxAgeSeconds`（預設 1800 秒）逾時 → 不顯示狀態、不列入狀態篩選；細項層 `assistantDetailMaxAgeSeconds`（預設 10800 秒，細項輪流抓取本來就較舊）逾時 → 回傳 `detailStale`，前台標示「資料較舊」
- [x] 會員守門與抽獎相同（黑名單、未完成綁定、待審核）；旗標關閉時 404；使用期限檢查（M1，2026-11-04 完成）
- [x] 後台可調整兩個逾時門檻（併入「推薦與訊號設定」頁，2026-11-04）
- [x] `POST /api/assistant/recommend`（2026-11-04）：輸入本金＋目標倍數（1–5）→ 只取列表層未逾時的空台 → 分數 ≥ 門檻 → 依分數取前 N 間，每間 2–3 條理由＋情境句＋免責句＋「建議單注 10 元以上」；倍數超過級距上限回 422 `MULTIPLIER_NOT_ALLOWED`；無結果時回空陣列（前端保留輸入、不要求加碼）。`GET /api/assistant/recommend/config` 提供級距與最高倍數給輸入表單
- [x] 綜合分數／精品分數（`server/src/assistant/scoring.ts`、`recommend.ts`）：同遊戲未逾時房間的 mid-rank 百分位加權；細項逾時視同缺值（0.5、不產生理由）；精品＝未逾時空台分數前 `assistantPremiumPercent`%。參數全在 AppSetting：`assistantScoreWeights`、`assistantRecommendTiers`、`assistantMultiplierStepScore`、`assistantRecommendCount`、`assistantMinBetAdvice`、`assistantPremiumPercent`（設定值損壞時退回預設）
- [x] 後台「推薦與訊號設定」（`/admin/assistant/recommend`，需 `assistant` 權限）：權重（顯示實際佔比）、本金級距表、每倍加分、推薦間數、建議單注、精品比例、門檻預覽表、資料逾時、訊號參數、近期訊號（含綁定房號）；API `GET/PUT /api/admin/assistant/settings`、`GET /api/admin/assistant/signals`，存檔寫 AdminActionLog
- [x] 房間列表與詳細資料加入 `score`、`premium`，支援 `sort=score`（`server/src/assistant/board.ts`；逾時房間無分數、排最後）
- [x] 訊號（2026-11-04，`server/src/assistant/signal.ts`、`AssistantSignal` 表）：每位會員同時一則；隨機 2–3 種符號 ×2–×6；綁定一間未逾時、分數 ≥ `assistantSignalMinScore` 的空台（會員端不回傳房間，後台可查）；強度由分數換算；同一間房同時有效上限 `assistantSignalMaxPerRoom`。換組條件在會員讀取時檢查：開過免遊（未開轉數變少或「前一」改變）、今日 RTP 變動 ≥ `assistantSignalRtpChangePoints`、有人／被預約／停用、資料逾時；會員「換一組」有冷卻。API `GET /api/assistant/signal`、`POST /api/assistant/signal/refresh`
  - 「每間房 1–2 組還是 5 組」業主未定：先以「每間房同時最多 2 則有效訊號」實作，後台可調
- [ ] 訊號推播 worker（M4）：認領待評估批次（`SKIP LOCKED`）→ 對開啟通知的會員套用 `endReasonFor` → 推播換組；冷卻與去重
- [ ] 測試：重啟後補算、同批次重跑不重複推播、資料逾時時不推薦也不推播
- [ ] 記錄推薦（`RecommendationLog` 已完成，migration `20261104090000`）、房間查看、前往娛樂城點擊

#### M3 草案：綜合分數、本金推薦與推薦理由（2026-11-03，待使用者與業主確認）

所有數字都存在 AppSetting（後台可調），以下為預設值。

**綜合分數（0–100）**

- 只計算「列表層未逾時」的房間；每輪採集後重算
- 每個指標換成「在同遊戲未逾時房間中的百分位」（0–1），避免極端值（例如今日 RTP 1379%）拉高整體分數；缺值（細項還沒抓到）以 0.5 計，且不產生推薦理由

| 指標 | 欄位 | 方向 | 權重 |
| --- | --- | --- | --- |
| 未開程度 | 未開轉數 | 越多越高 | 35% |
| 今日回饋偏低 | 今日 RTP | 越低越高 | 25% |
| 長期回饋 | 近 30 天 RTP | 越高越高 | 20% |
| 熱度 | 今日下注 | 越高越高 | 20% |

- 分數 = round(100 × Σ 權重 × 百分位)；權重存 `assistantScoreWeights`
- 「精品」標記：未逾時空台中，分數前 5%
- 對會員只顯示分數與「AI 綜合排序參考」，不顯示公式；不得寫提高中獎機會、預測、保證

**本金推薦**

- 輸入：本金、今日獲利目標倍數（1–5 倍）
- 本金級距決定「分數門檻」與「可選的最高倍數」（`assistantRecommendTiers`）：

| 本金 | 分數門檻 | 可選最高倍數 |
| --- | --- | --- |
| 5,000 以下 | 60 | 2 倍 |
| 5,000–9,999 | 70 | 3 倍 |
| 10,000 以上 | 80 | 5 倍 |

- 目標倍數每多 1 倍，分數門檻 +3（以 1 倍為基準；門檻 = 級距分數 +（倍數 − 1）× 3，例：本金 8,000 選 3 倍 = 76 分；2026-11-04 定案）
- 候選：未逾時的空台、分數 ≥ 門檻；依分數排序取前 N 間（預設 5，`assistantRecommendCount`）
- 不足 N 間時照實顯示；一間都沒有時保留輸入，提示「目前沒有符合條件的空台，稍後資料更新再試」，不要求加碼
- 一律附「建議單注 10 元以上」（`assistantMinBetAdvice`）
- 每次推薦寫入 `RecommendationLog`

**推薦理由（每間 2–3 條，取貢獻最大的指標）**

- 未開 {未開轉數} 轉，多於同遊戲 {百分位}% 的機台
- 已超過前兩次平均開出間隔（{前一、前二平均} 轉）
- 今日 RTP {今日 RTP}%，低於多數機台
- 今日下注 {今日下注}，熱度前 {名次百分比}%
- 近 30 天 RTP {近 30 天 RTP}%
- 情境句：「本金 {本金}、目標 {倍數} 倍，符合 {級距} 門檻 {分數} 分」
- 固定附註：「排序參考，不代表遊戲結果」

**訊號（2026-11-03 更新，參考 `docs/threads_crown1188_DfSL9MoEt37.mp4` 與 scarab-heart.com；分析見討論紀錄第九節）**

第一階段（PWA）：

- **內容**：每組訊號隨機 2–3 種符號，各配一個倍數（×2–×6），例如「黃寶石 ×4、紅寶石 ×6」。由程式隨機組合，不預先製作 100–200 張圖
- **符號圖示**：原創 SVG（黃、紅、藍、綠、紫寶石＋特殊符號），黑金風格；不得使用 ATG 遊戲美術
- **綁定房間**：每組訊號從「未逾時、分數 ≥ 訊號門檻的空台」隨機抽一間綁定，後台可追查
- **訊號強度 %**：由綁定房間的綜合分數換算（例：分數 0–100 對映 30–90%），不是亂數
- **換訊號條件**（任一成立就失效並換一組）：
  1. 會員按「免遊結束，換一組」→ 立即換（對應業主看到的「免遊玩完就換訊號」）
  2. 系統偵測到綁定房間開過免遊（兩輪採集之間未開轉數歸零或「前一」轉數改變）→ 自動換，最慢延遲一個採集間隔（約 20 分鐘）
  3. 綁定房間今日 RTP 與發出時相差 ≥ 5 個百分點
  4. 綁定房間變成有人／被預約，或資料逾時
- **文案**：「數據僅供參考，不承諾獲利」；不寫「AI 預測」「勝率」「破解」「包贏」

第二階段（App，另估）才做得到：

- 讀會員當下的盤面，顯示「本盤符合訊號」「本轉未符合訊號條件」
- 會員進入免遊時自動「免遊暫停」，免遊一結束立即換訊號
- 本次損益（PNL）即時顯示

不做（提案排除）：

- 免遊劇透／免遊預覽（例：「本輪免遊預計開 7,163 分」）：這是在讀遊戲預先決定的結果，不是數據參考
- 自動入座、倍速轉輪、停利停損自動收手、自動遊玩

### M4｜PWA 與通知（第 3 週）
- [ ] manifest、圖示、`display: standalone`、iOS 加入主畫面引導頁（對應 `PWA示意圖/01`）
- [ ] Service worker：離線殼層、基本錯誤頁、**新版本提示**（不得快取 `/api/*`）
- [ ] Web Push：訂閱／取消、`PushSubscription`；失效 endpoint（404/410）自動標記
- [ ] 通知類型：訊號、開通成功、到期前、金幣不足、推薦房間更新
- [ ] 站內通知中心
- [ ] 後台「通知管理」：範本、手動推播、發送紀錄、成功／失敗、冷卻時間
- [ ] 實機測試：iOS 16.4+（必須已加入主畫面才能收推播）、Android Chrome

### M5｜前台畫面、落地頁與懸浮助手（第 3–4 週）
- [x] 上線前預覽入口（2026-11-04）：`DATA_ASSISTANT_ENABLED=preview` 時首頁右上顯示「新版預覽」，輸入預覽帳密（`PREVIEW_ACCOUNT`／`PREVIEW_PASSWORD`，預設 admin／test99888）才進得去；一般會員只能留在原輪盤頁。預覽模式下會員端助手 API 只認預覽 cookie，其餘一律 404；後台與採集照常運作。正式上線改為 `true`，入口改由下方的新舊版面切換取代
- [ ] 新舊版面切換（會議決議第 3 點）：新版＝助手外框＋內嵌輪盤；舊版＝現有輪盤畫面不變；會員可自行切換並記住選擇
- [ ] 助手內統一登入：未登入顯示 LINE 登入，已登入直接顯示輪盤（沿用 `session.ts` 的 phase 狀態機，不另做登入流程）
- [ ] 後台「複製推廣連結」：選擇新版／舊版 → 產生帶 `?layout=` 的網址並複製（放在首頁設定頁；旗標關閉時隱藏）
- [ ] 測試：兩版切換後 session、積分、抽獎結果一致；旗標關閉時只有舊版、沒有切換按鈕
- [ ] 測試：未登入會員從 `?layout=classic` 進入 → LINE 登入 → 回來仍是舊版；無效的 `layout` 值顯示預設新版
- [ ] 前台：在 BottomDock 新增「數據助手」分頁；助手首頁、本金輸入、推薦、房間列表、房間詳細、兌換、通知中心、使用紀錄、常見問題（依 `PWA示意圖` 與黑金視覺）
- [ ] 落地頁 `/assistant`：Hero、精選機台、功能介紹、本金推薦流程、訊號通知、PWA 安裝、積分兌換說明、FAQ、使用限制、登入入口
- [ ] 懸浮助手 `/embed/assistant.js`（做法 A）：可收合、可拖曳、顯示目前房間／訊號／理由／剩餘時間
  - 交換碼 → embed token、`/api/embed/*`、Origin 白名單、撤銷機制（第 1.4 節）
  - 測試：過期／撤銷／黑名單／非白名單 Origin 皆被拒；登出後懸浮面板失效
  - 娛樂城不配合時，以推播通知替代（做法 D，已含在本案）
  - iframe 方式（做法 B）只做可行性實測並回報
- [ ] 前往合作娛樂城：外連網址由後台設定，記錄點擊
- [ ] 後台前端：子帳號設定頁可勾選新增的三個權限；選單依權限顯示（後端權限已在 M1 完成）

### M6｜測試、部署與交接（第 4 週）
- [ ] 後端整合測試＋admin-ui 測試全數通過；`npm run build` 三個 app 型別檢查通過
- [ ] 部署前備份 luckyds.com 的 DB
- [ ] 只部署 `luckywheels` 服務；部署 collector 服務；設定旗標與 VAPID
- [ ] **確認 ds-lucky.com 與 super-admin 的 deployment 沒有變動**，並抽測 super-admin 讀取兩站會員正常
- [ ] 逐項驗收（第 4 節）；交付操作文件與一次線上交接

---

## 3. 開工前需業主提供／確認

**擋住進度（必須先有）**
1. ~~娛樂城採集帳號（未使用過的測試帳號）與指定娛樂城網址~~（2026-11-02 已取得，設定在 `.env` 的 `ATG_COLLECTOR_*`）
2. ~~第一版支援的 ATG 遊戲清單~~（2026-11-02 確認：只做戰神賽特 II）
3. 積分→金幣、金幣→時長的正式比例（初步：1 點 = 3 金幣、1 金幣 = 3 小時；待選：1 點 = 24 小時）與兌換方案
4. 合作娛樂城的前往網址；是否有房間 Deep Link

**M3 前確認**
5. 推薦分數／精品分數的計算規則與門檻。可用欄位只有：狀態（空台／有人／被預約）、今日 RTP、未開轉數、前一／前二開出轉數、今日下注、近 30 天下注、近 30 天 RTP（沒有今日損益、沒有最低投注）
5-1. **本金推薦的替代規則**：來源沒有最低投注／面額，無法直接比對本金。請業主提供戰神賽特 II 的固定投注級距（例如最低單注金額），或指定其他篩選方式
6. 訊號類型、觸發條件、冷卻時間
7. 金幣是否也能兌換輪盤權益；是否需要「1 金幣解鎖 10 分鐘」這類單項短時解鎖（若需要則屬範圍外，另議）

**M5 前確認**
8. 娛樂城工程端是否配合嵌入懸浮助手（不配合 → 以推播替代）
9. 落地頁品牌名稱、素材、文案；是否需要 GA4／Meta Pixel（新提案未列，需確認是否納入）
10. 落地頁是否使用 luckyds.com 的子路徑，或另外的網域
11. ~~新舊版面預設顯示哪一版；推廣連結是否需要能指定版面~~（2026-11-02 確認：預設新版；後台可複製新版／舊版推廣連結）

---

## 4. 驗收對照（新提案第 15 節）

| 驗收項目 | 對應里程碑 |
| --- | --- |
| LINE 登入、沿用現有會員、不需另建帳號 | 既有功能＋M1 |
| 以遊戲代幣兌換後即可使用助手；顯示積分、金幣、到期與剩餘時間；依後台比例兌換 | M1 |
| PWA 可加入 iOS／Android 主畫面、可更新、可接收通知 | M4 |
| ATG 遊戲與房間列表、房號搜尋、條件篩選 | M2＋M3 |
| 輸入本金顯示推薦房間，每筆附推薦理由；房間詳細與趨勢 | M3＋M5 |
| 接收訊號通知 | M3＋M4 |
| 前往合作娛樂城 | M5 |
| 娛樂城開放嵌入時可顯示及收合懸浮助手 | M5 |
| 不會自動遊玩或自動投注 | 全程（不實作） |
| 後台管理金幣、時長、比例、房間、推薦規則、通知；子帳號權限控制新選單 | M1–M5 |
| 所有積分、金幣、時長與管理操作均有紀錄 | M1＋全程 |
| **另一站台功能不受影響** | M0＋M6 部署檢查 |

---

## 5. 風險與對策

| 風險 | 影響 | 對策 |
| --- | --- | --- |
| ATG 資料無法穩定取得（登入驗證、反爬、欄位不足） | 推薦與訊號無法驗收 | M0 先實測；欄位對照表給業主簽認；缺欄位顯示「待確認」，不以假資料驗收 |
| ATG 資料在遊戲畫布內、通訊經 protobuf 且疑似加密（2026-11-02 偵察） | 採集成本與維護成本高；ATG 改版即可能失效 | 先錄 socket.io 訊息評估；不可解析則改 Playwright＋OCR；同時詢問業主有無官方資料來源 |
| 採集帳號被娛樂城／ATG 判定異常而封號 | 資料中斷 | 事先取得業主書面同意；控制採集頻率；準備備用帳號 |
| 來源沒有最低投注／面額 | 「依本金推薦」無法精準比對 | 改用業主確認的替代規則（如依遊戲固定面額表），事先書面確認 |
| 誤部署到 ds-lucky.com | 違反合約範圍 | 停用自動部署＋功能旗標＋部署後檢查（第 0.2 節） |
| 採集中斷仍推薦舊資料 | 推薦錯誤房間、誤發推播 | 資料有效期限，逾時排除推薦並使訊號失效（第 1.5 節） |
| 懸浮助手無法取得登入狀態 | 面板無法顯示付費資料 | 交換碼＋短效 embed token；M0 先與娛樂城實測（第 1.4 節） |
| super-admin 讀取 schema 不一致 | 跨站總管出錯 | 只新增資料表；super-admin 凍結；M6 抽測 |
| iOS 推播限制（需 16.4+ 且已加入主畫面） | 部分使用者收不到推播 | 安裝引導頁說明；站內通知作為後備 |
| 娛樂城不配合嵌入 | 懸浮助手無法上線 | 依提案改以推播替代（做法 D）；App 方式屬第二階段另估 |
| collector 與主服務共用 DB 負載 | 前台變慢 | 快照批次寫入、只保存 3 天（每輪清理）、房間列表查詢加索引 |

---

## 6. 第二階段 App：範圍確認與可能問題（2026-11-03 調查）

業主提出「依對方規格製作 iOS（TestFlight）與 Android App」。以下為查閱提案文件後的結論，以及第二階段開工前必須先處理的問題。**本節不屬於第一階段範圍，不在本計劃內實作。**

### 6.1 提案文件的範圍

- `docs/老虎機數據助手_新提案參考.html`（範圍依據）：
  - 第一階段（NT$65,000）＝**網頁 PWA**。驗收寫的是「可將 PWA 加入 iOS、Android 手機主畫面」，不是 App。
  - 第 08-1 節「第二階段：懸浮助手 App（SDK／APK 方式）」：**另估**，第一階段完成後另行報價；App Store／Google Play 上架費用另估。
  - 第二階段預定內容：App 內以會員自己的娛樂城帳號登入並開啟遊戲、懸浮助手疊在遊戲畫面上、遊玩紀錄（遊戲、房號、起訖時間、轉數、下注金額、贏分、本次損益／累計下注／本次 RTP，上傳後台）。原文註明「可記錄的欄位以遊戲畫面實際可取得的資料為準，開發前實測確認」。
  - 交付方式：Android 提供 APK；iOS「提供安裝檔與安裝教學；未上架 App Store 時，需依憑證方式安裝」。
- `docs/曜金數據助手_提案與AI交接_V4.html`：「原生 App」「持續手動遊玩紀錄」列在「後續擴充與本期之外」。
- 三份提案文件都**沒有提到 TestFlight**。
- 目前沒有收到「對方的 App 規格」文件；收到後需逐項對照第 08-1 節，列出差異再報價。

### 6.2 哪些資料需要 App

| 資料 | 取得方式 | 是否需要 App |
| --- | --- | --- |
| 機台數據（約 4,100 台的狀態、RTP、未開轉數、下注額、近 30 天） | 伺服器端 `atg-collector` 以一組採集帳號讀取（M2，已實測：一輪約 313 秒） | 不需要（第一階段已完成） |
| 會員本人的遊玩紀錄（每次下注、轉數、贏分、本次損益） | 只存在於會員自己的遊戲畫面；網頁／PWA 無法讀取其他網站內容 | **需要**：App 以內建瀏覽器開啟遊戲才能讀取（第二階段） |

結論：第一階段的資料採集不受影響；「個人遊戲助手」的下注紀錄才需要 App 外殼。

### 6.2-1 平台順序（2026-11-04 定案）

- 第二階段**先做 Android App**（APK）；**iOS 會員先用 PWA**
- iOS App 之後再評估是否送 TestFlight 外部審查（Beta App Review，博弈相關內容被拒機率高）
- 不採用企業憑證或超級簽名（違反 Apple 條款、會掉簽）；同類工具聖甲之心目前也只有 Android，賽特之眼 iOS 已證實用企業憑證（2026-11-04 查 seth-eye.com/download：Safari 安裝 →「未受信任的企業級開發者」→ 設定「VPN 與裝置管理」信任 → 重新開機；示例開發者名稱為無關的土耳其公司「MIGROS TICARET A.S.」，並註明名稱可能不同，推測借用或外流的企業憑證、會輪換）

### 6.3 第二階段可能發生的問題

| 問題 | 說明 | 開工前要做的事 |
| --- | --- | --- |
| **範圍與報價** | 提案明訂第二階段另估；依「對方規格」製作屬範圍變更 | 取得對方規格 → 與第 08-1 節對照 → 另行報價與排程 |
| **iOS TestFlight 審查** | TestFlight 需 Apple Developer 帳號（年費）；外部測試者需通過 Beta App Review。與娛樂城／博弈相關、內含娛樂城登入與遊戲畫面的 App，審查限制多，可能無法通過 | 先確認 iOS 發佈路徑；評估以 App Store 規範可接受的形式送審 |
| **iOS「憑證方式安裝」** | 若指企業憑證（Enterprise Program），Apple 條款不允許發佈給一般使用者，憑證可能被撤銷導致 App 全部失效 | 不採用企業憑證對外發佈；另行確認可行方式 |
| **Android APK 側載** | 會員需允許「安裝未知來源 App」；Play Protect 可能警告；更新需自行提供機制 | 下載頁＋安裝教學；App 內版本檢查與更新提示 |
| **Google Play 政策** | 博弈相關 App 需符合 Google Play 真錢博弈政策（地區與執照限制） | 預設不上架，以 APK 交付；如需上架另行評估 |
| **遊玩紀錄欄位不確定** | ATG 遊戲畫面在 Cocos 畫布內，可讀欄位需實測（同 M2 做法：讀場景樹，不解密通訊） | 第二階段開工前做一次欄位實測，欄位對照表給業主確認 |
| **App 內開啟娛樂城遊戲** | 娛樂城或 ATG 可能限制 WebView（User-Agent 檢查、Cookie、第三方登入、iframe 政策） | 先以實機測試 WebView 開啟、登入與進入遊戲 |
| **ATG 改版** | 場景樹節點名稱改變時，App 端的讀取會失效（與 collector 同樣風險） | 讀取邏輯集中、可遠端更新規則；後台監看讀取失敗率 |
| **會員娛樂城帳密** | 會員在 App 內登入自己的娛樂城帳號，帳密不得經過或存在我方伺服器 | App 只在本機登入，不回傳帳密；隱私說明寫明 |
| **與助手網站共用會員／時長** | App 需沿用 LINE 登入、積分、金幣與使用時長 | App 登入沿用現有會員系統（不另建帳號），API 沿用第一階段 |
| **不得代替玩家操作** | 提案明訂不提供自動下注、自動遊玩、自動選房、倍速、免遊劇透、停利停損 | App 只讀取與顯示，不注入點擊或操作 |
