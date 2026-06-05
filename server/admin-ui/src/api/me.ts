import { api } from './client.js';

export function changeMyPassword(body: { currentPassword: string; newPassword: string }): Promise<{ ok: true }> {
  return api('/api/admin/me/password', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
