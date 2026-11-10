package com.luckyds.assistant

import android.annotation.SuppressLint
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
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
import org.json.JSONArray
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.min

/**
 * 單一畫面：
 *  - 底層：娛樂城（gameWeb），會員在這裡登入娛樂城、進遊戲
 *  - 上層：曜金數據助手面板（panelWeb，載入 luckyds.com 會員 SPA）＋收合後的金色懸浮按鈕
 * App 讀遊戲畫面上的機台號與點數、依會員點選切換機台，不按 Spin、不自動投注、不自動遊玩。
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

    /** 面板模式：full＝全螢幕網站（開 App 的畫面），dock＝遊戲中的駐守小卡（不擋遊戲操作） */
    @Volatile private var mode = MODE_FULL
    /** 會員按過「進入遊戲」（之後才載入娛樂城，避免網站畫面背後播放娛樂城的聲音） */
    private var enteredGame = false
    /** 駐守小卡的內容高度（px，由網頁回報） */
    private var dockHeightPx = 0

    /** 注入遊戲頁的輔助程式（assets/game-bridge.js）：讀目前機台、切換機台 */
    private val gameBridge by lazy { assets.open("game-bridge.js").bufferedReader().use { it.readText() } }
    private val ui = Handler(Looper.getMainLooper())
    private var lastHud: String? = null
    private var resumed = false
    private val hudPoll = object : Runnable {
        override fun run() {
            pollHud()
            if (resumed) ui.postDelayed(this, HUD_INTERVAL_MS)
        }
    }

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

        bubble = FloatingBubble(bubbleView, root, 12 * dp) { expand(MODE_DOCK) }
        root.addOnLayoutChangeListener { _, l, t, r, b, ol, ot, or, ob ->
            if (r - l != or - ol || b - t != ob - ot) {
                bubble.place()
                layoutPanel()
            }
        }
        scrim.setOnClickListener { collapse() }
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

        // 開 App 先顯示全螢幕網站；按網站底部「進入遊戲」才切到娛樂城
        bubbleView.visibility = View.INVISIBLE
        expand(MODE_FULL, animate = false)
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
        resumed = true
        ui.removeCallbacks(hudPoll)
        ui.post(hudPoll)
        gameWeb.onResume()
        panelWeb.onResume()
    }

    override fun onPause() {
        resumed = false
        ui.removeCallbacks(hudPoll)
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
            if (enteredGame) loadGame()
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

    private fun loadGame() {
        if (gameLoaded) return
        gameLoaded = true
        // 啟動時讀的設定可能是登入前的（測試會員要開不同網址）：進入遊戲前再用目前的登入狀態讀一次，讀不到就用手上的網址
        thread(name = "app-config-game") {
            val url = AppConfig.fetch(this).casinoUrl
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                casinoUrl = url
                gameWeb.loadUrl(casinoUrl)
            }
        }
    }

    // ── 遊戲頁：讀目前機台、切換機台 ─────────────────

    private fun isGamePage(): Boolean {
        val host = Uri.parse(gameWeb.url ?: return false).host ?: return false
        return host == GAME_HOST || host.endsWith(".$GAME_HOST")
    }

    /** 在遊戲頁執行 expr（先確保輔助程式已注入），回傳 JSON 字串（或 null） */
    private fun evalGame(expr: String, done: (String?) -> Unit) {
        if (!isGamePage()) return done(null)
        gameWeb.evaluateJavascript("$gameBridge\n;JSON.stringify($expr)") { raw ->
            val json = try {
                if (raw == null || raw == "null") null else JSONArray("[$raw]").optString(0, null)
            } catch (_: Exception) {
                null
            }
            done(json)
        }
    }

    private fun sendToPanel(event: String, detailJson: String) {
        panelWeb.evaluateJavascript("window.dispatchEvent(new CustomEvent('$event',{detail:$detailJson}))", null)
    }

    /** 每 2 秒讀一次遊戲畫面上的機台號、點數、贏分、押注，有變化才通知網頁 */
    private fun pollHud() {
        if (!enteredGame) return
        evalGame("window.__lwApp.hud()") { json ->
            val hud = json?.takeIf { it != "null" } ?: "null"
            if (hud != lastHud) {
                lastHud = hud
                sendToPanel("luckyapp:game", hud)
            }
        }
    }

    /**
     * 駐守小卡點推薦機台：收合小卡，由輔助程式在遊戲裡切換。
     * roomNos 可為「1288,3071,526」：依序嘗試，遊戲清單上有人的跳過（1.4.1+）。
     */
    private fun switchRoom(roomNos: String) {
        val rooms = roomNos.split(',').map { it.trim() }.filter { Regex("^\\d{1,6}$").matches(it) }.distinct().take(10)
        if (rooms.isEmpty()) return
        if (!isGamePage()) {
            Toast.makeText(this, R.string.switch_need_game, Toast.LENGTH_LONG).show()
            return
        }
        collapse()
        evalGame("window.__lwApp.switchRoom(${JSONArray(rooms)})") {}
        val deadline = SystemClock.elapsedRealtime() + SWITCH_TIMEOUT_MS * rooms.size.coerceAtMost(3)
        val check = object : Runnable {
            override fun run() {
                evalGame("{s: window.__lwApp.switchState(), h: window.__lwApp.hud()}") { json ->
                    val o = try { json?.let { JSONObject(it) } } catch (_: Exception) { null }
                    val st = o?.optJSONObject("s")
                    val room = o?.optJSONObject("h")?.optString("room")
                    val status = st?.optString("status")
                    val target = st?.optString("target")
                    val skipped = st?.optJSONArray("skipped")?.let { a -> (0 until a.length()).map { "#" + a.optString(it) } }.orEmpty()
                    val mine = target != null && target in rooms
                    when {
                        room != null && room in rooms && room == target ->
                            toast(if (skipped.isEmpty()) getString(R.string.switch_done, room) else getString(R.string.switch_skipped, skipped.joinToString("、"), room))
                        mine && status == "error" -> toast(switchError(st!!.optString("error"), target!!))
                        // 已按下確定、遊戲重新載入中（載入後由玩家按「開始遊戲」）
                        mine && status == "switching" || (o != null && o.isNull("h")) ->
                            toast(
                                if (skipped.isEmpty()) getString(R.string.switch_loading, target ?: rooms[0])
                                else getString(R.string.switch_skipped, skipped.joinToString("、"), target ?: rooms[0]),
                            )
                        SystemClock.elapsedRealtime() > deadline -> toast(getString(R.string.switch_failed, rooms[0]))
                        else -> ui.postDelayed(this, 500)
                    }
                }
            }
        }
        ui.postDelayed(check, 500)
    }

    private fun switchError(code: String, roomNo: String): String = when (code) {
        "ROOM_UNAVAILABLE" -> getString(R.string.switch_unavailable, roomNo)
        "ALL_BUSY" -> getString(R.string.switch_all_busy)
        "NOT_READY", "NOT_IN_GAME", "LIST_NOT_OPEN" -> getString(R.string.switch_need_game)
        else -> getString(R.string.switch_failed, roomNo)
    }

    private fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_LONG).show()

    /** 守護撞線：震動兩下、打開駐守小卡（小卡上有提醒與「知道了」），並顯示訊息 */
    private fun guardAlert(message: String) {
        if (isFinishing || isDestroyed) return
        vibrate()
        if (message.isNotBlank()) toast(message)
        if (enteredGame && (!expanded || mode != MODE_DOCK)) expand(MODE_DOCK)
    }

    /** 房間訊號達標：震動、打開訊號浮窗（停在原本的模式就不切換），並顯示訊息 */
    private fun signalHit(message: String) {
        if (isFinishing || isDestroyed) return
        vibrate()
        if (message.isNotBlank()) toast(message)
        if (enteredGame && (!expanded || mode == MODE_FULL)) expand(MODE_SIGNAL)
    }

    private fun vibrate() {
        try {
            val v = if (android.os.Build.VERSION.SDK_INT >= 31) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            if (!v.hasVibrator()) return
            val pattern = longArrayOf(0, 180, 120, 180)
            v.vibrate(VibrationEffect.createWaveform(pattern, -1))
        } catch (_: Exception) {
            // 沒有震動權限或硬體：略過
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
     * 駐守小卡：直向貼在上方（高度上限 45%）；橫向開在金色按鈕那一側的上角、窄版，避開另一側的遊戲操作鈕。
     * 高度跟著內容，遊戲其他區域照常可以操作。
     * 網站（full）：全螢幕，沒有外框圓角。鍵盤出現時讓出空間。
     */
    private fun layoutPanel() {
        val w = root.width
        val h = root.height
        if (w == 0 || h == 0) return
        val m = (12 * dp).toInt()
        val bottom = max(safe.bottom, imeBottom) + m
        val lp = panel.layoutParams as FrameLayout.LayoutParams
        if (mode == MODE_SIGNAL) {
            // 房間訊號浮窗：窄版，開在金色按鈕那一側的上角
            panel.setBackgroundResource(R.drawable.panel_bg)
            panel.setPadding((1 * dp).toInt(), (1 * dp).toInt(), (1 * dp).toInt(), (1 * dp).toInt())
            panel.clipToOutline = true
            val content = if (dockHeightPx > 0) dockHeightPx + panel.paddingTop + panel.paddingBottom else (160 * dp).toInt()
            lp.width = min((230 * dp).toInt(), ((if (w < h) 0.62f else 0.3f) * w).toInt())
            lp.height = content.coerceAtMost((h * 0.7f).toInt())
            if (bubble.isLeft) {
                lp.gravity = android.view.Gravity.START or android.view.Gravity.TOP
                lp.setMargins(safe.left + m, safe.top + m, 0, 0)
            } else {
                lp.gravity = android.view.Gravity.END or android.view.Gravity.TOP
                lp.setMargins(0, safe.top + m, safe.right + m, 0)
            }
            panel.layoutParams = lp
            return
        }
        if (mode == MODE_DOCK) {
            panel.setBackgroundResource(R.drawable.panel_bg)
            panel.setPadding((1 * dp).toInt(), (1 * dp).toInt(), (1 * dp).toInt(), (1 * dp).toInt())
            panel.clipToOutline = true
            val content = if (dockHeightPx > 0) dockHeightPx + panel.paddingTop + panel.paddingBottom else (120 * dp).toInt()
            if (w < h) {
                lp.width = min(w - safe.left - safe.right - 2 * m, (460 * dp).toInt())
                lp.height = content.coerceAtMost((h * 0.45f).toInt())
                lp.gravity = android.view.Gravity.TOP or android.view.Gravity.CENTER_HORIZONTAL
                lp.setMargins(0, safe.top + m, 0, 0)
            } else {
                lp.width = min((320 * dp).toInt(), (w * 0.36f).toInt())
                lp.height = content.coerceAtMost(h - safe.top - bottom - m)
                if (bubble.isLeft) {
                    lp.gravity = android.view.Gravity.START or android.view.Gravity.TOP
                    lp.setMargins(safe.left + m, safe.top + m, 0, 0)
                } else {
                    lp.gravity = android.view.Gravity.END or android.view.Gravity.TOP
                    lp.setMargins(0, safe.top + m, safe.right + m, 0)
                }
            }
            panel.layoutParams = lp
            return
        }
        panel.background = null
        panel.setPadding(0, 0, 0, 0)
        panel.clipToOutline = false
        lp.width = FrameLayout.LayoutParams.MATCH_PARENT
        lp.height = FrameLayout.LayoutParams.MATCH_PARENT
        lp.gravity = android.view.Gravity.TOP
        lp.setMargins(safe.left, safe.top, safe.right, max(safe.bottom, imeBottom))
        panel.layoutParams = lp
    }

    /** 切換面板模式並通知網頁（src/native.ts 的 luckyapp:mode 事件） */
    private fun setMode(next: String) {
        if (next != MODE_DOCK && next != MODE_FULL && next != MODE_SIGNAL) return
        val changed = mode != next
        mode = next
        if (expanded) layoutPanel()
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

    /** 打開面板：金色按鈕開駐守小卡，「完整助手」與開 App 時是全螢幕網站 */
    private fun expand(target: String, animate: Boolean = true) {
        if (expanded) {
            setMode(target)
            return
        }
        expanded = true
        setMode(target)
        layoutPanel()
        panel.visibility = View.VISIBLE
        if (animate) {
            panel.alpha = 0f
            panel.translationY = 24 * dp
            panel.animate().alpha(1f).translationY(0f).setDuration(220).start()
        } else {
            panel.alpha = 1f
            panel.translationY = 0f
        }
        bubbleView.animate().alpha(0f).setDuration(120).withEndAction { bubbleView.visibility = View.INVISIBLE }.start()
    }

    /** 收合面板 → 顯示遊戲（網站的「進入遊戲」、小卡的「收合」都走這裡） */
    private fun collapse() {
        enteredGame = true
        loadGame()
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
            // 網站畫面：玩過遊戲就回遊戲，否則離開 App
            expanded && mode == MODE_FULL -> if (enteredGame) collapse() else confirmExit()
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
                onSwitchRoom = { roomNo -> runOnUiThread { switchRoom(roomNo) } },
                onAlert = { message -> runOnUiThread { guardAlert(message) } },
                onSignalHit = { message -> runOnUiThread { signalHit(message) } },
                onResize = { cssHeight ->
                    runOnUiThread {
                        dockHeightPx = (cssHeight * dp).toInt()
                        if (expanded && mode != MODE_FULL) layoutPanel()
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

            override fun onPageFinished(view: WebView, url: String?) {
                // 網頁重新載入後要重送一次遊戲資訊
                lastHud = null
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
        expand(MODE_FULL)
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
        const val MODE_SIGNAL = "signal"
        const val GAME_HOST = "godeebxp.com"
        const val HUD_INTERVAL_MS = 2000L
        const val SWITCH_TIMEOUT_MS = 20_000L
    }
}
