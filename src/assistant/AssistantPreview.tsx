import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { ApiError } from '../api/client.js';
import { fetchAssistantMe, type AssistantMe } from '../api/assistant.js';
import type { MeProfile } from '../state/session.js';
import { ASSISTANT_BRAND } from './brand.js';

// 新版（數據助手）外框。上線前只有通過預覽閘門的人看得到；
// M5 的助手首頁、本金推薦、房間列表、兌換等畫面陸續放進 <main> 裡。

const EXPIRES_FORMAT = new Intl.DateTimeFormat('zh-TW', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function remaining(seconds: number) {
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return [d && `${d} 天`, h && `${h} 小時`, `${m} 分`].filter(Boolean).join(' ');
}

export function AssistantPreview({ me, onExit, onLocked }: { me: MeProfile; onExit: () => void; onLocked: () => void }) {
  const [data, setData] = useState<AssistantMe | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchAssistantMe()
      .then((d) => alive && setData(d))
      .catch((e: unknown) => {
        if (!alive) return;
        // 預覽 cookie 過期或預覽已關閉 → 回原版
        if (e instanceof ApiError && e.status === 404) onLocked();
        else setError('資料載入失敗，請稍後再試');
      });
    return () => {
      alive = false;
    };
  }, [onLocked]);

  return (
    <main className="showcase">
      <section className="phone-shell assistant-shell" aria-label={ASSISTANT_BRAND}>
        <header className="assistant-topbar">
          <button type="button" className="assistant-back" onClick={onExit}>
            <ArrowLeft aria-hidden="true" />
            <span>回原版輪盤</span>
          </button>
          <span className="assistant-badge">測試版</span>
        </header>

        <div className="assistant-body">
          <h1 className="assistant-title">{ASSISTANT_BRAND}</h1>
          <p className="assistant-lede">{me.nickname ?? me.displayName}，這裡是上線前的新版預覽，畫面會陸續更新。</p>

          <section className="assistant-panel" aria-labelledby="assistant-pass-title">
            <h2 id="assistant-pass-title">我的使用期限</h2>
            {error ? (
              <p className="assistant-error" role="alert">{error}</p>
            ) : !data ? (
              <p className="assistant-muted">載入中…</p>
            ) : (
              <dl className="assistant-stats">
                <div>
                  <dt>積分</dt>
                  <dd>{data.points}</dd>
                </div>
                <div>
                  <dt>狀態</dt>
                  <dd>{data.pass.active ? '使用中' : data.pass.expiresAt ? '已到期' : '未開通'}</dd>
                </div>
                {data.pass.active && data.pass.expiresAt && (
                  <div className="assistant-stats-wide">
                    <dt>到期</dt>
                    <dd>
                      {EXPIRES_FORMAT.format(new Date(data.pass.expiresAt))}
                      <small>（剩 {remaining(data.pass.remainingSeconds)}）</small>
                    </dd>
                  </div>
                )}
              </dl>
            )}
          </section>

          <section className="assistant-panel" aria-labelledby="assistant-plans-title">
            <h2 id="assistant-plans-title">積分兌換方案</h2>
            {data && data.plans.length > 0 ? (
              <ul className="assistant-plans">
                {data.plans.map((p) => (
                  <li key={p.points}>{p.label}</li>
                ))}
              </ul>
            ) : (
              <p className="assistant-muted">{data ? '目前沒有兌換方案' : '載入中…'}</p>
            )}
            <p className="assistant-muted">方案由後台設定，調整後這裡會同步更新。</p>
          </section>
        </div>
      </section>
    </main>
  );
}
