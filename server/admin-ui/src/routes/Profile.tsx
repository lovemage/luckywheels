import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { changeMyAccount, changeMyPassword, fetchAdminMe } from '../api/me.js';
import { ApiError } from '../api/client.js';

export function Profile() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ['admin', 'me'], queryFn: fetchAdminMe });
  const [account, setAccount] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (me.data?.account) setAccount(me.data.account);
  }, [me.data?.account]);

  const accountMut = useMutation({
    mutationFn: changeMyAccount,
    onSuccess: (res) => {
      setOkMsg('帳號已更新');
      setErrMsg(null);
      setAccount(res.account);
      setAccountPassword('');
      qc.invalidateQueries({ queryKey: ['admin', 'me'] });
    },
    onError: (e: unknown) => {
      setOkMsg(null);
      if (e instanceof ApiError) {
        const map: Record<string, string> = {
          ADMIN_ACCOUNT_INVALID: '請輸入帳號',
          ADMIN_ACCOUNT_TAKEN: '此帳號已被使用',
          CURRENT_PASSWORD_WRONG: '目前密碼錯誤',
        };
        setErrMsg(map[e.code] ?? `更新失敗（${e.code}）`);
      } else {
        setErrMsg('更新失敗');
      }
    },
  });

  const passwordMut = useMutation({
    mutationFn: changeMyPassword,
    onSuccess: () => {
      setOkMsg('密碼已更新');
      setErrMsg(null);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: (e: unknown) => {
      setOkMsg(null);
      if (e instanceof ApiError) {
        const map: Record<string, string> = {
          CURRENT_PASSWORD_WRONG: '目前密碼錯誤',
          PASSWORD_BODY_INVALID: '欄位格式錯誤',
        };
        setErrMsg(map[e.code] ?? `更新失敗（${e.code}）`);
      } else {
        setErrMsg('更新失敗');
      }
    },
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);
    if (newPassword !== confirmPassword) {
      setErrMsg('兩次輸入的新密碼不一致');
      return;
    }
    passwordMut.mutate({ currentPassword, newPassword });
  }

  function onAccountSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOkMsg(null);
    setErrMsg(null);
    const nextAccount = account.trim();
    if (!nextAccount) {
      setErrMsg('請輸入帳號');
      return;
    }
    accountMut.mutate({ currentPassword: accountPassword, account: nextAccount });
  }

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Profile</p>
          <h1>個人設定</h1>
          <p>更新管理員帳號與登入密碼。</p>
        </div>
      </header>
      <div className="member-detail-grid">
        <section className="member-detail-card">
          <h2>變更帳號</h2>
          <form onSubmit={onAccountSubmit} className="admin-form-grid">
            <label>
              <span>目前帳號</span>
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                required
              />
              <small>帳號格式不限，可自由設定。</small>
            </label>
            <label>
              <span>目前密碼</span>
              <input
                type="password"
                value={accountPassword}
                onChange={(e) => setAccountPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={accountMut.isPending || me.isLoading}>
              {accountMut.isPending ? '更新中…' : '更新帳號'}
            </button>
          </form>
        </section>
        <section className="member-detail-card">
          <h2>變更密碼</h2>
          <form onSubmit={onSubmit} className="admin-form-grid">
            <label>
              <span>目前密碼</span>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </label>
            <label>
              <span>新密碼</span>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </label>
            <label>
              <span>再次輸入新密碼</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={passwordMut.isPending}>{passwordMut.isPending ? '更新中…' : '更新密碼'}</button>
          </form>
        </section>
      </div>
      {okMsg && <p className="admin-success-text">{okMsg}</p>}
      {errMsg && <p className="member-detail-error">{errMsg}</p>}
    </section>
  );
}
