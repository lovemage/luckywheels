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

### 直式版面（2026-11-05 第二次實測）

遊戲預設是橫式，直式手機上是橫式畫面加上下黑邊；右上 `rotateScreenBtn` 跳確認視窗
「是否將遊戲畫面變更為橫向或直向?」，按確定後**重新載入遊戲，並且會換到另一台機台**
（實測 #1072 → #2566、#183 → #1751、#574 → #2746），玩家要知道這件事。

| 項目 | 直式節點（`GameView/content/uiLayer/` 之下） |
| --- | --- |
| 機台按鈕／目前機台號 | `SpinBarP/spinContent/slotTableBtn`（文字在子節點） |
| 押注 | `InfoBarP/content/betAmount`（文字在子節點） |
| 點數／贏分 | 同橫式：`balanceLabel`／`totalWinLabel` |
| Spin | `SpinBarP/spinContent/SpineButton` |
| 押注加減 | `SpinBarP/spinContent/plusBtn`／`minusBtn` |
| 選擇機台清單 | `SlotTableViewP`，內部結構與橫式相同（`SlotTablePageTabsItem`、`SlotTableItem2`、`slotTableNumber`、`confirmBtn`／`selectBtn`） |

`game-bridge.js` 的 HUD 與切換機台已同時支援兩種版面（1.2.1）。

### 切換機台的兩個坑（1.2.1 修正）

- 遊戲中打開清單後，清單會先載入目前那一頁；這時立刻換頁，兩個請求互撞，清單停在空白（`PAGE_TIMEOUT`）。
  要等 `loadingContent` 消失再多等 1 秒才換頁。1.2.0 只驗證過同一頁內切換，所以沒抓到。
- 分頁籤只觸發 clickEvents，不可再 `emit('click')`（會清空不載入）；機台格則一定要 `emit('click')`，細項才會更新。
- 細項的確定／選取鈕 `interactable=false` 代表有人在玩（實測對照清單狀態皆為 busy）；遊戲中有時顯示的是 `selectBtn` 而非 `confirmBtn`。

## 切換機台流程

1. 遊戲中：按 `slotTable2Btn`（有 clickEvents）開啟「選擇機台」。
2. 分頁 1–9（每頁 500 台）→ 按 `SlotTableItem2`（機台號）→ 細項面板。
3. 遊戲中按 `infoRow/buttons/confirmBtn`「確定」（有 clickEvents）→ 切換並重新載入遊戲。
4. 剛進遊戲（開始畫面後）的面板按鈕是 `selectBtn`「選取」，會再跳 `GameAlert`「將切換到 N 號桌，並重新載入遊戲」：
   `GameAlert/content/button/confirm` **沒有 clickEvents**，要對節點送 `touch-start` → `touch-end` 事件才有反應。
5. 重新載入後是開始畫面，「開始遊戲」是圖片（沒有文字節點），由玩家自己按。

## 遊玩紀錄（待測）

第二組測試帳號（`.env` 的 `TEST_ACCOUNT`）ATG 點數 0.50，戰神賽特 II **最低押注 1**（按「−」降不下去，按「+」為 2、3），
點數不足一注，所以仍無法轉動。尚未驗證：每轉時點數／贏分的變化順序、免費遊戲期間的顯示、押注切換。
需要帳號至少有幾十點 ATG 點數再實測，定義每轉紀錄（押注、贏分、轉前／轉後點數）。
