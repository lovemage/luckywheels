# 曜金數據助手 — 素材生圖提示詞

- 風格：黑金｜華人｜老虎機｜華麗｜尊貴，視覺方向「金漆招牌」（港式黑漆金箔刻字招牌）
- 生成工具：Codex CLI 內建圖像生成（`codex exec`，腳本見文末）
- 所有素材**不含文字**：按鈕字、標題、數字一律由程式繪製，方便改文案與多尺寸使用
- 輸出位置：`public/assets/assistant/`（原始大圖保留在 `docs/assistant-assets/raw/`，不進 build）

## 共用風格段（每則提示詞都附加）

```
Style: Hong Kong gilded-signboard craft. Deep black lacquer ground with a faint
wood-grain sheen; ornaments carved in real gold leaf with a bevelled V-cut edge
that catches warm light; thin twisted gold rope borders; cloud-scroll (祥雲) and
fret (回紋) motifs; at most a tiny cinnabar-red seal accent. Luxurious, imperial,
Chinese, VIP slot-machine lounge. Original artwork, no logos, no existing game
characters, no text, no letters, no numbers.
```

## 素材清單

| # | 素材 | 檔名 | 尺寸／形式 |
| --- | --- | --- | --- |
| 1 | 主要 CTA 金牌按鈕（無字） | `cta-primary.png` | 1536×512，純黑底 |
| 2 | 次要 CTA 外框按鈕（無字） | `cta-secondary.png` | 1536×512，純黑底 |
| 3 | 底部導覽圖示 5 款 × 一般／作用中 | `nav-sheet.png` → 切成 10 張 | 5×2 格 |
| 4 | 輪播橫幅 3 張（無字） | `banner-1..3.png` | 1536×1024 |
| 5 | 房間卡外框（可九宮格延展） | `card-frame.png` | 1024×1024 |
| 6 | 區塊標題掛牌（無字） | `plaque-title.png` | 1536×512 |
| 7 | 2×2 功能牌插圖 4 款 | `feature-sheet.png` → 切成 4 張 | 2×2 格 |
| 8 | 老虎機台圖示 25 款 | `slots-sheet.png` → 切成 25 張 | 5×5 格 |
| 9 | 名次印章 壹～伍 底圖（無字） | `rank-seal.png` | 512×512 |

## 提示詞

### 1. 主要 CTA 金牌按鈕
```
A single wide horizontal button plate for a mobile app, seen straight-on, centred on a
pure flat black background with generous empty margin. The plate is a solid gold-leaf
signboard with softly rounded ends, a bevelled raised rim, subtle cloud-scroll carvings
at both ends, and an empty smooth centre field reserved for text. Warm specular
highlight along the top edge. No text.
+ 共用風格段
```

### 2. 次要 CTA 外框按鈕
```
A single wide horizontal button plate, straight-on, centred on pure flat black. Black
lacquer centre field with a thin carved gold-leaf double border and small fret-pattern
corner ornaments; the centre is empty and dark, reserved for gold text. No text.
+ 共用風格段
```

### 3. 底部導覽圖示（5×2 格）
```
An icon sheet on pure flat black, a strict grid of 5 columns and 2 rows with equal empty
gutters, each cell one centred icon, all icons the same size and carving style. Columns
left to right: (1) a temple-roof pavilion for Home, (2) a slot-machine cabinet for
Machines, (3) a round coin medallion with a gold ingot for Budget Recommend,
(4) a bronze bell for Notifications, (5) a jade token badge for Member. Row 1: muted
dark-bronze carved versions (inactive). Row 2: the same icons in bright polished gold
leaf with a soft warm glow (active). No text, no labels.
+ 共用風格段
```

### 4. 輪播橫幅（3 張）
```
Banner 1: A wide horizontal promotional banner illustration for a mobile app: a row of
ornate black-and-gold slot-machine cabinets in a dim imperial lounge, gold coin
cascades, a gilded dragon carved on the back wall, warm lantern light. Leave the left
40% as calm dark space for overlaid text. No text.
Banner 2: A gilded signboard hanging under a black lacquer eave with red seal tassels,
glowing data-style golden light rays behind it suggesting live statistics; calm dark
right half for text. No text.
Banner 3: A smartphone-sized black lacquer tablet with gold-leaf trim floating above a
spread of gold ingots and jade tokens, suggesting installing the app to the home
screen; calm dark top area for text. No text.
+ 共用風格段
```

### 5. 房間卡外框
```
A single empty rectangular card frame for a mobile UI, straight-on on pure flat black:
a thin carved gold-leaf border with ornate corner pieces (cloud-scroll and fret motif)
in all four corners, plain straight edges between the corners so it can be 9-slice
stretched, and an empty black lacquer interior. No text.
+ 共用風格段
```

### 6. 區塊標題掛牌
```
A single wide horizontal hanging signboard plaque, straight-on on pure flat black:
black lacquer face with a carved gold-leaf border, two short gold chains at the top
corners, small cloud-scroll ornaments at both ends, empty centre for a title. No text.
+ 共用風格段
```

### 7. 功能牌插圖（2×2 格）
```
An illustration sheet on pure flat black, strict 2×2 grid with equal gutters, each cell
one centred square vignette in the same carved gold-leaf style:
(1) a golden lantern lighting one empty slot-machine stool — "featured free rooms";
(2) a gold abacus beside a stack of coins — "budget recommendation";
(3) a three-step gilded podium with a crown — "today's ranking";
(4) a long gallery row of slot-machine cabinets in perspective — "all machines".
No text.
+ 共用風格段
```

### 8. 老虎機台圖示 25 款（5×5 格）
```
An icon sheet on pure flat black: a strict 5×5 grid (25 cells) with equal empty gutters.
Each cell holds one small front-facing slot-machine cabinet icon, all the same height
and baseline, each a DIFFERENT original design: vary the cabinet silhouette (tall
tower, arched top, double screen, round porthole, pagoda roof, lotus crown, dragon
crest, phoenix crest, tiger crest, koi crest, coin crest, ingot crest, lantern top,
fan top, jade disc, temple door, drum shape, gourd shape, mountain crest, cloud
crest, bamboo frame, carp gate, qilin crest, peony crest, bell top), all in black
lacquer with gold-leaf trim, a glowing reel window and a small lever. Readable at
48px. No text, no numbers, no letters.
+ 共用風格段
```

### 9. 名次印章底圖
```
A single square carved seal stamp medallion, straight-on on pure flat black: round
gold-leaf rim with a cloud-scroll ring, a cinnabar-red lacquer centre left empty for
a character. No text.
+ 共用風格段
```

## 生成指令

```bash
# gen.sh <prompt 檔> <輸出 png 絕對路徑> <尺寸>
codex exec -s workspace-write -C <輸出資料夾> --skip-git-repo-check --ephemeral \
  "Use your built-in image generation tool (not code) to generate exactly ONE image at
   size <尺寸>, then copy the generated PNG to <輸出路徑>. IMAGE PROMPT: <提示詞>" \
  < /dev/null
```

注意：`codex exec` 必須接 `< /dev/null`，否則在背景執行時會卡在讀取 stdin。
