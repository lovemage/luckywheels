# 數據助手字型

| 檔案 | 字型 | 授權 | 用途 |
| --- | --- | --- | --- |
| `wenkai-tc-*.woff2` | LXGW WenKai TC（霞鶩文楷） | SIL OFL 1.1（見 `OFL.txt`） | 預覽入口視窗標題 |
| `yj-display.woff2` | Noto Serif CJK TC SemiBold 子集 | SIL OFL 1.1（Google / Adobe，Noto CJK） | 新版標題、數字 |

`yj-display.woff2` 只含 `src/assistant/` 用到的字。改了新版的中文文案後，請重跑
`python3 scripts/subset-display-font.py`，否則新字會退回系統襯線字。
