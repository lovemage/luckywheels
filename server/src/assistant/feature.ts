// 數據助手功能旗標。每次呼叫都讀環境變數（測試可直接切換）。
//   DATA_ASSISTANT_ENABLED=true     → 全面開放（正式上線）
//   DATA_ASSISTANT_ENABLED=preview  → 上線前預覽：後台與採集照常運作；會員端助手 API 只對
//                                     持有預覽 cookie（首頁「新版」入口輸入預覽帳密）的人開放
//   其他／未設定                     → 關閉：助手 API 回 404、後台不顯示選單、collector 只待命
export type DataAssistantMode = 'off' | 'preview' | 'public';

export function dataAssistantMode(): DataAssistantMode {
  const v = process.env.DATA_ASSISTANT_ENABLED;
  if (v === 'true') return 'public';
  if (v === 'preview') return 'preview';
  return 'off';
}

/** 後台、採集是否運作（預覽與正式上線都算） */
export const dataAssistantEnabled = (): boolean => dataAssistantMode() !== 'off';
