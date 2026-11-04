import { api } from './client.js';

const BASE = '/api/admin/assistant/collector';

export interface CollectorSettings {
  intervalMinutes: number;
  detailBatchSize: number;
}

export interface CollectorAccount {
  id: string;
  label: string;
  casinoUrl: string;
  /** 遮罩後的帳號；伺服器未設定金鑰時為 null。密碼永遠不回傳。 */
  accountMasked: string | null;
  enabled: boolean;
  lastUsedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorOverview {
  keyConfigured: boolean;
  settings: CollectorSettings;
  activeAccountId: string | null;
  accounts: CollectorAccount[];
}

// 「略過」的輪次不會寫入 DB，所以這裡只有三種
export type CollectorRunStatus = 'running' | 'succeeded' | 'failed';

export interface CollectorRun {
  id: string;
  status: CollectorRunStatus;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  roomsListed: number;
  roomsDetailed: number;
  errorCode: string | null;
  errorMessage: string | null;
}

export interface CollectorRuns {
  items: CollectorRun[];
  rooms: { total: number; detailed: number };
  lastSucceededAt: string | null;
}

export interface CollectorAccountInput {
  label: string;
  casinoUrl: string;
  account: string;
  password: string;
  enabled: boolean;
}

export function fetchCollectorOverview(): Promise<CollectorOverview> {
  return api(BASE);
}

export function fetchCollectorRuns(take = 30): Promise<CollectorRuns> {
  return api(`${BASE}/runs?take=${take}`);
}

export function updateCollectorSettings(body: CollectorSettings): Promise<CollectorSettings> {
  return api(`${BASE}/settings`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function createCollectorAccount(body: CollectorAccountInput): Promise<CollectorAccount> {
  return api(`${BASE}/accounts`, { method: 'POST', body: JSON.stringify(body) });
}

export function updateCollectorAccount(id: string, body: Partial<CollectorAccountInput>): Promise<CollectorAccount> {
  return api(`${BASE}/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function deleteCollectorAccount(id: string): Promise<{ ok: true }> {
  return api(`${BASE}/accounts/${id}`, { method: 'DELETE' });
}
