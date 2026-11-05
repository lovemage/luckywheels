package com.luckyds.assistant

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.view.View
import android.view.WindowManager
import android.webkit.CookieManager
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.browser.customtabs.CustomTabColorSchemeParams
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.min

/**
 * 單一畫面：
 *  - 底層：娛樂城（gameWeb），會員在這裡登入娛樂城、進遊戲
 *  - 上層：曜金數據助手面板（panelWeb，載入 luckyds.com 會員 SPA）＋收合後的金色懸浮按鈕
 * App 只負責「同一個畫面看得到兩者」，不讀取、不操作遊戲畫面（不自動投注、不自動遊玩）。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var root: FrameLayout
    private lateinit var gameWeb: WebView
    private lateinit var gameProgress: ProgressBar
    private lateinit var gameError: View
    private lateinit var scrim: View
    private lateinit var panel: View
    private lateinit var panelWeb: WebView
    private lateinit var bubble: FloatingBubble
    private lateinit var bubbleView: View

    private val origin = Uri.parse(BuildConfig.ASSISTANT_ORIGIN)
    private var casinoUrl: String = BuildConfig.DEFAULT_CASINO_URL
    private var gameLoaded = false
    private var expanded = false
    private var lastBackAt = 0L

    /** 面板模式：dock＝駐守小卡（不擋遊戲操作），full＝完整助手 */
    @Volatile private var mode = MODE_DOCK
    /** 駐守小卡的內容高度（px，由網頁回報） */
    private var dockHeightPx = 0

    /** 系統列、瀏海、鍵盤佔用的範圍（沉浸模式下系統列通常為 0） */
    private var safe = WindowInsetsCompat.CONSUMED.getInsets(WindowInsetsCompat.Type.systemBars())
    private var imeBottom = 0

    private val dp get() = resources.displayMetrics.density

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)

        root = findViewById(R.id.root)
        gameWeb = findViewById(R.id.gameWeb)
        gameProgress = findViewById(R.id.gameProgress)
        gameError = findViewById(R.id.gameError)
        scrim = findViewById(R.id.scrim)
        panel = findViewById(R.id.panel)
        panelWeb = findViewById(R.id.panelWeb)
        bubbleView = findViewById(R.id.bubble)
        panel.clipToOutline = true // 圓角裁切（XML 屬性要 API 31）

        enterImmersive()
        setupInsets()
        setupGame()
        setupPanel()

        bubble = FloatingBubble(bubbleView, root, 12 * dp) { expand() }
        root.addOnLayoutChangeListener { _, l, t, r, b, ol, ot, or, ob ->
            if (r - l != or - ol || b - t != ob - ot) {
                bubble.place()
                layoutPanel()
            }
        }
        scrim.setOnClickListener { setMode(MODE_DOCK) }
        findViewById<View>(R.id.gameRetry).setOnClickListener {
            gameError.visibility = View.GONE
            if (gameLoaded) gameWeb.reload() else gameWeb.loadUrl(casinoUrl)
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() = onBack()
        })

        // 先用快取的娛樂城網址；設定讀回來後若網址不同或有新版本再處理
        casinoUrl = AppConfig.cached(this).casinoUrl
        thread(name = "app-config") {
            val config = AppConfig.fetch(this)
            runOnUiThread { applyConfig(config) }
        }

        panelWeb.loadUrl(BuildConfig.ASSISTANT_ORIGIN + "/")
        handleDeepLink(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleDeepLink(intent)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enterImmersive()
    }

    override fun onResume() {
        super.onResume()
        gameWeb.onResume()
        panelWeb.onResume()
    }

    override fun onPause() {
        // 確保登入狀態（cookie）寫回磁碟
        CookieManager.getInstance().flush()
        gameWeb.onPause()
        panelWeb.onPause()
        super.onPause()
    }

    override fun onDestroy() {
        gameWeb.destroy()
        panelWeb.destroy()
        super.onDestroy()
    }

    // ── 設定 ─────────────────────────────────────────

    private fun applyConfig(config: AppConfig) {
        if (isFinishing || isDestroyed) return
        if (!gameLoaded) {
            casinoUrl = config.casinoUrl
            gameLoaded = true
            gameWeb.loadUrl(casinoUrl)
        }
        val latest = config.latestVersionCode
        val download = config.downloadUrl
        if (latest != null && download != null && latest > BuildConfig.VERSION_CODE) {
            AlertDialog.Builder(this)
                .setTitle(R.string.update_title)
                .setMessage(R.string.update_body)
                .setPositiveButton(R.string.update_download) { _, _ -> openExternal(Uri.parse(download)) }
                .setNegativeButton(R.string.update_later, null)
                .show()
        }
    }

    // ── 畫面配置 ─────────────────────────────────────

    private fun enterImmersive() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        WindowInsetsControllerCompat(window, window.decorView).apply {
            hide(WindowInsetsCompat.Type.systemBars())
            systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        }
    }

    private fun setupInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(root) { _, insets ->
            safe = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            imeBottom = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            bubble.setInsets(safe.left, safe.top, safe.right, safe.bottom)
            layoutPanel()
            insets
        }
    }

    /**
     * 駐守小卡：直向貼在上方、橫向在右上角，高度跟著內容，遊戲其他區域照常可以操作。
     * 完整助手：直向底部抽屜（約 80% 高）、橫向右側面板，背後加遮罩。鍵盤出現時讓出空間。
     */
    private fun layoutPanel() {
        val w = root.width
        val h = root.height
        if (w == 0 || h == 0) return
        val m = (12 * dp).toInt()
        val bottom = max(safe.bottom, imeBottom) + m
        val lp = panel.layoutParams as FrameLayout.LayoutParams
        if (mode == MODE_DOCK) {
            val content = if (dockHeightPx > 0) dockHeightPx + panel.paddingTop + panel.paddingBottom else (120 * dp).toInt()
            if (w < h) {
                lp.width = min(w - safe.left - safe.right - 2 * m, (460 * dp).toInt())
                lp.height = content.coerceAtMost((h * 0.6f).toInt())
                lp.gravity = android.view.Gravity.TOP or android.view.Gravity.CENTER_HORIZONTAL
                lp.setMargins(0, safe.top + m, 0, 0)
            } else {
                lp.width = min((380 * dp).toInt(), (w * 0.45f).toInt())
                lp.height = content.coerceAtMost(h - safe.top - bottom - m)
                lp.gravity = android.view.Gravity.END or android.view.Gravity.TOP
                lp.setMargins(0, safe.top + m, safe.right + m, 0)
            }
            panel.layoutParams = lp
            return
        }
        if (w < h) {
            lp.width = FrameLayout.LayoutParams.MATCH_PARENT
            lp.height = min((h * 0.82f).toInt(), h - safe.top - bottom - m)
            lp.gravity = android.view.Gravity.BOTTOM
            lp.setMargins(safe.left + m, 0, safe.right + m, bottom)
        } else {
            lp.width = min((440 * dp).toInt(), (w * 0.56f).toInt())
            lp.height = h - safe.top - m - bottom
            lp.gravity = android.view.Gravity.END or android.view.Gravity.TOP
            lp.setMargins(0, safe.top + m, safe.right + m, bottom)
        }
        panel.layoutParams = lp
    }

    /** 切換面板模式並通知網頁（src/native.ts 的 luckyapp:mode 事件） */
    private fun setMode(next: String) {
        if (next != MODE_DOCK && next != MODE_FULL) return
        val changed = mode != next
        mode = next
        if (expanded) {
            layoutPanel()
            showScrim(next == MODE_FULL)
        }
        if (changed) {
            panelWeb.evaluateJavascript(
                "window.dispatchEvent(new CustomEvent('luckyapp:mode',{detail:'$next'}))", null,
            )
        }
    }

    private fun showScrim(show: Boolean) {
        if (show && scrim.visibility != View.VISIBLE) {
            scrim.alpha = 0f
            scrim.visibility = View.VISIBLE
            scrim.animate().alpha(1f).setDuration(180).start()
        } else if (!show && scrim.visibility == View.VISIBLE) {
            scrim.animate().alpha(0f).setDuration(160).withEndAction { scrim.visibility = View.GONE }.start()
        }
    }

    /** 點金色按鈕：一律先開駐守小卡 */
    private fun expand(target: String = MODE_DOCK) {
        if (expanded) {
            setMode(target)
            return
        }
        expanded = true
        setMode(target)
        layoutPanel()
        showScrim(target == MODE_FULL)
        panel.alpha = 0f
        panel.translationY = 24 * dp
        panel.visibility = View.VISIBLE
        panel.animate().alpha(1f).translationY(0f).setDuration(220).start()
        bubbleView.animate().alpha(0f).setDuration(120).withEndAction { bubbleView.visibility = View.INVISIBLE }.start()
    }

    private fun collapse() {
        if (!expanded) return
        expanded = false
        currentFocus?.let { focused ->
            val imm = getSystemService(INPUT_METHOD_SERVICE) as android.view.inputmethod.InputMethodManager
            imm.hideSoftInputFromWindow(focused.windowToken, 0)
        }
        showScrim(false)
        panel.animate().alpha(0f).translationY(24 * dp).setDuration(180).withEndAction { panel.visibility = View.GONE }.start()
        bubbleView.visibility = View.VISIBLE
        bubbleView.animate().alpha(1f).setDuration(180).start()
    }

    private fun onBack() {
        when {
            expanded && mode == MODE_FULL -> setMode(MODE_DOCK)
            expanded -> collapse()
            gameError.visibility == View.VISIBLE -> confirmExit()
            gameWeb.canGoBack() -> gameWeb.goBack()
            else -> confirmExit()
        }
    }

    private fun confirmExit() {
        val now = SystemClock.elapsedRealtime()
        if (now - lastBackAt < 2000) finish()
        else {
            lastBackAt = now
            Toast.makeText(this, R.string.exit_hint, Toast.LENGTH_SHORT).show()
        }
    }

    // ── 遊戲（娛樂城） ─────────────────────────────

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupGame() {
        gameWeb.setBackgroundColor(getColor(R.color.bg))
        gameWeb.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            // 娛樂城以新分頁開「轉點」與 ATG 大廳：不開新視窗，直接在同一個畫面載入
            setSupportMultipleWindows(false)
            javaScriptCanOpenWindowsAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
        }
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            // 遊戲在 play.godeebxp.com（與娛樂城不同網域）
            setAcceptThirdPartyCookies(gameWeb, true)
        }
        gameWeb.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                gameProgress.progress = newProgress
                gameProgress.visibility = if (newProgress in 1..99) View.VISIBLE else View.GONE
            }
        }
        gameWeb.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val scheme = request.url.scheme
                if (scheme == "http" || scheme == "https") return false
                // line://、intent:// 等交給系統（例如娛樂城的客服 LINE 連結）
                openExternal(request.url)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                gameError.visibility = View.GONE
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) gameError.visibility = View.VISIBLE
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                // WebView 引擎當掉：重開整個畫面，避免 App 閃退
                recreate()
                return true
            }
        }
    }

    // ── 助手面板 ─────────────────────────────────────

    @SuppressLint("SetJavaScriptEnabled", "JavascriptInterface")
    private fun setupPanel() {
        panelWeb.setBackgroundColor(getColor(R.color.bg))
        panelWeb.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            // 會員 SPA 以這個標記辨識 App（src/native.ts）
            userAgentString = "$userAgentString LuckyDsApp/${BuildConfig.VERSION_NAME}"
        }
        panelWeb.addJavascriptInterface(
            AssistantBridge(
                onCollapse = { runOnUiThread { collapse() } },
                onSetMode = { m -> runOnUiThread { setMode(m) } },
                currentMode = { mode },
                onResize = { cssHeight ->
                    runOnUiThread {
                        dockHeightPx = (cssHeight * dp).toInt()
                        if (expanded && mode == MODE_DOCK) layoutPanel()
                    }
                },
            ),
            "LuckyApp",
        )
        panelWeb.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (isAssistantUrl(url)) {
                    if (url.path?.startsWith("/api/auth/line/start") == true) {
                        openLineLogin()
                        return true
                    }
                    return false
                }
                // 面板只顯示助手本身；其他網址（LINE 官方帳號、說明連結…）開到外部
                openExternal(url)
                return true
            }

            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                recreate()
                return true
            }
        }
    }

    private fun isAssistantUrl(url: Uri) =
        url.scheme == origin.scheme && url.host.equals(origin.host, ignoreCase = true) && url.port == origin.port

    // ── LINE 登入（Custom Tab → 交接碼 → 面板換 session） ──

    private fun openLineLogin() {
        val uri = Uri.parse(BuildConfig.ASSISTANT_ORIGIN + "/api/auth/line/start?app=1")
        val colors = CustomTabColorSchemeParams.Builder()
            .setToolbarColor(getColor(R.color.bg))
            .setNavigationBarColor(getColor(R.color.bg))
            .build()
        try {
            CustomTabsIntent.Builder()
                .setShowTitle(true)
                .setDefaultColorSchemeParams(colors)
                .build()
                .launchUrl(this, uri)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show()
        }
    }

    private fun handleDeepLink(intent: Intent?) {
        val data = intent?.data ?: return
        if (data.scheme != "luckyds-assistant" || data.host != "auth") return
        // 避免旋轉或回到前景時重複處理
        setIntent(Intent(intent).setData(null))
        val code = data.getQueryParameter("code")
        if (!code.isNullOrBlank()) {
            panelWeb.loadUrl("${BuildConfig.ASSISTANT_ORIGIN}/api/app/redeem?code=${Uri.encode(code)}")
        }
        expand(MODE_DOCK)
    }

    private fun openExternal(uri: Uri) {
        try {
            val intent = if (uri.scheme == "intent") {
                Intent.parseUri(uri.toString(), Intent.URI_INTENT_SCHEME).apply {
                    addCategory(Intent.CATEGORY_BROWSABLE)
                    component = null
                    selector = null
                }
            } else {
                Intent(Intent.ACTION_VIEW, uri)
            }
            startActivity(intent)
        } catch (_: Exception) {
            // 沒有可處理的 App：忽略
        }
    }

    companion object {
        const val MODE_DOCK = "dock"
        const val MODE_FULL = "full"
    }
}
