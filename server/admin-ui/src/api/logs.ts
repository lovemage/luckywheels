import { api } from './client.js';

export interface ActionLogRow {
  id: string;
  adminUserId: string | null;
  adminUser: { id: string; email: string } | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payload: { before: unknown; after: unknown };
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

export function fetchLogs(q: { action?: string; targetType?: string; targetId?: string; from?: string; to?: string; take?: number; cursor?: string }): Promise<{ items: ActionLogRow[]; nextCursor: string | null }> {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== '') p.set(k, String(v));
  return api(`/api/admin/action-logs?${p.toString()}`);
}
