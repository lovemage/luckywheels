#!/usr/bin/env python3
"""改寫既有 OG 圖左側的文字列（底圖是 Codex CLI 生成、原始無字底圖沒留下來，所以就地擦掉再重寫）。
   python3 scripts/intro/og-retext.py
擦除方式：在文字框內逐欄，用框上緣與下緣的背景做垂直內插（左側是平滑暗色漸層，直向光柱也會保留）。
排版沿用 og-signal.py：標題 y=170／88px、副標 y=296／34px、分隔線 y=366、小字 y=390／24px。
每張圖都從 git 版本的原圖重做，可重複執行。
"""
import subprocess
from io import BytesIO
from PIL import Image, ImageDraw, ImageFont

F = '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc'
S = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
SUB = dict(y=296, box=(300, 346), font=(F, 34), fill=(232, 194, 116))
LINE3 = dict(y=390, box=(392, 430), font=(S, 24), fill=(220, 208, 184))

# (原圖 git 路徑, 輸出路徑, {欄位: (新文字, 擦除右界 x)})
JOBS = [
    ('public/intro/assets/og/home.jpg', 'public/intro/assets/og/home.jpg',
     {'line3': ('精選空台 · 房間訊號 · 本金推薦', 470)}),
    ('public/intro/assets/og/install.jpg', 'public/intro/assets/og/install.jpg',
     {'line3': ('Android 下載 · iPhone 用網頁版', 470)}),
    # 會員站根目錄 /：以 intro 首頁 OG 為底，副標與小字改成「數據助手＋輪盤」
    ('public/intro/assets/og/home.jpg', 'public/assets/og-image.jpg',
     {'sub': ('看機台數據，也轉幸運輪盤', 560),
      'line3': ('精選空台 · 房間訊號 · 幸運輪盤', 470)}),
]
BASE_REV = '42ae703'  # 改字前的版本


def erase(img, x0, x1, y0, y1):
    px = img.load()
    for x in range(x0, x1):
        top, bot = px[x, y0 - 1], px[x, y1 + 1]
        for y in range(y0, y1 + 1):
            t = (y - y0 + 1) / (y1 - y0 + 2)
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(top, bot))


def write(img, spec, text):
    d = ImageDraw.Draw(img)
    path, size = spec['font']
    d.text((72, spec['y']), text, font=ImageFont.truetype(path, size, index=3), fill=spec['fill'])


for src, out, edits in JOBS:
    raw = subprocess.run(['git', 'show', f'{BASE_REV}:{src}'], capture_output=True, check=True).stdout
    img = Image.open(BytesIO(raw)).convert('RGB')
    for key, (text, x1) in edits.items():
        spec = SUB if key == 'sub' else LINE3
        erase(img, 66, x1, *spec['box'])
        write(img, spec, text)
    img.save(out, quality=86)
    print('ok', out)
