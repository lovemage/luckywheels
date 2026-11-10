# 盤面符號偵察（2026-11-09）

- 帳號：`.env` 的 `TEST_ACCOUNT`（ATG 點數 18.25 → 0.45，約 18 轉，由使用者手動按 Spin）
- 工具：`scripts/atg-board-probe.mjs`（只讀 Cocos 場景樹；遠端畫面以 `VIEW_HOST`／`VIEW_PORT` 開在 Tailscale）
- 遊戲：ATG 戰神賽特 II（Cocos Creator 3.7，`gv1.1.5_8 sv1.1.3_6`）
- 原始紀錄：`.atg-capture/board-2026-11-09T05-47-03-149Z/watch.jsonl`（已 gitignore）

## 盤面節點

- 盤面在 `Canvas/viewRoot/GameView/content/gameLayer/SymbolView` 底下，子節點名稱 `0`–`29`，
  由上往下一列 6 格（`index = 列 × 6 + 欄`，列 0 在最上方）。
- 每格的符號在 `<index>/symbolSprite` 的 `cc.Sprite.spriteFrame.name`。
- 倍數球的倍數是另一個子節點 `times` 上的 `cc.Label`（例：`3x`），不在圖片上。
- 消除過程會多出 `symbolAnimation`（得分動畫）、`symbolOut`（消除）、`frame`（得分框）等節點。

## 符號對照（圖片在 `docs/assistant-assets/signal-symbols/game-original/`）

| spriteFrame | 符號 | | spriteFrame | 符號 |
| --- | --- | --- | --- | --- |
| `symbol_01` | 眼睛 | | `symbol_10`／`_01` | 紅色倍數球 |
| `symbol_02` | 眼鏡蛇 | | `symbol_11`／`_01` | 紫色倍數球 |
| `symbol_03` | 弓 | | `symbol_12`／`_01` | 藍色倍數球 |
| `symbol_04` | 鐮刀 | | `symbol_13`／`_01` | 綠色倍數球 |
| `symbol_05` | 黃寶石 | | `symbol_14` | JP |
| `symbol_06` | 紅寶石 | | `symbol_15` | 金色 Scatter |
| `symbol_07` | 紫寶石 | | `symbol_16` | 紫色 Scatter（3 金 + 1 紫觸發覺醒之力） |
| `symbol_08` | 藍寶石 | | `symbol_17`／`18` | 男神／女神頭像 |
| `symbol_09` | 綠寶石 | | `fg_multiple` | 免費遊戲的倍數球外框 |

`*_blur` 是轉動中的模糊版本。實測看到的倍數：2x、3x、4x、6x、8x（綠色球）。

## 一轉的過程與讀盤時機

1. 新的一轉：30 格一次落下（點數先扣押注）。
2. 有連線時：得分格先隱藏並播 `symbolAnimation` → `symbolOut` 消除 → 上方補位；贏分（`totalWinLabel`）逐步累加。
3. 重複 2 直到沒有連線；最後的贏分在這一轉結束後加回點數。

**這一轉結束（最終盤面）**：30 格都有 `symbolSprite`、沒有 `symbolAnimation`／`symbolOut`／`frame` 節點，
且盤面維持不變約 0.8 秒以上。訊號比對應該只在這個時間點做一次。

## 匯出貼圖的注意事項

`symbol_01`–`09` 的貼圖在遊戲載入後不久就會從記憶體釋放（只留在 GPU），要在 `cc.director.getScene()`
剛就緒時馬上匯出；`symbol_10`–`18` 較晚釋放。匯出方式見 probe 的 `cmd/*-export.js`（以 canvas 從 spriteFrame 裁切）。

## 尚未驗證

- 免費遊戲期間的盤面（本次沒有觸發）：是否沿用同一個 `SymbolView`、倍數球是否改用 `fg_multiple`。
  - 2026-11-10：場景樹裡 `gameLayer/ReelView/fgRemaining`（子節點 `remaining` 數字 Label、`font` 圖 `fg_font`）主遊戲時隱藏，
    App 1.5.2 以它是否顯示判斷免遊中。**尚未在實際免遊中確認**，若判斷失準需再偵察一次免遊場景。
- 直式版面的節點路徑。
