import type { SignalSymbol } from '../api/assistant.js';

// 戰神賽特 II 的盤面符號（曜金訊號用；圖片取自遊戲，public/assets/assistant/atg/）。
// 對應 server/src/assistant/signal.ts 的 SIGNAL_SYMBOLS。

export const ATG_SYMBOLS: Record<SignalSymbol, { name: string; img: string }> = {
  eye: { name: '眼睛', img: '/assets/assistant/atg/symbol_01.webp' },
  cobra: { name: '眼鏡蛇', img: '/assets/assistant/atg/symbol_02.webp' },
  bow: { name: '弓', img: '/assets/assistant/atg/symbol_03.webp' },
  sickle: { name: '鐮刀', img: '/assets/assistant/atg/symbol_04.webp' },
  gem_yellow: { name: '黃寶石', img: '/assets/assistant/atg/symbol_05.webp' },
  gem_red: { name: '紅寶石', img: '/assets/assistant/atg/symbol_06.webp' },
  gem_purple: { name: '紫寶石', img: '/assets/assistant/atg/symbol_07.webp' },
  gem_blue: { name: '藍寶石', img: '/assets/assistant/atg/symbol_08.webp' },
  gem_green: { name: '綠寶石', img: '/assets/assistant/atg/symbol_09.webp' },
};

export const atgSymbol = (s: string) => ATG_SYMBOLS[s as SignalSymbol] ?? ATG_SYMBOLS.eye;
