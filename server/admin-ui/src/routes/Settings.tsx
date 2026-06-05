import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type SettingsUpdate } from '../api/settings.js';

export function Settings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [form, setForm] = useState<SettingsUpdate>({});
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data)
      setForm({
        pointThresholds: data.pointThresholds,
        spinDurationMs: data.spinDurationMs,
        minDrawsBeforeWin: data.minDrawsBeforeWin,
        cooldownDrawsAfterWin: data.cooldownDrawsAfterWin,
        payoutCapEnabled: data.payoutCapEnabled,
        payoutCapRatio: data.payoutCapRatio,
      });
  }, [data]);

  const mut = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <p>載入中…</p>;
  const thresholds = form.pointThresholds ?? [];

  return (
    <section>
      <h1>遊戲規則</h1>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>積分門檻（單抽 → 連抽）</legend>
        {thresholds.map((t, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
            <label>
              消耗積分{' '}
              <input
                type="number"
                value={t.points}
                onChange={(e) => {
                  const next = [...thresholds];
                  next[i] = { ...next[i]!, points: Number(e.target.value) };
                  setForm({ ...form, pointThresholds: next });
                }}
              />
            </label>
            <label>
              抽獎次數{' '}
              <input
                type="number"
                value={t.draws}
                onChange={(e) => {
                  const next = [...thresholds];
                  next[i] = { ...next[i]!, draws: Number(e.target.value) };
                  setForm({ ...form, pointThresholds: next });
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => setForm({ ...form, pointThresholds: thresholds.filter((_, j) => j !== i) })}
              disabled={thresholds.length <= 1}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm({ ...form, pointThresholds: [...thresholds, { points: 0, draws: 1 }] })}
        >
          + 新增門檻
        </button>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>動畫設定</legend>
        <label>
          轉盤旋轉時間 (ms):{' '}
          <input
            type="number"
            min={500}
            max={20000}
            value={form.spinDurationMs ?? 4300}
            onChange={(e) => setForm({ ...form, spinDurationMs: Number(e.target.value) })}
          />
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>成本控制門檻</legend>
        <label>
          min_draws_before_win{' '}
          <input
            type="number"
            value={form.minDrawsBeforeWin ?? 0}
            onChange={(e) => setForm({ ...form, minDrawsBeforeWin: Number(e.target.value) })}
          />
        </label>
        <br />
        <label>
          cooldown_draws_after_win{' '}
          <input
            type="number"
            value={form.cooldownDrawsAfterWin ?? 0}
            onChange={(e) => setForm({ ...form, cooldownDrawsAfterWin: Number(e.target.value) })}
          />
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={form.payoutCapEnabled ?? false}
            onChange={(e) => setForm({ ...form, payoutCapEnabled: e.target.checked })}
          />{' '}
          啟用 payout cap
        </label>
        <br />
        <label>
          payout_cap_ratio{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={form.payoutCapRatio ?? 0.45}
            onChange={(e) => setForm({ ...form, payoutCapRatio: Number(e.target.value) })}
          />{' '}
          {(form.payoutCapRatio ?? 0.45).toFixed(2)}
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>系統累計（唯讀）</legend>
        <p>累計抽獎次數：{data.totals.drawCount}</p>
        <p>累計派彩金額：{data.totals.payoutAmount}</p>
        <p>累計消耗積分：{data.totals.pointsBurned}</p>
        <p>安慰獎 Prize ID：{data.consolationPrizeId || '（未設定）'}</p>
      </fieldset>

      {error && <p style={{ color: '#c00' }}>{error}</p>}
      {savedAt && <p style={{ color: '#0a0' }}>已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
        {mut.isPending ? '儲存中…' : '儲存'}
      </button>
    </section>
  );
}
