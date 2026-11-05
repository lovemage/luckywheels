# WebView 的 JS 橋接方法名稱不可被混淆
-keepclassmembers class com.luckyds.assistant.AssistantBridge {
    @android.webkit.JavascriptInterface <methods>;
}
