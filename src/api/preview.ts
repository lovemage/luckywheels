import { api } from './client.js';

// 上線前「新版」預覽入口（後端 DATA_ASSISTANT_ENABLED=preview 時才顯示）

export interface PreviewStatus {
  /** 首頁是否顯示「新版」入口 */
  entry: boolean;
  /** 是否可進入新版 */
  unlocked: boolean;
}

export const fetchPreviewStatus = () => api<PreviewStatus>('/api/layout-preview');

export const previewLogin = (account: string, password: string) =>
  api<{ unlocked: true }>('/api/layout-preview/login', {
    method: 'POST',
    body: JSON.stringify({ account, password }),
  });

export const previewLogout = () => api<{ unlocked: false }>('/api/layout-preview/logout', { method: 'POST' });
