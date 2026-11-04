# 曜金數據助手 × Midjourney 視覺草稿提示詞

> 專案：luckywheels（luckyds.com）／`/assistant` 會員端 PWA
> 對應 Claude Code 任務：手機優先落地頁，參考 seth-eye.com 的資訊架構，方向 A「金漆招牌」
> 品牌關鍵字：黑金、華人、老虎機、華麗、尊貴
> 原則：**給方向，不給規格。** 讓 Midjourney 自己決定構圖、材質、光影與細節。

---

## 0. 先分工：MJ 不是拿來排版的

Claude Code 目前用 Codex 生「可讀中文的 UI comps」，這件事 MJ 做不來，也不該做。MJ 在這案子負責的是**世界觀與素材造型**：

| 交給 Midjourney | 交給 Codex／Claude Code |
|---|---|
| 金漆招牌的材質、光、做工 | 可讀中文的實際版面 |
| 機台 icon 的造型語彙（25 款） | icon 的 SVG 化與 5×5 排列 |
| CTA 金牌、卡框、印章、PWA icon 的物件感 | 按鈕狀態、間距、RWD |
| banner key art、貴賓廳氛圍 | 文案、資訊層級、互動 |

所以 MJ 的圖只當「造型與氛圍草稿」，不要期待它排出正確的中文或精準間距。

---

## 1. 世界觀（貼在 prompt 前，或存成 `--sref` 的基準）

```text
A nocturnal Hong Kong street of gilded signboards, translated into a mobile
slot-room data assistant. Black lacquer, hand-carved gold leaf, one cinnabar
seal, warm tungsten reflections. Imperial Chinese craft colliding with precision
instrumentation. Luxurious, but legible. The gold feels earned, not decorative.
```

> 中文版：深夜的港式金漆招牌街，變成一个手機裡的老虎機房間數據助手。黑漆、手刻金箔、一枚朱砂印、鎢絲燈的暖反射。帝國工藝撞上精密儀器。華麗，但看得懂。金是掙來的，不是貼上去的。

---

## 2. 放手的寫法（三條）

1. **只寫「這是什麼、給誰、什麼感覺」**，不寫 hex、px、padding、卡片幾欄。
2. **用材質與動詞，不用 UI 術語**。寫「金箔被低光掃過」，不要寫「linear-gradient 135deg」。
3. **一次只鎖一個變數**。這次鎖「黑漆＋金箔」，構圖就交給它；下次鎖「直式招牌」，材質交給它。

---

## 3. 十二組提示詞

> 參數刻意留得少：`--ar` 決定用途，`--s` 控制放飛程度（60 收斂、250 放飛），`--no` 只擋三件事：可讀文字、既有遊戲美術、浮水印。

### 01 世界觀 board（先跑這張，選定後當 `--sref`）

```text
Art direction board for a mobile slot-room data assistant: black lacquer,
hand-carved gold leaf signboards, a single cinnabar seal, tungsten light,
imperial Chinese craft colliding with precision instrumentation.
Show me your own composition — a texture study, a fragment of a sign,
a reflection, a shadow. No interface.
--ar 3:2 --style raw --s 220 --no readable text, watermark, existing game art
```

### 02 落地頁首屏 key art（9:16）

```text
Mobile landing key art for a Chinese slot-room data assistant.
One tall gilded shop signboard, black lacquer, gold leaf catching a low warm
light, one red seal. The composition is yours; make the gold feel earned,
not loud. Leave breathing room for a headline.
--ar 9:16 --style raw --s 180 --no readable text, watermark, existing game art
```

### 03 金漆材質研究

```text
Close study of black lacquer and gold leaf: carved bevels, dust caught in the
gold, the maker's fingerprints, one crack that feels intentional.
Museum lighting. Your crop, your angle.
--ar 4:5 --style raw --s 250 --no readable text, watermark
```

### 04 二十五款機台 icon（5×5）

```text
A 5 by 5 grid of twenty-five original slot-machine emblems. Each cell a
different idea, all carved from the same black lacquer and gold leaf language,
one cinnabar accent allowed. Think talismans, reels, cabinets, levers, coins,
lanterns, seals — but surprise me. Even spacing, no labels.
--ar 1:1 --style raw --s 200 --no readable text, letters, watermark, existing game art, logos
```

> 這張只當造型探索。最終 25 款要重畫成 SVG，不能直接把 MJ 的點陣圖丟上線。

### 05 CTA 金牌（可按下的那種）

```text
A pressable gold plaque, the kind you'd find on a temple door, but sized for a
thumb. Black lacquer surround, worn gold face, a bevel that catches light.
Product photograph, your angle.
--ar 1:1 --style raw --s 180 --no readable text, watermark
```

### 06 底部導覽中央徽章

```text
A single ceremonial medallion for the centre button of a mobile app's bottom
navigation: gold, black lacquer, one red seal, Chinese craft, restrained.
Show it as an object on black, not as interface.
--ar 1:1 --style raw --s 200 --no readable text, watermark
```

### 07 廣告 banner 主視覺

```text
Vertical advertising banner for a slot-room data assistant. A night market of
gold signboards dissolving into data-like light, one figure turning away, no
face. Cinematic, moody, premium. Your composition.
--ar 9:16 --style raw --s 220 --no readable text, watermark, existing game art
```

### 08 房間卡／木刻牌框

```text
A carved wooden room plaque from a Chinese gambling hall: black lacquer,
gilded border, one red seal, space left for a number. Object photography,
shallow depth, your lighting.
--ar 4:3 --style raw --s 180 --no readable text, watermark
```

### 09 貴賓廳氛圍（section 背景）

```text
An empty VIP hall at three in the morning: black marble, gold inlay, one warm
lamp, a slot cabinet glowing at the far end, no people. Quiet, expensive,
slightly lonely.
--ar 16:9 --style raw --s 220 --no readable text, watermark, existing game art
```

### 10 PWA icon／品牌印記

```text
App icon for a gold-on-black Chinese slot-data assistant. One bold mark, carved
gold on lacquer, readable at 60 pixels, no lettering. Give me a few directions
in one image if you like.
--ar 1:1 --style raw --s 150 --no readable text, letters, watermark
```

### 11 資料更新「跑燈」動態感

```text
Motion study: a line of small gold lights chasing across black lacquer, like a
signboard's bulbs at night, long exposure. Abstract, no interface.
--ar 16:9 --style raw --s 200 --no readable text, watermark
```

### 12 朱砂印章

```text
One cinnabar seal stamped on black lacquer, imperfect impression, gold dust
around it. Macro.
--ar 1:1 --style raw --s 250 --no readable text, watermark
```

---

## 4. 想讓它更有自己的想法：混搭配方

每次從四欄各挑一個，寫成一句話丟給 MJ，不要補任何細節。它會自己長出方向。

| 底材 | 圖騰 | 光 | 一個意外 |
|---|---|---|---|
| 黑漆 | 招牌 | 鎢絲燈 | 水下 |
| 黑大理石 | 算盤 | 霓虹反射 | X 光 |
| 舊黃銅 | 麻將牌 | 燭光 | 熱顯像 |
| 水墨紙 | 廟宇格柵 | 清晨斜光 | 建築藍圖 |
| 絲絨 | 拉霸機械 | 舞台聚光 | 標本盒 |

範例：

```text
Black lacquer and mahjong tiles lit by a single candle, seen as an architectural
blueprint. A slot-room data assistant, but make it feel like a secret.
--ar 9:16 --style raw --s 220 --no readable text, watermark, existing game art
```

**放飛指令**（加在句尾即可）

- `surprise me with the composition`
- `one bold move, everything else quiet`
- `make the material do the talking`
- `director's choice`

---

## 5. 選圖之後，怎麼交接給 Claude Code

不要給 hex，也不要給「左邊 60% 右邊 40%」。用這四行描述：

```text
材質：黑漆底、金箔刻字、邊緣有一道手工磨損
光：低角度暖光從左上掃過，金色只在轉折處亮
記憶點：直式招牌比畫面還高，被裁切
不要：發光、漸層、對稱、滿版裝飾
```

Claude Code 收到這種描述，才有辦法把它轉成 `--gold`、`--lacquer`、字距與留白，而不是硬抄一張點陣圖。

---

## 6. 合規紅線（寫進每次 prompt 的護欄）

- 全部原創：不抄 seth-eye.com 的名稱、文案、圖像；不使用真實遊戲機台美術、角色或「賽特」相關字樣。
- 不出現保證獲利、預測、提高中獎率、「外掛」等字眼。
- 示意數據要標「示意數據」；頁尾固定「數據僅供參考，不保證獲利」。
- 深色底上的金色文字要過 WCAG AA；狀態不能只靠顏色。

---

## 7. 建議的跑圖順序

1. `01` 世界觀 → 選一張當 `--sref`。
2. `02` 首屏 → 決定落地頁第一眼。
3. `04` icon grid → 挑 25 款造型語彙。
4. `05`＋`06` → 決定 CTA 與底部導覽的物件感。
5. `07`＋`09` → banner 與背景氛圍。
6. `08`＋`12` → 卡框與印章，補足細節。
7. `03`＋`11` → 材質與動態的參考圖，交給實作。

---

## 8. 第二輪：留白方向（2026/11/01 選定 A_0「金色光柱」）

第一輪的教訓：寫「mobile app screen」會被畫成手機產品照；寫「minimal」會變抽象桌布。要明講「平拍截圖、不要手機實體」，並輕提畫面內容。

底部導覽沿用會員端原有的轉盤導覽（首頁／輪盤／活動規則／中獎紀錄），草稿只需示意一條底部分頁列。

### C. 以 A_0 為基準往介面推

```text
Flat straight-on UI screenshot of a mobile app, no phone hardware. Black space,
fine vertical gold light lines rising like a quiet bar chart, a centred title,
a few rows of room numbers and values, a bottom tab bar with four tabs.
Airy, premium, Chinese.
--ar 9:16 --style raw --s 150 --sref <A_0 網址> --sw 60 --no phone, device mockup, hands, desk, watermark
```

### D. 光環首屏＋資料列

```text
Flat straight-on UI screenshot of a mobile app, no phone hardware. A thin gold
ring glowing at the top as the hero, below it calm black space with a short list
of data rows and a bottom tab bar with four tabs.
--ar 9:16 --style raw --s 150 --sref <B_2 網址> --sw 25 --no phone, device mockup, hands, desk, watermark
```

> `--sw`（風格參考權重）調低，參考圖才不會蓋過介面；C 若太像原圖就降到 40，D 若還是只有光環就降到 15。

---

_建立日期：2026/11/01_
