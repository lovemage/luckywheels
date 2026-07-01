import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createSubAccount,
  deleteSubAccount,
  fetchSubAccounts,
  updateSubAccount,
  type SubAccount,
} from '../api/sub-accounts.js';
import type { AdminNavKey } from '../api/me.js';
import { ApiError } from '../api/client.js';

const navOptions: Array<{ key: AdminNavKey; label: string }> = [
  { key: 'users', label: '會員列表' },
  { key: 'redemptions', label: '中獎紀錄' },
  { key: 'prizes', label: '獎品設定' },
  { key: 'system', label: '系統設定' },
];

function emptyForm() {
  return { account: '', password: '', allowedNavs: [] as AdminNavKey[] };
}

export function SubAccounts() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'sub-accounts'], queryFn: fetchSubAccounts });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const editing = useMemo(
    () => list.data?.items.find((item) => item.id === editingId) ?? null,
    [editingId, list.data?.items],
  );

  useEffect(() => {
    if (!editing) {
      setForm(emptyForm());
      return;
    }
    setForm({ account: editing.email, password: '', allowedNavs: editing.allowedNavs });
  }, [editing]);

  const onError = (e: unknown) => {
    setMessage(null);
    if (e instanceof ApiError) {
      const map: Record<string, string> = {
        SUB_ACCOUNT_TAKEN: '此登入帳號已被使用',
        SUB_ACCOUNT_BODY_INVALID: '欄位格式錯誤',
        ADMIN_MAIN_REQUIRED: '只有主帳號可以管理子帳號',
      };
      setError(map[e.code] ?? `操作失敗（${e.code}）`);
      return;
    }
    setError('操作失敗');
  };

  const createMut = useMutation({
    mutationFn: createSubAccount,
    onSuccess: () => {
      setMessage('子帳號已新增');
      setError(null);
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: ['admin', 'sub-accounts'] });
    },
    onError,
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateSubAccount>[1] }) => updateSubAccount(id, body),
    onSuccess: () => {
      setMessage('子帳號已更新');
      setError(null);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin', 'sub-accounts'] });
    },
    onError,
  });

  const deleteMut = useMutation({
    mutationFn: deleteSubAccount,
    onSuccess: () => {
      setMessage('子帳號已刪除');
      setError(null);
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ['admin', 'sub-accounts'] });
    },
    onError,
  });

  function toggleNav(key: AdminNavKey) {
    setForm((prev) => ({
      ...prev,
      allowedNavs: prev.allowedNavs.includes(key)
        ? prev.allowedNavs.filter((v) => v !== key)
        : [...prev.allowedNavs, key],
    }));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setMessage(null);
    setError(null);
    const account = form.account.trim();
    if (!account) {
      setError('請輸入登入帳號');
      return;
    }
    if (!editingId && !form.password) {
      setError('新增子帳號需輸入密碼');
      return;
    }
    if (editingId) {
      updateMut.mutate({
        id: editingId,
        body: {
          account,
          allowedNavs: form.allowedNavs,
          ...(form.password ? { password: form.password } : {}),
        },
      });
    } else {
      createMut.mutate({ account, password: form.password, allowedNavs: form.allowedNavs });
    }
  }

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Sub Accounts</p>
          <h1>子帳設定</h1>
          <p>設定子帳號登入帳號與可見的管理導覽。</p>
        </div>
      </header>

      <div className="member-detail-grid">
        <section className="member-detail-card">
          <h2>{editingId ? '編輯子帳號' : '新增子帳號'}</h2>
          <form className="admin-form-grid" onSubmit={submit}>
            <label>
              <span>登入帳號</span>
              <input value={form.account} onChange={(e) => setForm({ ...form, account: e.target.value })} required />
            </label>
            <label>
              <span>{editingId ? '新密碼（留空不變）' : '登入密碼'}</span>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required={!editingId}
              />
            </label>
            <fieldset>
              <legend>可看到的 Admin 導覽</legend>
              <div className="admin-checkbox-grid">
                {navOptions.map((nav) => (
                  <label key={nav.key}>
                    <input
                      type="checkbox"
                      checked={form.allowedNavs.includes(nav.key)}
                      onChange={() => toggleNav(nav.key)}
                    />
                    <span>{nav.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="member-detail-actions">
              <button type="submit" disabled={createMut.isPending || updateMut.isPending}>
                {editingId ? '更新子帳號' : '新增子帳號'}
              </button>
              {editingId && (
                <button type="button" onClick={() => setEditingId(null)}>
                  取消
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="member-detail-card admin-table-card">
          <h2>子帳號列表</h2>
          {list.isLoading ? (
            <p>載入中…</p>
          ) : (
            <table className="admin-prize-table">
              <thead>
                <tr>
                  <th>帳號</th>
                  <th>導覽權限</th>
                  <th>最後登入</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {(list.data?.items ?? []).map((item: SubAccount) => (
                  <tr key={item.id}>
                    <td>{item.email}</td>
                    <td>{item.allowedNavs.map((key) => navOptions.find((n) => n.key === key)?.label ?? key).join('、') || '未設定'}</td>
                    <td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString() : '尚未登入'}</td>
                    <td>
                      <div className="member-detail-actions">
                        <button type="button" onClick={() => setEditingId(item.id)}>編輯</button>
                        <button type="button" className="danger" onClick={() => deleteMut.mutate(item.id)}>刪除</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {list.data?.items.length === 0 && (
                  <tr>
                    <td colSpan={4}>尚無子帳號</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>
      {message && <p className="admin-success-text">{message}</p>}
      {error && <p className="member-detail-error">{error}</p>}
    </section>
  );
}
