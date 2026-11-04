// 示意資料：採集服務（atg-collector）上線前，助手首頁一律用這份資料，並在畫面標示「示意數據」。
// 欄位對應執行計劃 1.1 的 RoomSnapshot；接上 /api/assistant/rooms 後整份移除。

export type RoomStatus = 'idle' | 'busy';

export interface DemoRoom {
  roomNo: string;
  game: string;
  status: RoomStatus;
  compositeScore: number;
  unopenedSpins: number;
  todayRtp: number;
  todayBet: number;
  todayProfit: number;
  /** 對應 public/assets/assistant/slots/ 的機台圖示編號（1–25） */
  slotIcon: number;
}

export const DEMO_UPDATED_AT = '14:32';

export const DEMO_TOP_ROOMS: DemoRoom[] = [
  { roomNo: '0088', game: '曜金傳說', status: 'idle', compositeScore: 832, unopenedSpins: 128, todayRtp: 96.8, todayBet: 1286400, todayProfit: -41165, slotIcon: 1 },
  { roomNo: '0315', game: '曜金傳說', status: 'idle', compositeScore: 811, unopenedSpins: 203, todayRtp: 97.1, todayBet: 865200, todayProfit: 12430, slotIcon: 2 },
  { roomNo: '0126', game: '曜金傳說', status: 'idle', compositeScore: 798, unopenedSpins: 76, todayRtp: 94.2, todayBet: 982000, todayProfit: -8650, slotIcon: 3 },
  { roomNo: '2193', game: '曜金傳說', status: 'idle', compositeScore: 776, unopenedSpins: 91, todayRtp: 95.6, todayBet: 79639, todayProfit: 10926, slotIcon: 4 },
  { roomNo: '0745', game: '曜金傳說', status: 'idle', compositeScore: 763, unopenedSpins: 160, todayRtp: 93.9, todayBet: 413870, todayProfit: -2210, slotIcon: 5 },
];

export const RANK_GLYPHS = ['壹', '貳', '參', '肆', '伍'] as const;
