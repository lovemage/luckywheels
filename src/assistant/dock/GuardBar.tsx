import { useState, useSyncExternalStore } from 'react';
import {
  GUARD_MAX,
  ackGuard,
  fmtPoints,
  guardMessage,
  guardState,
  sessionPnl,
  startGuard,
  stopGuard,
  subscribeGuard,
  updateGuardSettings,
} from './guard.js';

// 駐守小卡的「守護」區塊：本場損益、停損／停利兩條線常駐顯示，撞線時顯示提醒。
// 只提醒，不替會員停止遊戲。

const PRESETS = [1000, 3000, 5000, 10000, 15000, 20000];

/** compact：精簡小卡只顯示損益、兩條線與開始／結束（設定在展開後才有） */
export function GuardBar({ compact = false }: { compact?: boolean }) {
  const { settings, session, balance, freeGame } = useSyncExternalStore(subscribeGuard, guardState);
  const [editing, setEditing] = useState(false);
  const [needGame, setNeedGame] = useState(false);
  const pnl = session && balance !== null ? sessionPnl(session, balance) : null;
  const lines = compact
    ? `${settings.loss ? fmtPoints(-settings.loss) : '—'} / ${settings.profit ? fmtPoints(settings.profit) : '—'}`
    : `停損 ${settings.loss ? fmtPoints(-settings.loss) : '不設'} · 停利 ${settings.profit ? fmtPoints(settings.profit) : '不設'}`;

  function start() {
    const ok = startGuard();
    setNeedGame(!ok);
  }

  return (
    <section className={`aa-guard${compact ? ' is-compact' : ''}`} aria-label="守護（止盈止損）">
      {session?.pending && (
        <div className={`aa-guard-alert is-${session.pending}`} role="alert">
          <p>{guardMessage(session.pending, settings, pnl ?? 0)}</p>
          <button type="button" className="aa-dock-btn" onClick={ackGuard}>
            知道了
          </button>
        </div>
      )}

      <div className="aa-guard-row">
        <div className="aa-guard-info">
          <span className="aa-guard-label">{session ? (compact ? '本場' : '本場損益') : compact ? '守護' : '守護 · 止盈止損'}</span>
          {session ? (
            <span className={`aa-guard-pnl${pnl === null ? '' : pnl > 0 ? ' is-up' : pnl < 0 ? ' is-down' : ''}`}>
              {pnl === null ? '—' : fmtPoints(pnl)}
            </span>
          ) : null}
          <span className="aa-guard-lines">{lines}</span>
        </div>
        {!compact && (
          <button type="button" className="aa-dock-btn" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
            設定
          </button>
        )}
        {session ? (
          <button type="button" className="aa-dock-btn" onClick={stopGuard}>
            結束
          </button>
        ) : (
          <button type="button" className="aa-dock-btn aa-dock-btn--solid" onClick={start}>
            開始
          </button>
        )}
      </div>
      {needGame && !session && <p className="aa-dock-note">請先進入遊戲，讀到點數後再開始守護</p>}
      {session && freeGame && <p className="aa-dock-note">免遊中：免遊結束、贏分入帳後再判斷停利／停損</p>}

      {editing && !compact && (
        <GuardForm
          profit={settings.profit}
          loss={settings.loss}
          onSave={(next) => {
            updateGuardSettings(next);
            setEditing(false);
          }}
          onRestart={session ? () => setNeedGame(!startGuard()) : undefined}
        />
      )}
    </section>
  );
}

function GuardForm({
  profit,
  loss,
  onSave,
  onRestart,
}: {
  profit: number;
  loss: number;
  onSave: (v: { profit: number; loss: number }) => void;
  onRestart?: () => void;
}) {
  const [p, setP] = useState(String(profit || ''));
  const [l, setL] = useState(String(loss || ''));
  const num = (s: string) => Math.min(GUARD_MAX, Math.max(0, Math.floor(Number(s.replace(/[^\d]/g, '')) || 0)));

  return (
    <form
      className="aa-guard-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ profit: num(p), loss: num(l) });
      }}
    >
      <label>
        <span>停損（輸到）</span>
        <input inputMode="numeric" placeholder="不設" value={l} onChange={(e) => setL(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <label>
        <span>停利（贏到）</span>
        <input inputMode="numeric" placeholder="不設" value={p} onChange={(e) => setP(e.target.value.replace(/[^\d]/g, ''))} />
      </label>
      <div className="aa-guard-presets" role="group" aria-label="快速設定（停損與停利相同）">
        {PRESETS.map((v) => (
          <button
            key={v}
            type="button"
            className="aa-guard-chip"
            onClick={() => {
              setP(String(v));
              setL(String(v));
            }}
          >
            ±{v.toLocaleString('en-US')}
          </button>
        ))}
      </div>
      <div className="aa-dock-actions">
        {onRestart && (
          <button type="button" className="aa-dock-btn" onClick={onRestart}>
            以目前點數重新起算
          </button>
        )}
        <button type="submit" className="aa-dock-btn aa-dock-btn--solid">
          儲存
        </button>
      </div>
      <p className="aa-dock-note aa-guard-hint">留空 = 不設。轉入／轉出點數會影響本場損益，轉點後請重新起算</p>
    </form>
  );
}
