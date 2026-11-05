import { api } from './client.js';

// 助手是否開放（後端 DATA_ASSISTANT_ENABLED）。unlocked=false 時首頁退回輪盤

export interface PreviewStatus {
  /** 首頁是否顯示「新版」入口 */
  entry: boolean;
  /** 是否可進入新版 */
  unlocked: boolean;
}

export const fetchPreviewStatus = () => api<PreviewStatus>('/api/layout-preview');
