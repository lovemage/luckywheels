# ATG 資料採集實測 — Chrome Agent 指令

- 日期：2026-11-02
- 用途：M2 前置實測（見 `2026-11-01-data-assistant-execution-plan.md` 第 2 節 M2）
- 使用方式：把下方「Prompt」整段貼給 Chrome agent，並把 `{{CASINO_URL}}` 換成實際網址。

## 已由 Claude Code 確認（2026-11-02，curl 實測）

| 項目 | 結果 |
| --- | --- |
| 網站 | `https://www.ds8899.net`（DS大怒神娛樂城），nginx + PHP，jQuery；手機版會轉到 `/mobile/` |
| 反爬 | 首頁與登入**沒有** Cloudflare／WAF 驗證頁 |
| 登入 | `POST /mobile/op/sty1_home_op.php?pdisplay=login`，body `userid`、`passwd`、`lang=tw`；**沒有驗證碼**；成功時回 `location.reload()`，session 為 `PHPSESSID` cookie |
| 回應格式 | 所有 `op/*.php` 都回 `{"root":{"ajaxdata":[{"spanid","rtntext"}]}}`，`spanid=javascript` 時前端會 eval |
| ATG 入口 | 首頁 `check_games('54')` → **ATG電子 = `game_store=54`**；轉點畫面顯示主錢包 0、ATG 錢包 0 |
| 進入遊戲 | 「進入遊戲」→ `check_games.php?game_store=54&type=0` → `POST op/check_games_op.php?pdisplay=confirm_btn_action`（`transfer_quota=0`）→ 回傳 ATG 遊戲的啟動網址（**這一步尚未執行**） |
| 維護 | 公告顯示【ATG電子】維護時間 11/3 (二) 10:00~12:00，實測請避開 |

Chrome agent 只需要從「進入 ATG 遊戲」開始往下偵察。

## 執行前（使用者自己做）

1. 在 Chrome 開新分頁，打開娛樂城網址，**自己輸入採集帳號密碼登入**（如有驗證碼也自己完成）。
2. 登入成功後再啟動 Chrome agent。**不要把帳號密碼貼給 agent。**
3. 登入時記下：是否有圖形驗證碼／簡訊驗證／裝置綁定、登入後 session 大約多久失效。

---

## Prompt

```
你是資料結構偵察員。目標是了解娛樂城中 ATG 遊戲房間資料的取得方式，供後續寫自動採集程式。
我已經在目前的 Chrome 分頁登入娛樂城：{{CASINO_URL}}

## 絕對禁止
- 不下注、不轉動、不按「開始／Spin／自動」等任何遊玩按鈕
- 不儲值、不提款、不領取優惠、不修改帳號資料或密碼、不登出
- 不點擊任何會扣款或改變帳戶狀態的按鈕；不確定時先停下來問我
- 不把 cookie、token、密碼完整寫進報告（只寫名稱，值用 <redacted>）

## 要做的事
1. 在首頁點「ATG電子」（game_store=54）→ 轉點畫面**不要輸入金額、不要按「確認轉點」或「全部轉點」**，
   只按「進入遊戲」。記錄新分頁打開的網址網域（token 類參數改 <redacted>），以及之後每一步的網址。
2. 列出 ATG 底下的遊戲清單（遊戲名稱、遊戲 ID 若可見）。
3. 進入遊戲大廳／選房頁（**只停在選房頁，不進入遊玩**），記錄每個房間可見的欄位，例如：
   房號、狀態（空台／使用中）、今日 RTP、未開轉數、今日下注、今日損益、
   7 日／30 日數據、最低投注／可投注面額、其他任何數字或標籤。
4. 打開 DevTools → Network：
   - 找出提供房間資料的請求（XHR/fetch 或 WebSocket），記錄：
     方法、URL（query 中 token 類參數改 <redacted>）、必要 header 名稱（Authorization、自訂 header）、
     回應格式（JSON 範例，擷取 2–3 筆房間即可，敏感值改 <redacted>）
   - 若是 WebSocket：記錄連線 URL、訊息格式範例、推送頻率
   - 判斷資料是在 DOM 直接渲染、API 回傳，還是嵌在 iframe（記下 iframe 的網域）
5. 停在選房頁觀察 2–3 分鐘：資料多久更新一次？是輪詢（多少秒一次）還是推送？
6. 檢查是否有反爬機制跡象：Cloudflare 驗證頁、簽名參數（如 sign / timestamp / nonce）、
   請求頻率限制、需要特定 Referer / Origin。
7. 每個關鍵頁面截圖（遊戲商列表、ATG 遊戲列表、選房頁、Network 中的資料請求）。

## 輸出
用 Markdown 產出報告，結構如下，最後整份給我：

### 1. 登入與 session
### 2. 進入 ATG 的路徑（每步網址）
### 3. ATG 遊戲清單
### 4. 房間欄位對照表
| 欄位 | 畫面上的名稱 | 是否可取得 | 來源（DOM/API 欄位名） | 範例值 | 備註 |
（必列：房號、狀態、今日 RTP、未開轉數、今日下注、今日損益、7/30 日數據、最低投注/面額）
### 5. 資料請求（API / WebSocket）細節與回應範例
### 6. 更新頻率
### 7. 反爬／風險觀察
### 8. 建議的採集方式（純 API 呼叫 vs 需 headless 瀏覽器）與理由
### 9. 尚未確認／需要問業主的事項
```

---

## 回收報告後

把 agent 的報告存成 `docs/plans/2026-11-02-atg-recon-report.md`，交給 Claude Code 進行：
- 更新資料欄位對照表給業主確認
- 決定 `atg-collector` 的實作方式（HTTP 直連或 Playwright）
