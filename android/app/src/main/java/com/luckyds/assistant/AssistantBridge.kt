package com.luckyds.assistant

import android.webkit.JavascriptInterface

/**
 * 注入助手面板 WebView 的 window.LuckyApp（對應 src/native.ts）。
 * 面板只會載入 ASSISTANT_ORIGIN 的頁面（其他網址一律交給外部瀏覽器），所以只有我們的頁面呼叫得到。
 * JS 呼叫在 WebView 的背景執行緒，動到畫面要切回主執行緒（由 MainActivity 處理）。
 */
class AssistantBridge(
    private val onCollapse: () -> Unit,
    private val onSetMode: (String) -> Unit,
    private val currentMode: () -> String,
    private val onResize: (Double) -> Unit,
    private val onSwitchRoom: (String) -> Unit,
    private val onAlert: (String) -> Unit,
) {
    /** 1.3.0+：守護（止盈止損）撞線提醒：震動、打開駐守小卡、顯示訊息（只提醒，不操作遊戲） */
    @JavascriptInterface
    fun alert(message: String) = onAlert(message.take(200))

    /** 1.2.0+：在遊戲裡切換到指定機台（只切換、不下注） */
    @JavascriptInterface
    fun switchRoom(roomNo: String) = onSwitchRoom(roomNo)

    /** 收合面板，回到遊戲 */
    @JavascriptInterface
    fun collapse() = onCollapse()

    /** "dock"＝駐守小卡、"full"＝完整助手 */
    @JavascriptInterface
    fun setMode(mode: String) = onSetMode(mode)

    @JavascriptInterface
    fun getMode(): String = currentMode()

    /** 駐守小卡內容高度（CSS px） */
    @JavascriptInterface
    fun resize(cssHeight: Double) {
        if (cssHeight > 0 && cssHeight < 4000) onResize(cssHeight)
    }
}
