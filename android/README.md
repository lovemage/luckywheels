# 曜金數據助手 Android App

會員在 App 內登入娛樂城、進遊戲；曜金數據助手以面板疊在遊戲上方，收合後變成可拖曳的金色按鈕。

- 遊戲層：`WebView` 載入娛樂城（網址由 `GET /api/public/app-config` 的 `casinoUrl` 下發，預設 `https://www.ds8899.net/sty4_home.php?invite_code=su001&c=3`）。
- 助手層：`WebView` 載入 `https://luckyds.com/`（同一套會員 SPA）。User-Agent 帶 `LuckyDsApp/<版本>`，SPA 以此進入 App 模式
  （直接開助手、底部多一顆「進入遊戲」），並可呼叫 `window.LuckyApp.collapse()`（`src/native.ts`）。
- App 只讀遊戲畫面上的文字（機台號、點數、贏分、押注，`assets/game-bridge.js`），並在會員點推薦機台時替他切換機台；
  不按 Spin、不自動投注、不自動遊玩。
- 守護（止盈止損，1.3.0+）：會員在駐守小卡設定停損／停利，網頁依讀到的點數計算本場損益（`src/assistant/dock/guard.ts`），
  撞線時呼叫 `window.LuckyApp.alert(message)`：App 震動、打開駐守小卡並顯示訊息。只提醒，不替會員停止遊戲。
  舊版 App 沒有 `alert`，提醒只在小卡打開時看得到。
- 房間訊號（1.4.0+）：`game-bridge.js` 在遊戲頁每 150ms 讀 `SymbolView` 盤面，偵測「一轉結束」（30 格齊、無消除動畫、維持 0.5 秒）
  後把各符號數量放進 HUD 的 `boards`。網頁（`src/assistant/dock/roomSignal.ts`）比對目前房間的訊號門檻
  （`GET /api/assistant/room-signal`），全部達標時呼叫 `window.LuckyApp.signalHit(message)`：震動並打開訊號浮窗（模式 `signal`）。
  網頁以 `LuckyApp.capabilities()` 含 `signal` 判斷 App 是否支援。
- 免遊偵測（1.5.2+）：`game-bridge.js` 以 `ReelView/fgRemaining`（免遊剩餘次數，平常隱藏）是否顯示判斷免遊中，
  HUD 帶 `fg`、每筆盤面帶 `fg`。房間訊號不比對免遊盤面；守護從買免遊扣款（一次掉超過 10 倍押注）或進入免遊起暫停判斷，
  到免遊結束、贏分入帳或下一轉結束後才恢復（舊版 App 讀不到 `fg`，扣款後最多暫停 3 分鐘）。

## LINE 登入

WebView 與瀏覽器不共用 cookie，所以 App 用 Chrome Custom Tab 走 LINE 登入，再把 session 交回面板：

1. 面板裡的登入按鈕導向 `/api/auth/line/start`，App 攔下來改用 Custom Tab 開 `/api/auth/line/start?app=1`。
2. 回呼完成後不發 session，改導向 `/api/app/handoff?code=…`（一次性、2 分鐘有效），頁面以
   `intent://auth?code=…#Intent;scheme=luckyds-assistant;package=com.luckyds.assistant;end` 開回 App。
3. App 收到後讓面板載入 `/api/app/redeem?code=…`，伺服器在面板的 WebView 設定 session cookie。

相關程式：`server/src/routes/app.ts`、`server/src/app/handoff.ts`、`server/src/routes/auth.ts`。

## 編譯

需要 JDK 17 與 Android SDK（platform 35、build-tools 35）。本機路徑寫在 `local.properties`（不進版控）：

```bash
export JAVA_HOME=~/.local/jdk/current ANDROID_HOME=~/Android/Sdk
./gradlew assembleDebug      # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease    # app/build/outputs/apk/release/app-release.apk（正式簽章）
```

## 簽章金鑰（重要）

`keystore/release.jks` 與 `keystore.properties`（含密碼）**不進版控**，請另外備份到安全的地方。
遺失後新版 APK 無法覆蓋安裝已裝好的 App，會員必須先移除舊版。沒有 `keystore.properties` 時 release 會改用 debug 簽章。

## 發版

1. `app/build.gradle.kts` 的 `versionCode` 加 1、`versionName` 更新。
2. `./gradlew assembleRelease`，複製成 `public/downloads/luckyds-assistant.apk`（會員從 `https://luckyds.com/android/` 安裝說明頁下載），
   並更新說明頁上的版本號。
3. luckyds.com 服務設定環境變數 `APP_LATEST_VERSION_CODE`（新的 versionCode）與 `APP_DOWNLOAD_URL`（https 下載網址），
   舊版 App 開啟時會提示更新。娛樂城網址要換時設定 `APP_CASINO_URL`。
