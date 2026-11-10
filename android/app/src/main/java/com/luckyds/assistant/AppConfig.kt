package com.luckyds.assistant

import android.content.Context
import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * App 啟動設定，來自 GET {ASSISTANT_ORIGIN}/api/public/app-config。
 * 讀不到（離線、逾時）時沿用上次成功的值，再沒有就用 BuildConfig 預設值。
 * 1.5.0+：帶上面板 WebView 的登入 cookie，伺服器據此讓測試會員開測試用的娛樂城網址。
 */
data class AppConfig(
    val casinoUrl: String,
    val latestVersionCode: Int?,
    val downloadUrl: String?,
) {
    companion object {
        private const val PREFS = "app_config"
        private const val KEY_CASINO = "casino_url"
        private const val TIMEOUT_MS = 3500

        fun cached(context: Context): AppConfig {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val casino = prefs.getString(KEY_CASINO, null)?.takeIf(::isHttps) ?: BuildConfig.DEFAULT_CASINO_URL
            return AppConfig(casino, null, null)
        }

        /** 在背景執行緒呼叫 */
        fun fetch(context: Context): AppConfig {
            val fallback = cached(context)
            return try {
                val conn = URL("${BuildConfig.ASSISTANT_ORIGIN}/api/public/app-config").openConnection() as HttpURLConnection
                conn.connectTimeout = TIMEOUT_MS
                conn.readTimeout = TIMEOUT_MS
                conn.setRequestProperty("accept", "application/json")
                CookieManager.getInstance().getCookie(BuildConfig.ASSISTANT_ORIGIN)?.let { conn.setRequestProperty("cookie", it) }
                try {
                    if (conn.responseCode != 200) return fallback
                    val json = JSONObject(conn.inputStream.bufferedReader().use { it.readText() })
                    val casino = json.optString("casinoUrl").takeIf(::isHttps) ?: fallback.casinoUrl
                    val latest = if (json.isNull("latestVersionCode")) null else json.optInt("latestVersionCode").takeIf { it > 0 }
                    val download = if (json.isNull("downloadUrl")) null else json.optString("downloadUrl").takeIf(::isHttps)
                    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY_CASINO, casino).apply()
                    AppConfig(casino, latest, download)
                } finally {
                    conn.disconnect()
                }
            } catch (_: Exception) {
                fallback
            }
        }

        private fun isHttps(s: String?): Boolean = s != null && s.startsWith("https://") && s.length > 8
    }
}
