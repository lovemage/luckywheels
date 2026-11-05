package com.luckyds.assistant

import android.webkit.JavascriptInterface

/**
 * 注入助手面板 WebView 的 window.LuckyApp（對應 src/native.ts）。
 * 面板只會載入 ASSISTANT_ORIGIN 的頁面（其他網址一律交給外部瀏覽器），所以只有我們的頁面呼叫得到。
 * JS 呼叫在 WebView 的背景執行緒，動到畫面要切回主執行緒。
 */
class AssistantBridge(private val onCollapse: () -> Unit) {
    @JavascriptInterface
    fun collapse() = onCollapse()
}
