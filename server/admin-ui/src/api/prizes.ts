import { api } from './client.js';

export interface AdminPrize {
  id: string;
  rankLabel: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  cashAmount: number;
  weight: number;
  stock: number;
  segmentColor: string;
  textColor: string;
  isConsolation: boolean;
  enabled: boolean;
  wheelPosition: number;
  createdAt: string;
  updatedAt: string;
}

export type PrizeCreate = Omit<AdminPrize, 'id' | 'wheelPosition' | 'createdAt' | 'updatedAt'>;
export type PrizeUpdate = Partial<PrizeCreate>;

export function fetchPrizes(): Promise<{ items: AdminPrize[] }> {
  return api('/api/admin/prizes');
}
export function fetchPrize(id: string): Promise<AdminPrize> {
  return api(`/api/admin/prizes/${id}`);
}
export function createPrize(body: PrizeCreate): Promise<AdminPrize> {
  return api('/api/admin/prizes', { method: 'POST', body: JSON.stringify(body) });
}
export function updatePrize(id: string, body: PrizeUpdate): Promise<AdminPrize> {
  return api(`/api/admin/prizes/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
}
export function deletePrize(id: string): Promise<void> {
  return api(`/api/admin/prizes/${id}`, { method: 'DELETE' });
}
export function reorderPrizes(ids: string[]): Promise<{ ok: true }> {
  return api('/api/admin/prizes/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) });
}
