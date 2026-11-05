# App 遊戲內偵察（2026-11-05）

- 帳號：業主提供的測試帳號（無儲值，ATG 點數 0.00，帳密不寫入版控）
- 遊戲：ATG 戰神賽特 II（Cocos Creator 3.7，`gv1.1.5_8 sv1.1.3_6`）
- 範圍：只讀場景樹文字、切換機台；**沒有按 Spin、沒有下注、沒有鎖定機台**

## 遊戲畫面（入座後）可讀到的文字節點

| 項目 | 節點路徑（`main/Canvas/viewRoot/` 之下） | 範例 |
| --- | --- | --- |
| 目前機台號 | `GameView/content/uiLayer/SpinBarLandScape/buttons/slotTable2Btn/num` | `523` |
| 點數（餘額） | `GameView/content/uiLayer/InfoBar/content/balance/content/balanceLabel` | `0.00` |
| 贏分 | `GameView/content/uiLayer/InfoBar/content/totalWin/content/totalWinLabel` | `0.00` |
| 押注 | `GameView/content/uiLayer/SpinBarLandScape/stakeContent/stake` | `1` |
| JP（GRAND/MAJOR/MINOR/MINI） | `GameView/content/uiLayer/TopBar/JpBarL/content/*/num` | `135,313.27` |

直式畫面的節點名稱可能不同（`SpinBarLandScape` 是橫式），手機上需再確認。

## 切換機台流程

1. 遊戲中：按 `slotTable2Btn`（有 clickEvents）開啟「選擇機台」。
2. 分頁 1–9（每頁 500 台）→ 按 `SlotTableItem2`（機台號）→ 細項面板。
3. 遊戲中按 `infoRow/buttons/confirmBtn`「確定」（有 clickEvents）→ 切換並重新載入遊戲。
4. 剛進遊戲（開始畫面後）的面板按鈕是 `selectBtn`「選取」，會再跳 `GameAlert`「將切換到 N 號桌，並重新載入遊戲」：
   `GameAlert/content/button/confirm` **沒有 clickEvents**，要對節點送 `touch-start` → `touch-end` 事件才有反應。
5. 重新載入後是開始畫面，「開始遊戲」是圖片（沒有文字節點），由玩家自己按。

## 遊玩紀錄（待測）

點數為 0 無法轉動，尚未驗證：每轉時點數／贏分的變化順序、免費遊戲期間的顯示、押注切換。
需要帳號有 ATG 點數後實測，再定義每轉紀錄（押注、贏分、轉前／轉後點數）。
