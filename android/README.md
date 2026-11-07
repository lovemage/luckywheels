# 曜金數據助手 Android App

會員在 App 內登入娛樂城、進遊戲；曜金數據助手以面板疊在遊戲上方，收合後變成可拖曳的金色按鈕。

- 遊戲層：`WebView` 載入娛樂城（網址由 `GET /api/public/app-config` 的 `casinoUrl` 下發，預設 `https://www.ds8899.net`）。
- 助手層：`WebView` 載入 `https://luckyds.com/`（同一套會員 SPA）。User-Agent 帶 `LuckyDsApp/<版本>`，SPA 以此進入 App 模式
  （直接開助手、底部多一顆「進入遊戲」），並可呼叫 `window.LuckyApp.collapse()`（`src/native.ts`）。
- App 不讀取、不操作遊戲畫面：不自動投注、不自動遊玩。

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
