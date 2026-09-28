import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../api/settings.js';
import { ImageUploadInput } from '../components/ImageUploadInput.js';

type DemoEntry = { memberId: string; rankLabel: string };

// One entry per line: "<遊戲編號> <獎項>" (space or comma separated).
function parseDemoText(text: string): { entries: DemoEntry[]; invalidLines: number[] } {
  const entries: DemoEntry[] = [];
  const invalidLines: number[] = [];
  text.split('\n').forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const [memberId, rankLabel, ...rest] = trimmed.split(/[\s,，]+/);
    if (!memberId || !rankLabel || rest.length > 0 || memberId.length > 40 || rankLabel.length > 20) {
      invalidLines.push(index + 1);
      return;
    }
    entries.push({ memberId, rankLabel });
  });
  return { entries, invalidLines };
}

function Hint({ children }: { children: ReactNode }) {
  return <small>{children}</small>;
}

export function HomeSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bgUrl, setBgUrl] = useState<string | null>(null);
  const [winTickerEnabled, setWinTickerEnabled] = useState(true);
  const [bottomNavCollapsible, setBottomNavCollapsible] = useState(true);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoText, setDemoText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setLogoUrl(data.homeLogoUrl || null);
      setBgUrl(data.homeBackgroundUrl || null);
      setWinTickerEnabled(data.winTickerEnabled);
      setBottomNavCollapsible(data.bottomNavCollapsible);
      setDemoEnabled(data.winTickerDemoEnabled);
      setDemoText(data.winTickerDemoEntries.map((e) => `${e.memberId} ${e.rankLabel}`).join('\n'));
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateSettings({
        homeLogoUrl: logoUrl ?? '',
        homeBackgroundUrl: bgUrl ?? '',
        winTickerEnabled,
        bottomNavCollapsible,
        winTickerDemoEnabled: demoEnabled,
        winTickerDemoEntries: demo.entries,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <p>載入中…</p>;

  const demo = parseDemoText(demoText);
  const demoInvalid = demo.invalidLines.length > 0 || demo.entries.length > 100;

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Home</p>
          <h1>首頁設定</h1>
          <p>更換會員前台（抽獎首頁）的 LOGO、背景圖與底部區塊顯示方式。LOGO／背景留空（移除）＝使用系統內建預設圖。</p>
        </div>
      </header>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>LOGO</legend>
        <ImageUploadInput value={logoUrl} onChange={setLogoUrl} />
        <Hint>
          顯示在首頁左上角。建議尺寸約 <strong>1344 × 896</strong>（3:2）、PNG 去背、5MB 以內。
        </Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>背景圖</legend>
        <ImageUploadInput value={bgUrl} onChange={setBgUrl} />
        <Hint>
          鋪滿整個手機畫面（以 cover 裁切置中）。建議<strong>直式</strong>、約 <strong>853 × 1844</strong>（手機比例）、5MB 以內。
        </Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>底部區塊</legend>
        <label className="admin-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={winTickerEnabled}
            onChange={(e) => setWinTickerEnabled(e.target.checked)}
          />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">中獎跑馬燈（winTickerEnabled）</span>
        </label>
        <Hint>開啟後，首頁底部會輪播最近 20 筆真實中獎紀錄（遊戲編號遮罩顯示，例：ab***45；不含測試帳號與已取消的兌換）。</Hint>
        <label className="admin-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={bottomNavCollapsible}
            onChange={(e) => setBottomNavCollapsible(e.target.checked)}
          />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">底部導航預設收合（bottomNavCollapsible）</span>
        </label>
        <Hint>開啟後，底部導航平常收合成一個半透明向上箭頭，點擊才展開；關閉則導航常駐顯示。</Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>跑馬燈展示名單</legend>
        <label className="admin-toggle">
          <input
            type="checkbox"
            role="switch"
            checked={demoEnabled}
            onChange={(e) => setDemoEnabled(e.target.checked)}
          />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">顯示展示名單（winTickerDemoEnabled）</span>
        </label>
        <Hint>
          暖場用：名單會接在真實中獎紀錄之後輪播。<strong>正式營運後請關閉</strong>，避免與真實中獎混淆。
        </Hint>
        <label>
          名單（每行一筆：遊戲編號 獎項，最多 100 筆）
          <textarea
            rows={12}
            value={demoText}
            onChange={(e) => setDemoText(e.target.value)}
            placeholder={'jx123456 三獎\nab998877 五獎'}
          />
        </label>
        <Hint>
          遊戲編號前台會自動遮罩（例：jx123456 → jx***56）；獎項需與「獎項管理」中的名稱完全相同，金額自動帶入該獎項金額，
          找不到或金額為 0 的獎項不會顯示。目前 {demo.entries.length} 筆
          {demo.invalidLines.length > 0 && `，第 ${demo.invalidLines.join('、')} 行格式錯誤`}
          {demo.entries.length > 100 && '，超過 100 筆上限'}。
        </Hint>
      </fieldset>

      {error && <p className="member-detail-error">{error}</p>}
      {savedAt && <p className="admin-success-text">已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <div className="member-detail-actions">
        <button onClick={() => mut.mutate()} disabled={mut.isPending || demoInvalid}>
          {mut.isPending ? '儲存中…' : '儲存'}
        </button>
      </div>
    </section>
  );
}
