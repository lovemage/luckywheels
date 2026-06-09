import { api } from './client.js';

export interface RedemptionRow {
  id: string;
  code: string;
  tier: 'single' | 'multi';
  status: 'pending' | 'delivered' | 'cancelled';
  createdAt: string;
  statusChangedAt: string | null;
  isTest: boolean;
  totalWinAmount: number;
  user: { id: string; nickname: string | null; displayName: string; entertainmentMemberCode: string | null };
}

export interface RedemptionsListQuery {
  status?: string;
  tier?: string;
  code?: string;
  userId?: string;
  take?: number;
  cursor?: string;
}

export function fetchRedemptions(q: RedemptionsListQuery): Promise<{ items: RedemptionRow[]; nextCursor: string | null }> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) params.set(k, String(v));
  return api(`/api/admin/redemptions?${params.toString()}`);
}

export interface RedemptionDetail {
  id: string;
  code: string;
  tier: 'single' | 'multi';
  status: 'pending' | 'delivered' | 'cancelled';
  createdAt: string;
  statusChangedAt: string | null;
  statusChangedByAdminUser: { id: string; email: string } | null;
  cancelReason: string | null;
  totalWinAmount: number;
  isTest: boolean;
  user: { id: string; nickname: string | null; displayName: string; lineUserId: string; entertainmentMemberCode: string | null };
  draws: {
    id: string;
    subIndex: number;
    prize: { id: string; name: string };
    tierCost: number;
    winningCashAmount: number;
    createdAt: string;
    isTest: boolean;
    gatedBy: string | null;
  }[];
}

export function fetchRedemption(id: string): Promise<RedemptionDetail> {
  return api(`/api/admin/redemptions/${id}`);
}

export function setRedemptionStatus(id: string, body: { action: 'claim' | 'void' | 'unclaim'; reason?: string }) {
  return api<{ ok: true }>(`/api/admin/redemptions/${id}/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export interface ResetAllResult {
  ok: true;
  deletedRedemptions: number;
  deletedDrawLogs: number;
  usersReset: number;
}

/** Danger: wipes ALL redemptions + draw logs and zeroes every member's points/counters. */
export function resetAllRedemptions(): Promise<ResetAllResult> {
  return api('/api/admin/redemptions/reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET' }),
  });
}
