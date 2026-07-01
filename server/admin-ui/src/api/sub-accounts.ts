import { api } from './client.js';
import type { AdminNavKey } from './me.js';

export interface SubAccount {
  id: string;
  email: string;
  allowedNavs: AdminNavKey[];
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function fetchSubAccounts(): Promise<{ items: SubAccount[] }> {
  return api('/api/admin/sub-accounts');
}

export function createSubAccount(body: {
  account: string;
  password: string;
  allowedNavs: AdminNavKey[];
}): Promise<SubAccount> {
  return api('/api/admin/sub-accounts', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateSubAccount(
  id: string,
  body: { account?: string; password?: string; allowedNavs?: AdminNavKey[] },
): Promise<SubAccount> {
  return api(`/api/admin/sub-accounts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });
}

export function deleteSubAccount(id: string): Promise<{ ok: true }> {
  return api(`/api/admin/sub-accounts/${id}`, { method: 'DELETE' });
}
