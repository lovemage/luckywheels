import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings, type SupportFabPosition } from '../api/settings.js';
import { ImageUploadInput } from '../components/ImageUploadInput.js';
import { PageSkeleton } from '../components/Skeleton.js';

function Hint({ children }: { children: ReactNode }) {
  return <small>{children}</small>;
}

const LINK_PATTERN = /^https?:\/\/\S+$/i;
const DEFAULT_LINK = 'https://lin.ee/Tgi96WV';
const POSITIONS: { value: SupportFabPosition; label: string }[] = [
  { value: 'bottom-right', label: '右下' },
  { value: 'middle-right', label: '右中' },
  { value: 'bottom-left', label: '左下' },
  { value: 'middle-left', label: '左中' },
];

export function SupportSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [enabled, setEnabled] = useState(true);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState(DEFAULT_LINK);
  const [position, setPosition] = useState<SupportFabPosition>('bottom-right');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setEnabled(data.supportFabEnabled);
      setImageUrl(data.supportFabImageUrl || null);
      setLinkUrl(data.supportFabLinkUrl);
      setPosition(data.supportFabPosition);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateSettings({
        supportFabEnabled: enabled,
        supportFabImageUrl: imageUrl ?? '',
        supportFabLinkUrl: linkUrl.trim(),
        supportFabPosition: position,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <PageSkeleton />;

  const linkInvalid = !LINK_PATTERN.test(linkUrl.trim());

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Support</p>
          <h1>客服按鈕</h1>
          <p>介紹網站（/intro/）每一頁右下角的客服懸浮按鈕，點擊另開客服連結。</p>
        </div>
      </header>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>顯示</legend>
        <label className="admin-toggle">
          <input type="checkbox" role="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">顯示客服按鈕（supportFabEnabled）</span>
        </label>
        <Hint>關閉後，介紹網站不再顯示客服按鈕。</Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>位置</legend>
        <label>
          按鈕位置
          <select value={position} onChange={(e) => setPosition(e.target.value as SupportFabPosition)}>
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <Hint>「下」貼齊畫面底部（手機版會避開底部導覽列），「中」位於畫面垂直置中。</Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>按鈕圖片</legend>
        <ImageUploadInput value={imageUrl} onChange={setImageUrl} convertToWebp />
        <Hint>
          建議<strong>正方形 256 × 256</strong>、去背 PNG，按鈕會裁成圓形顯示。
          <strong>未上傳＝使用網站 logo</strong>（下方預覽）。
        </Hint>
        {!imageUrl && (
          <img
            src="/assets/logo.webp"
            alt="預設按鈕圖（網站 logo）"
            style={{ display: 'block', width: 96, height: 96, objectFit: 'contain', marginTop: 12, borderRadius: '50%', background: '#120c05' }}
          />
        )}
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>點擊連結</legend>
        <label>
          連結網址
          <input
            type="url"
            inputMode="url"
            placeholder={DEFAULT_LINK}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </label>
        <Hint>預設為官方 LINE（{DEFAULT_LINK}）。需以 http:// 或 https:// 開頭。</Hint>
      </fieldset>

      {linkInvalid && <p className="member-detail-error">連結網址需以 http:// 或 https:// 開頭。</p>}
      {error && <p className="member-detail-error">{error}</p>}
      {savedAt && <p className="admin-success-text">已儲存 ({new Date(savedAt).toLocaleTimeString()})</p>}
      <div className="member-detail-actions">
        <button onClick={() => mut.mutate()} disabled={mut.isPending || linkInvalid}>
          {mut.isPending ? '儲存中…' : '儲存'}
        </button>
      </div>
    </section>
  );
}
