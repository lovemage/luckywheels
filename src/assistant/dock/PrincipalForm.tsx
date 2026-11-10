import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../../api/client.js';
import { fetchRecommendConfig, postRecommend, type RecommendConfig, type RecommendTier, type ScoredRoom } from '../../api/assistant.js';
import { fmtInt } from '../format.js';
import { fmtPoints, startGuard, updateGuardSettings } from './guard.js';

// 駐守小卡的「依本金推薦」（2026-11-10 業主）：輸入本金與目標倍數 → 伺服器依級距門檻推薦空台（同網頁版本金推薦），
// 同時把守護設成：停利＝贏到 +本金×目標倍數（1 萬、2 倍 → +2 萬，打到 3 萬提醒）、停損＝輸掉本金的 80%（1 萬輸到剩 2 千提醒）。
// 原本的直接推薦（綜合／精品）保留。

export interface PrincipalPlan {
  principal: number;
  multiplier: number;
}

/** 停損＝本金的 80% */
export const LOSS_RATIO = 0.8;
export const guardLinesFor = (p: PrincipalPlan) => ({ profit: p.principal * p.multiplier, loss: Math.round(p.principal * LOSS_RATIO) });

const PRESETS = [3000, 5000, 10000, 30000];
const MAX_PRINCIPAL = 100_000_000;
const KEY = 'lw.dock.principal';

export function readPlan(): PrincipalPlan | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return v && Number.isInteger(v.principal) && v.principal > 0 && Number.isInteger(v.multiplier) && v.multiplier > 0 ? v : null;
  } catch {
    return null;
  }
}
function savePlan(p: PrincipalPlan) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* 無痕模式：不記住 */
  }
}

function tierFor(principal: number, tiers: RecommendTier[]): RecommendTier | null {
  if (tiers.length === 0) return null;
  let i = 0;
  while (i + 1 < tiers.length && principal >= tiers[i + 1]!.minPrincipal) i++;
  return tiers[i]!;
}

const ERRORS: Record<string, string> = {
  MULTIPLIER_NOT_ALLOWED: '這個本金不能選這麼高的倍數，請降低目標倍數',
  RECOMMEND_INPUT_INVALID: '請輸入正確的本金金額',
  GAME_NOT_FOUND: '目前沒有可推薦的遊戲',
};

/** 依本金推薦的空台（給小卡用的格式） */
export async function fetchPrincipalRooms(plan: PrincipalPlan): Promise<ScoredRoom[]> {
  const r = await postRecommend(plan.principal, plan.multiplier);
  return r.items.map((i) => ({ ...i.room, score: i.score, premium: i.premium }));
}

export function PrincipalForm({
  onApply,
  onCancel,
  onExpired,
}: {
  onApply: (plan: PrincipalPlan, rooms: ScoredRoom[]) => void;
  onCancel: () => void;
  onExpired: () => void;
}) {
  const initial = readPlan();
  const [config, setConfig] = useState<RecommendConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [principalText, setPrincipalText] = useState(initial ? fmtInt(initial.principal) : '');
  const [multiplier, setMultiplier] = useState(initial?.multiplier ?? 1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchRecommendConfig()
      .then((c) => alive && setConfig(c))
      .catch(() => alive && setConfigError(true));
    return () => {
      alive = false;
    };
  }, []);

  const principal = Number(principalText.replace(/\D/g, '')) || 0;
  const tier = useMemo(() => (config ? tierFor(principal, config.tiers) : null), [config, principal]);
  const maxMultiplier = tier?.maxMultiplier ?? 1;

  useEffect(() => {
    if (config && multiplier > maxMultiplier) setMultiplier(maxMultiplier);
  }, [config, maxMultiplier, multiplier]);

  const lines = principal > 0 ? guardLinesFor({ principal, multiplier }) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (principal < 1) {
      setError('請先輸入本金');
      return;
    }
    const plan = { principal, multiplier };
    setBusy(true);
    setError(null);
    try {
      const rooms = await fetchPrincipalRooms(plan);
      savePlan(plan);
      updateGuardSettings(guardLinesFor(plan));
      startGuard(); // 以目前點數為本金起點；不在遊戲畫面時之後再按「開始」
      onApply(plan, rooms);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ASSISTANT_EXPIRED') onExpired();
      else setError(err instanceof ApiError ? (ERRORS[err.code] ?? '推薦暫時無法取得，請稍後再試') : '連線失敗，請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="aa-dock-principal" onSubmit={submit} noValidate aria-label="依本金推薦">
      <label className="aa-dock-principal-field">
        <span>本金</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          placeholder="例：10,000"
          value={principalText}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
            setPrincipalText(digits ? fmtInt(Math.min(Number(digits) || 0, MAX_PRINCIPAL)) : '');
          }}
        />
      </label>
      <div className="aa-guard-presets" role="group" aria-label="常用本金">
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`aa-guard-chip${principal === p ? ' is-on' : ''}`} onClick={() => setPrincipalText(fmtInt(p))}>
            {fmtInt(p)}
          </button>
        ))}
      </div>
      <div className="aa-dock-principal-mults" role="group" aria-label="目標倍數">
        <span>目標</span>
        {Array.from({ length: config?.maxMultiplier ?? 5 }, (_, i) => i + 1).map((m) => (
          <button
            key={m}
            type="button"
            className={`aa-dock-tab${multiplier === m ? ' is-on' : ''}`}
            aria-pressed={multiplier === m}
            disabled={!!config && m > maxMultiplier}
            onClick={() => setMultiplier(m)}
          >
            {m} 倍
          </button>
        ))}
      </div>
      <p className="aa-dock-note">
        {configError
          ? '推薦設定載入失敗，請稍後再試'
          : lines
            ? `守護自動設為：停利 ${fmtPoints(lines.profit)}、停損 ${fmtPoints(-lines.loss)}（本金 8 成）`
            : '輸入本金後，守護會自動設為停利＝本金×倍數、停損＝本金 8 成'}
      </p>
      {error && (
        <p className="aa-dock-note aa-dock-principal-error" role="alert">
          {error}
        </p>
      )}
      <div className="aa-dock-actions">
        <button type="button" className="aa-dock-btn" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="aa-dock-btn aa-dock-btn--solid" disabled={busy || !config} aria-busy={busy}>
          {busy ? '挑選中…' : '推薦並設定守護'}
        </button>
      </div>
    </form>
  );
}
