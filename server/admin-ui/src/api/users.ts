import { api } from './client.js';

export interface AdminUserRow {
  id: string;
  nickname: string | null;
  displayName: string;
  pictureUrl: string | null;
  lineUserId: string;
  entertainmentMemberCode: string | null;
  accountType: 'verified' | 'test' | 'blacklisted';
  points: number;
  lifetimeDrawCount: number;
  blacklistedAt: string | null;
  createdAt: string;
}

export interface UsersListResponse {
  items: AdminUserRow[];
  nextCursor: string | null;
}

export interface UsersListQuery {
  tab?: 'verified' | 'test';
  q?: string;
  take?: number;
  cursor?: string;
}

export function fetchUsers(q: UsersListQuery): Promise<UsersListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined) params.set(k, String(v));
  }
  return api(`/api/admin/users?${params.toString()}`);
}

export interface AdminUserDetail extends AdminUserRow {
  testSkipCost: boolean;
  testForcePrizeId: string | null;
  blacklistReason: string | null;
  blacklistedByAdminUserId: string | null;
  entertainmentCodeBoundAt: string | null;
}

export function fetchUser(id: string): Promise<AdminUserDetail> {
  return api(`/api/admin/users/${id}`);
}

export function adjustPoints(id: string, body: { delta: number; reason: string }): Promise<{ points: number }> {
  return api(`/api/admin/users/${id}/points`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function setAccountType(id: string, accountType: 'verified' | 'test'): Promise<{ ok: true }> {
  return api(`/api/admin/users/${id}/account-type`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountType }),
  });
}
