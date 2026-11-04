# ATG 資料採集偵察報告

- 日期：2026-11-02
- 執行：Chrome agent（使用者本人登入），指令見 `2026-11-02-atg-chrome-agent-recon-prompt.md`
- 站點：DS大怒神娛樂城 https://www.ds8899.net
- 偵察遊戲：戰神賽特 II（`gn=golden-seth`，`gt=slot-erase-any-times-2`）
- 範圍：只看、不下注、不按 Spin、不按「確定／鎖定」；token、cookie、密碼皆未寫入本報告

## 1. 登入與 session

- 由使用者本人在 Chrome 登入，agent 未接觸帳密。
- 主站登入狀態在偵察期間（約 1 小時）維持有效。
- 遊戲大廳的連結帶 `t=` token，會過期：第一次進入大廳後，點「開始遊戲」沒有反應；重新從主站走一次入口取得新連結後即成功。**採集程式每次執行應重新取得 token，不可重用舊連結。**
- 驗證碼／簡訊／裝置綁定：本次偵察未見。（Claude Code 以 curl 實測，主站登入無驗證碼。）

## 2. 進入 ATG 的路徑

1. 主站首頁 `https://www.ds8899.net/sty4_home.php` → 上方選單「電子」→「ATG電子」卡片
2. 新分頁 `https://www.ds8899.net/check_games.php`（標題「轉點」）：主帳戶與 ATG電子 餘額皆 0，按鈕為「轉點進入」「全轉進入」。金額留空按「轉點進入」即可進入，未轉任何點數。
3. 新分頁 ATG 大廳：`https://play.godeebxp.com/egames/lobby/game/?t=<redacted>&l=zh-tw&socket_url=socket.godeebxp.com&ts=<ts>&dark=1`
4. 點遊戲卡的「開始遊戲」→ 遊戲頁：`https://play.godeebxp.com/egames/22020103…/game/?t=<redacted>&gn=golden-seth&l=zh-tw&ct=slot&gt=slot-erase-any-times-2&socket_url=socket.godeebxp.com&client_type=web&p=atg&view_mode=landscape&goback_url=<redacted>`
5. 遊戲載入完成後出現開始畫面，點畫面下方「開始遊戲」→ 跳出「選擇機台」視窗（＝選房頁）。

## 3. ATG 遊戲清單

大廳共 11 款，分「ATG 電子」與「ATG 街機」兩個分頁，每款一組資源 ID（40 碼 hash）。

| 分類 | 遊戲（畫面上可辨識） | 備註 |
| --- | --- | --- |
| 電子 | 戰神賽特 II、暴風獵手、金蓮三缺一、惡魔血域、古神巴風特、虎小妹 | 其餘卡片僅見圖片，未辨識名稱 |
| 街機 | 幸運三重 | 僅 1 款 |

- 戰神賽特 II 資源 ID：`22020103b31b7390f07b1551e8538589b5e51967`；其餘遊戲的 ID 與 `gn`／`gt` 參數未逐一取得。
- 大廳載入時沒有 API 取得清單，清單寫死在前端 JS。
- 只有戰神賽特 II 確認有「選擇機台」。其餘遊戲是否有、欄位是否相同，未確認。

## 4. 房間欄位對照表

「選擇機台」視窗：上方分頁 1～9（目前在 6，機台編號 2501 起，每頁 10 欄），可切「顯示全部／顯示空桌」。

| 欄位 | 畫面上的名稱 | 可取得 | 來源 | 範例值 | 備註 |
| --- | --- | --- | --- | --- | --- |
| 房號（機台號） | 機台／磁磚上的數字 | 是 | 畫布 | 2501、2815 | 分頁 6 起於 2501；其他分頁範圍未記錄 |
| 狀態 | 磁磚圖示 | 是（需解讀） | 畫布 | — | 「人像掃描」「人像加鎖」「灰色老虎機」三種圖示 |
| 今日 RTP | 磁磚下方百分比；細項「今日 得分率」 | 是 | 畫布 | 2501：114.44%；2815：84.64% | 兩處一致 |
| 未開轉數 | 「免費遊戲 未開 N 轉」 | 是 | 畫布 | 2815：222；2501：83 | 需先點選該機台 |
| 前一／前二 | 「前一 N 轉開」「前二 N 轉開」 | 是 | 畫布 | 2815：17／63；2501：0／128 | 前兩次免費遊戲相隔轉數 |
| 今日下注 | 「今日 總下注額」 | 是 | 畫布 | 2815：279,185.00；2501：342,560.00 | |
| 今日損益 | — | 未見 | — | — | 可由下注額 ×（得分率 − 1）推算，需業主確認定義 |
| 7 日數據 | — | 未見 | — | — | 面板只有「今日」與「近 30 天」 |
| 30 日數據 | 「近 30 天」總下注額、得分率 | 是 | 畫布 | 2815：14,360,212.40／97.25%；2501：104,299,797.24／97.17% | |
| 最低投注／面額 | — | 未見 | — | — | 選房頁沒有；可能在機台內 |
| 鎖定 | 「鎖定」鈕、鎖頭圖示 | 是 | 畫布 | — | 「24 小時內，可鎖定機台 60 分鐘 乙次」 |

狀態圖示意義未確認：2501 點選後「選取」鈕為灰色不可按，2815 的「確定」鈕可按。

## 5. 資料請求（socket.io）

大廳與遊戲載入期間只有靜態資源，沒有 XHR/fetch 資料請求。房間資料走 **socket.io v4**（WebSocket），連線 `socket.godeebxp.com`。（agent 在頁面內攔截 `WebSocket.prototype.send` 與 message 事件取得，token 以 `<long>` 取代。）

- Engine.IO 心跳：客戶端送 `2`、伺服器回 `3`，約每 25 秒。

**客戶端 → 伺服器（事件，帶 ack）**

| 事件 | 參數 | 回應 |
| --- | --- | --- |
| `getSlotTables` | `{"page":2,"token":"<long>","locale":"zh-tw"}` | 二進位 ack（封包類型 6，1 個附件，約 26–29 KB）；「選擇機台」一頁，頁碼 1–9 |
| `getSlotTableDetail` | `{"roomId":307163,"token":"<long>","locale":"zh-tw"}` | 二進位 ack（約 290 bytes）；點選機台後的細項面板 |

- `token` 與遊戲網址 `t=` 同類。`roomId` 是內部 ID（例 307163），不是畫面機台號；對照關係在 `getSlotTables` 回應內。

**伺服器 → 客戶端（推送，純文字 JSON）**

```
42["slotTableUpdated",{"307642":"Empty","351996":"Empty"}]
42["slotTableUpdated",{"306512":"Full"}]
42["notify",{"type":"jackpotUpdate","data":{"jp-mini":1794.03,"jp-minor":13077.73,"jp-major":82438.47,"jp-grand":235895.38}}]
42["notify",{"data":{"text":"恭喜玩家…在暴風獵手獲得MegaWin彩金…於19桌","html":"…"}}]
```

- `slotTableUpdated`：key 為 roomId，值 `Empty`／`Full`，機台即時狀態。
- `notify`：彩金池金額、中獎公告。

**二進位回應**：兩者開頭皆 `04 01`，其後為高熵資料（Shannon 熵 7.99／7.27 bits/byte），不是 protobuf 或 zlib 明文，**判斷為加密**。前端載入 forge、CryptoJS、pako、protobuf 與 `.pem`。agent 未嘗試破解。

## 6. 更新頻率

- 機台狀態（Empty／Full）：伺服器推送，約每 5 秒一批，每批 1–3 台。
- 彩金池：推送，約每 10 秒。
- RTP、下注額、未開轉數：**不推送**，要送 `getSlotTables`／`getSlotTableDetail` 才回傳。隔數分鐘重看數字會變（2501：114.44% → 114.43%；2506：96.31% → 96.25%）。採集需輪詢；伺服器頻率限制未測。

## 7. 反爬／風險觀察

- 主站與大廳沒有 Cloudflare 驗證頁。
- 遊戲連結 `t=` token 會過期，每輪需重新取得。
- 資料在 Cocos 畫布內，DOM 沒有文字。
- 房間數據的回應經過加密，屬 ATG 的保護機制。
- 事件參數只有 token、locale、page／roomId，未見簽名、時間戳、nonce。頻率限制與 Referer／Origin 要求未測。
- 帳號風險：採集帳號重複進入、選機，可能被視為異常行為。
- 2026-11-03（二）10:00–12:00 ATG電子 維護。

## 8. agent 建議的採集方式

- 主線：Playwright 取 token → socket.io-client 直連 → 輪詢 `getSlotTables`（1–9 頁）與 `getSlotTableDetail`，監聽 `slotTableUpdated`。**前提是解開加密回應**，agent 指出自行逆向有合約與法律風險。
- 備案：Playwright 在「選擇機台」畫面截圖 OCR。

## 8.5 場景樹探測結果（實測）

Chrome agent 在使用者已登入、停在「選擇機台」的遊戲分頁內，執行 `scripts/atg-scene-probe.mjs` 的 `dumpScene()` 邏輯。只讀文字節點，沒有解密、沒有送事件、沒有按「確定」「鎖定」。

- 引擎：**Cocos Creator 3.7.2**，`window.cc` 可存取。
- 文字節點 1,638 個（顯示中 1,063）。
- **每分頁 500 台、一次全部讀得到**：分頁 n ＝ 機台 `(n−1)×500+1` ～ `n×500`（分頁 3＝1001–1500、分頁 6＝2501 起），9 分頁約 4,500 台。

**列表層**（每台一個 `SlotTableItem2` 節點，切頁即可讀到整頁）

| 節點 | 內容 | 範例 |
| --- | --- | --- |
| `content/number` | 機台號 | 1001 |
| `content/rate` | 今日得分率（RTP） | 92.31% |
| `content/roomId`（隱藏） | 內部 roomId，與 `slotTableUpdated` 的 key 對照 | 1001 ↔ 306110（500 筆不重複） |
| `content/icon` 的 spriteFrame 名稱 | 狀態 | 見下表 |

| spriteFrame | 意義（以「顯示空桌」開關驗證） | 本頁數量 |
| --- | --- | --- |
| `machinel_icon`（灰色老虎機） | 空桌 | 102 |
| `other_icon`（人像） | 使用中 | 346 |
| `otherLock_icon`（人像加鎖） | 使用中且已被鎖定（預約） | 52 |

**細項層**（要先「選取」該機台，遊戲才會請求並顯示）

| 節點 | 內容 | 範例（機台 1001） |
| --- | --- | --- |
| `slotTableNumber` | 機台號 | 1001 |
| `notOpenContent/number` | 未開轉數 | 109 |
| 前一／前二 | 前兩次免費遊戲相隔轉數 | 2／4 |
| `scoreCol/hourMask/hour`、`scoreCol/dayMask/day` | 今日／近 30 天總下注額 | 231,384.80／132,214,952.99 |
| `rateCol/hourMask/hour`、`rateCol/dayMask/day` | 今日／近 30 天得分率 | 92.31%／94.45% |

- 本頁 RTP：最小 47.73%、最大 221.81%、平均 101.00%。
- 其他可讀：四個彩金池（grand／major／minor／mini）、跑馬燈中獎公告。
- 仍缺：今日損益、7 日數據、最低投注。
- **採集含意**：列表層一次讀整頁，成本低；細項層要逐台選取，4,500 台逐一選取的負荷與帳號風險需另行評估。

## 9. 尚未確認

- ~~機台共幾頁、各頁範圍~~（8.5：每頁 500 台、9 頁）
- ~~roomId 與畫面機台號的對照~~（8.5：隱藏節點 `content/roomId`）
- socket.io 連線的 auth／query 參數、headless 能否用同一 token 重連、同時連線上限。

## 10. 業主回覆（2026-11-02）

1. 官方資料來源：**沒有**。
2. 採集帳號：**由 admin 在後台自行輸入爬蟲用帳號**。
3. 磁磚圖示（使用者判斷）：空台／被預約／有人。→ 8.5 實測：空桌／使用中／使用中且已鎖定。
4. 今日損益、7 日數據、最低投注／面額：**不知道**。
5. 採集遊戲：**只做戰神賽特 II**。
