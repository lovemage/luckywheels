import { useState } from 'react';
import { submitOnboarding, fetchMe } from '../api/me.js';
import { ApiError } from '../api/client.js';
import { sessionStore } from '../state/session.js';

export function Onboarding() {
  const [nickname, setNickname] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      await submitOnboarding({ nickname, code });
      const me = await fetchMe();
      sessionStore.getState().setMe(me);
    } catch (e) {
      const ae = e as ApiError;
      const map: Record<string, string> = {
        NICKNAME_INVALID: '暱稱需為 2-12 字',
        ENTERTAINMENT_CODE_INVALID: '會員編號需為 6-20 字（英數字 _ -）',
        ENTERTAINMENT_CODE_TAKEN: '此會員編號已被綁定',
        ENTERTAINMENT_CODE_REASON_REQUIRED: '系統錯誤，請聯絡客服',
      };
      setErr(map[ae.code] ?? ae.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="onboarding">
      <h1>完成註冊</h1>
      <p>請填寫您的暱稱與娛樂城會員編號以開始抽獎</p>
      <form onSubmit={submit}>
        <label>
          暱稱
          <input
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            required
            minLength={2}
            maxLength={12}
          />
        </label>
        <label>
          娛樂城會員編號
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            pattern="[A-Za-z0-9_-]{6,20}"
          />
        </label>
        {err && (
          <p role="alert" className="error">
            {err}
          </p>
        )}
        <button type="submit" disabled={busy}>
          {busy ? '送出中…' : '確定送出'}
        </button>
      </form>
    </main>
  );
}
