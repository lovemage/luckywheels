import { api } from './client.js';

export type AdminNavKey = 'users' | 'redemptions' | 'prizes' | 'system';

export interface AdminMe {
  id: string;
  account: string;
  email: string;
  role: string;
  isMain: boolean;
  allowedNavs: AdminNavKey[];
  lastLoginAt: string | null;
  passwordChangedAt: string | null;
}

export function fetchAdminMe(): Promise<AdminMe> {
  return api('/api/admin/me');
}

export function changeMyAccount(body: { currentPassword: string; account: string }): Promise<{ ok: true; account: string }> {
  return api('/api/admin/me/account', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export function changeMyPassword(body: { currentPassword: string; newPassword: string }): Promise<{ ok: true }> {
  return api('/api/admin/me/password', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
