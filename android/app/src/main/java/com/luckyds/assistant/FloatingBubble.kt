package com.luckyds.assistant

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import kotlin.math.abs

/**
 * 收合後的金色助手按鈕：可拖曳，放開後貼齊左右邊緣，位置記在 SharedPreferences
 * （以比例記錄，旋轉螢幕後仍在相近位置）。點一下開啟助手面板。
 */
class FloatingBubble(
    private val bubble: View,
    private val container: View,
    private val margin: Float,
    private val onTap: () -> Unit,
) {
    private val prefs = bubble.context.getSharedPreferences("bubble", Context.MODE_PRIVATE)
    private val touchSlop = ViewConfiguration.get(bubble.context).scaledTouchSlop

    /** 0 = 靠左、1 = 靠右 */
    private var side = prefs.getInt("side", 1)

    /** 垂直位置（0–1，佔可移動範圍的比例） */
    private var yRatio = prefs.getFloat("y", 0.62f)

    /** 遊戲內容不可被遮住的邊距（瀏海、系統列） */
    private var insetLeft = 0
    private var insetTop = 0
    private var insetRight = 0
    private var insetBottom = 0

    init {
        attach()
    }

    fun setInsets(left: Int, top: Int, right: Int, bottom: Int) {
        insetLeft = left; insetTop = top; insetRight = right; insetBottom = bottom
        place()
    }

    private fun minX() = insetLeft + margin
    private fun maxX() = container.width - insetRight - margin - bubble.width
    private fun minY() = insetTop + margin
    private fun maxY() = container.height - insetBottom - margin - bubble.height

    /** 依記住的位置擺放（容器尺寸改變時呼叫） */
    fun place() {
        if (container.width == 0 || bubble.width == 0) return
        bubble.x = if (side == 0) minX() else maxX()
        bubble.y = minY() + (maxY() - minY()).coerceAtLeast(0f) * yRatio
    }

    @SuppressLint("ClickableViewAccessibility")
    private fun attach() {
        var downX = 0f
        var downY = 0f
        var startX = 0f
        var startY = 0f
        var dragging = false

        bubble.setOnClickListener { onTap() }
        bubble.setOnTouchListener { v, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX; downY = e.rawY
                    startX = v.x; startY = v.y
                    dragging = false
                    v.animate().cancel()
                    v.animate().scaleX(0.92f).scaleY(0.92f).setDuration(90).start()
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = e.rawX - downX
                    val dy = e.rawY - downY
                    if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) dragging = true
                    if (dragging) {
                        v.x = (startX + dx).coerceIn(minX(), maxX().coerceAtLeast(minX()))
                        v.y = (startY + dy).coerceIn(minY(), maxY().coerceAtLeast(minY()))
                    }
                    true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate().scaleX(1f).scaleY(1f).setDuration(120).start()
                    if (dragging) {
                        side = if (v.x + v.width / 2f < container.width / 2f) 0 else 1
                        val range = (maxY() - minY()).coerceAtLeast(1f)
                        yRatio = ((v.y - minY()) / range).coerceIn(0f, 1f)
                        prefs.edit().putInt("side", side).putFloat("y", yRatio).apply()
                        v.animate().x(if (side == 0) minX() else maxX()).setDuration(220).start()
                    } else if (e.actionMasked == MotionEvent.ACTION_UP) {
                        v.performClick()
                    }
                    true
                }
                else -> false
            }
        }
    }
}
