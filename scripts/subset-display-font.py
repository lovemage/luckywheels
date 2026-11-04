#!/usr/bin/env python3
"""重新產生數據助手標題字子集 public/assets/assistant/fonts/yj-display.woff2。

來源：Noto Serif CJK TC SemiBold（SIL OFL 1.1，Debian 套件 fonts-noto-cjk 的
/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc，第 3 個字型＝TC）。
字集：src/assistant/ 底下所有 .ts/.tsx 用到的中日韓字，加 ASCII 與常用全形標點。
新增或改動新版畫面的中文文案後，重跑：python3 scripts/subset-display-font.py
（需要 pip install fonttools brotli）
"""
import glob
from fontTools.ttLib import TTFont
from fontTools import subset

SRC = '/usr/share/fonts/opentype/noto/NotoSerifCJK-SemiBold.ttc'
OUT = 'public/assets/assistant/fonts/yj-display.woff2'

chars = {chr(c) for c in range(0x20, 0x7F)} | set('·–—，、：（）「」％×')
for path in glob.glob('src/assistant/**/*.ts*', recursive=True):
    chars |= {ch for ch in open(path, encoding='utf-8').read() if ord(ch) > 0x2E80}

opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = ['kern', 'palt', 'liga']
opts.name_IDs = ['*']
opts.notdef_outline = True
font = TTFont(SRC, fontNumber=3)
sub = subset.Subsetter(opts)
sub.populate(text=''.join(sorted(chars)))
sub.subset(font)
font.flavor = 'woff2'
font.save(OUT)
print(f'{OUT}: {len(chars)} glyphs')
