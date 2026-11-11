#!/usr/bin/env python3
"""曜金訊號頁的 OG 圖與頂部背景：以遊戲原始符號合成（金色光柱＋三個符號與數量）。
   python3 scripts/intro/og-signal.py   →  public/intro/assets/og/signal.jpg、signal-art.webp
"""
import random
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1200, 630
SYM = 'docs/assistant-assets/signal-symbols/game-original/symbol_%s.png'
F = '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc'
S = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
PICKS = [('01', 3, '眼睛'), ('04', 2, '鐮刀'), ('07', 6, '紫寶石')]


def base():
    img = Image.new('RGBA', (W, H), (6, 5, 3, 255))
    glow = Image.new('L', (W, H), 0)
    ImageDraw.Draw(glow).ellipse((560, 40, 1260, 700), fill=140)
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img.alpha_composite(Image.merge('RGBA', (Image.new('L', (W, H), 80), Image.new('L', (W, H), 52), Image.new('L', (W, H), 14), glow)))
    r = random.Random(0xC0FFEE)
    rays = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(rays)
    hz = 520
    for _ in range(110):
        x = 540 + r.random() * 660
        h = (hz - 30) * (0.25 + 0.75 * r.random())
        a = int(70 + r.random() * 150)
        wide = r.random() < 0.2
        for k in range(int(h)):
            c = (255, 214, 140, int(a * (1 - k / h) ** 1.3))
            d.point((x, hz - k), fill=c)
            if wide:
                d.point((x + 1, hz - k), fill=c)
    img.alpha_composite(rays.filter(ImageFilter.GaussianBlur(0.7)))
    hl = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(hl).line((500, hz, W, hz), fill=(255, 226, 160, 190), width=2)
    img.alpha_composite(hl.filter(ImageFilter.GaussianBlur(1.4)))
    return img


def tight(n):
    im = Image.open(SYM % n).convert('RGBA')
    x0, y0, x1, y1 = im.getchannel('A').point(lambda v: 255 if v > 70 else 0).getbbox()
    return im.crop((x0, y0, x1, y1))


def symbols(img, x0, y0, size, gap):
    num = ImageFont.truetype(F, 46, index=3)
    nm = ImageFont.truetype(S, 22, index=3)
    d = ImageDraw.Draw(img)
    for i, (n, c, name) in enumerate(PICKS):
        s = tight(n)
        target = size * (0.78 if int(n) >= 5 else 1)
        k = target / max(s.size)
        s = s.resize((round(s.width * k), round(s.height * k)), Image.LANCZOS)
        cx = x0 + i * gap
        sh = Image.new('RGBA', img.size, (0, 0, 0, 0))
        ImageDraw.Draw(sh).ellipse((cx - size // 2, y0 + size // 2 - 4, cx + size // 2, y0 + size // 2 + 20), fill=(0, 0, 0, 170))
        img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(10)))
        img.alpha_composite(s, (cx - s.width // 2, y0 - s.height // 2))
        t = '×%d' % c
        d.text((cx - d.textlength(t, font=num) / 2, y0 + size // 2 + 16), t, font=num, fill=(255, 227, 166))
        d.text((cx - d.textlength(name, font=nm) / 2, y0 + size // 2 + 72), name, font=nm, fill=(214, 200, 170))


art = base()
symbols(art, 705, 260, 150, 190)
art.crop((520, 0, W, H)).convert('RGB').resize((900, int(900 * H / 680)), Image.LANCZOS).save('public/intro/assets/og/signal-art.webp', quality=78)

img = base()
symbols(img, 705, 260, 150, 190)
shade = Image.new('L', (W, H))
sd = ImageDraw.Draw(shade)
for x in range(640):
    sd.line((x, 0, x, H), fill=int(210 * (1 - x / 640) ** 1.3))
img.alpha_composite(Image.merge('RGBA', (Image.new('L', (W, H), 0),) * 3 + (shade,)))
d = ImageDraw.Draw(img)
x = 72
d.text((x, 170), '曜金訊號', font=ImageFont.truetype(F, 88, index=3), fill=(255, 227, 166))
d.text((x, 296), '盤面上的符號，一組只屬於此刻', font=ImageFont.truetype(F, 34, index=3), fill=(232, 194, 116))
d.line((x, 366, x + 300, 366), fill=(232, 194, 116), width=2)
d.text((x, 390), 'TOP 5 房間訊號 · 達標可買免遊', font=ImageFont.truetype(S, 24, index=3), fill=(220, 208, 184))
d.text((x, 530), 'luckyds.com', font=ImageFont.truetype(S, 22, index=3), fill=(170, 156, 128))
img.convert('RGB').save('public/intro/assets/og/signal.jpg', quality=86)
print('signal OG ok')
