import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type SettingsUpdate } from '../api/settings.js';

function Hint({ children }: { children: ReactNode }) {
  return <small style={{ display: 'block', marginTop: 4, color: '#6b7280', lineHeight: 1.5 }}>{children}</small>;
}

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
        rulesText: data.rulesText,
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
        <p style={{ marginTop: 0, color: '#6b7280' }}>
          設定會員消耗多少積分可抽幾次。前台會依會員目前積分，自動顯示可用的單抽或連抽方案。
        </p>
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
          轉盤旋轉時間（spinDurationMs，毫秒 ms）{' '}
          <input
            type="number"
            min={500}
            max={20000}
            value={form.spinDurationMs ?? 4300}
            onChange={(e) => setForm({ ...form, spinDurationMs: Number(e.target.value) })}
          />
          <Hint>控制前台轉盤動畫與轉動音效的持續時間。1000 ms = 1 秒；建議維持 3000 到 6000 ms，過短會像跳格，過長會等待太久。</Hint>
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>前台活動規則內容</legend>
        <p style={{ marginTop: 0, color: '#6b7280' }}>
          這段文字會顯示在會員前台「活動規則 / 使用須知」頁面。每一行會在前台顯示成一段規則。
        </p>
        <label>
          使用須知文字（rulesText）
          <textarea
            rows={6}
            value={form.rulesText ?? ''}
            onChange={(e) => setForm({ ...form, rulesText: e.target.value })}
            style={{ width: '100%', display: 'block', marginTop: 6 }}
          />
          <Hint>請用換行分隔不同規則。最多 2000 個字；儲存後前台重新載入即可看到新內容。</Hint>
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>成本控制門檻</legend>
        <p style={{ marginTop: 0, color: '#6b7280' }}>
          這些設定會影響後端是否允許會員中獎；被門檻擋下時，系統會改派安慰獎或未中獎結果。
        </p>
        <label>
          最少抽獎次數後才可中獎（minDrawsBeforeWin）{' '}
          <input
            type="number"
            value={form.minDrawsBeforeWin ?? 0}
            onChange={(e) => setForm({ ...form, minDrawsBeforeWin: Number(e.target.value) })}
          />
          <Hint>會員累計抽獎次數未達此數值前，不會中現金獎。填 0 代表不限制。</Hint>
        </label>
        <br />
        <label>
          中獎後冷卻抽數（cooldownDrawsAfterWin）{' '}
          <input
            type="number"
            value={form.cooldownDrawsAfterWin ?? 0}
            onChange={(e) => setForm({ ...form, cooldownDrawsAfterWin: Number(e.target.value) })}
          />
          <Hint>會員中獎後，需再抽滿這個次數才可能再次中獎。填 0 代表中獎後不冷卻。</Hint>
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={form.payoutCapEnabled ?? false}
            onChange={(e) => setForm({ ...form, payoutCapEnabled: e.target.checked })}
          />{' '}
          啟用派彩比例上限（payoutCapEnabled）
          <Hint>開啟後，系統會依累計派彩金額與累計消耗積分的比例控管成本。超過上限時，後端會避免繼續派發現金獎。</Hint>
        </label>
        <br />
        <label>
          派彩比例上限（payoutCapRatio）{' '}
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={form.payoutCapRatio ?? 0.45}
            onChange={(e) => setForm({ ...form, payoutCapRatio: Number(e.target.value) })}
          />{' '}
          {((form.payoutCapRatio ?? 0.45) * 100).toFixed(0)}%
          <Hint>計算方式：累計派彩金額 ÷ 累計消耗積分。例：45% 代表派彩總額接近或超過消耗積分的 45% 時，系統會啟動保護。</Hint>
        </label>
      </fieldset>

      <fieldset style={{ marginBottom: 16 }}>
        <legend>系統累計（唯讀）</legend>
        <p style={{ marginTop: 0, color: '#6b7280' }}>以下資料由系統自動累計，供成本控管判斷與營運檢查使用，不能在此手動修改。</p>
        <p>累計抽獎次數：{data.totals.drawCount}</p>
        <p>累計派彩金額：{data.totals.payoutAmount}</p>
        <p>累計消耗積分：{data.totals.pointsBurned}</p>
        <p>安慰獎獎品 ID（consolationPrizeId）：{data.consolationPrizeId || '（未設定）'}</p>
      </fieldset>

      {error && <p style={{ color: '#c00' }}>{error}</p>}
      {savedAt && <p style={{ color: '#0a0' }}>已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <button onClick={() => mut.mutate(form)} disabled={mut.isPending}>
        {mut.isPending ? '儲存中…' : '儲存'}
      </button>
    </section>
  );
}
