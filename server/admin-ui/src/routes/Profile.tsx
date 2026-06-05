import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { changeMyPassword } from '../api/me.js';
import { ApiError } from '../api/client.js';

export function Profile() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const mut = useMutation({
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
          NEW_PASSWORD_TOO_SHORT: '新密碼長度需至少 12 個字元',
          NEW_PASSWORD_SAME_AS_OLD: '新密碼不可與目前密碼相同',
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
    if (newPassword.length < 12) {
      setErrMsg('新密碼長度需至少 12 個字元');
      return;
    }
    mut.mutate({ currentPassword, newPassword });
  }

  return (
    <section style={{ maxWidth: 480 }}>
      <h1>個人設定</h1>
      <h2>變更密碼</h2>
      <form onSubmit={onSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>目前密碼</label>
          <input
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={{ width: '100%', padding: 6 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>新密碼（至少 12 個字元）</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={12}
            style={{ width: '100%', padding: 6 }}
          />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4 }}>再次輸入新密碼</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
            style={{ width: '100%', padding: 6 }}
          />
        </div>
        <button type="submit" disabled={mut.isPending}>{mut.isPending ? '更新中…' : '更新密碼'}</button>
      </form>
      {okMsg && <p style={{ color: '#15803d', marginTop: 12 }}>{okMsg}</p>}
      {errMsg && <p style={{ color: '#b91c1c', marginTop: 12 }}>{errMsg}</p>}
    </section>
  );
}
