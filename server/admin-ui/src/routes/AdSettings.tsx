import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchSettings, updateSettings } from '../api/settings.js';
import { ImageUploadInput } from '../components/ImageUploadInput.js';

function Hint({ children }: { children: ReactNode }) {
  return <small>{children}</small>;
}

const LINK_PATTERN = /^https?:\/\/\S+$/i;

export function AdSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['admin', 'settings'], queryFn: fetchSettings });
  const [enabled, setEnabled] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setEnabled(data.adPopupEnabled);
      setImageUrl(data.adPopupImageUrl || null);
      setLinkUrl(data.adPopupLinkUrl);
    }
  }, [data]);

  const mut = useMutation({
    mutationFn: () =>
      updateSettings({
        adPopupEnabled: enabled,
        adPopupImageUrl: imageUrl ?? '',
        adPopupLinkUrl: linkUrl.trim(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      setError(null);
      setSavedAt(Date.now());
    },
    onError: (e: Error) => setError(e.message),
  });

  if (isLoading || !data) return <p>載入中…</p>;

  const linkInvalid = linkUrl.trim() !== '' && !LINK_PATTERN.test(linkUrl.trim());

  return (
    <section className="member-detail-page">
      <header className="member-detail-hero">
        <div>
          <p className="admin-eyebrow">Ads</p>
          <h1>廣告設定</h1>
          <p>會員進入抽獎首頁時彈出的廣告畫面，右上角 X 關閉。</p>
        </div>
      </header>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>廣告彈窗</legend>
        <label className="admin-toggle">
          <input type="checkbox" role="switch" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <span className="admin-toggle-track" aria-hidden="true" />
          <span className="admin-toggle-label">顯示廣告彈窗（adPopupEnabled）</span>
        </label>
        <Hint>開啟後，會員每次進入首頁都會先看到廣告，關閉後才開始抽獎。</Hint>
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>廣告圖片</legend>
        <ImageUploadInput value={imageUrl} onChange={setImageUrl} convertToWebp />
        <Hint>
          上傳後自動轉成 WebP 並壓縮。建議<strong>直式 1080 × 1350</strong>（4:5）或 1080 × 1920（手機全螢幕），
          PNG／JPG／GIF（可動圖）、10MB 以內。<strong>未上傳＝使用系統預設廣告圖</strong>（下方預覽）。
        </Hint>
        {!imageUrl && (
          <img
            src="/assets/ad-default.webp"
            alt="系統預設廣告圖"
            style={{ display: 'block', width: 160, marginTop: 12, border: '1px solid #ddd' }}
          />
        )}
      </fieldset>

      <fieldset className="member-detail-card member-detail-card--wide admin-fieldset-card">
        <legend>點擊連結（選填）</legend>
        <label>
          連結網址
          <input
            type="url"
            inputMode="url"
            placeholder="https://"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </label>
        <Hint>填寫後，會員點擊廣告圖片會另開此網址；留空＝點擊圖片直接關閉廣告、開始抽獎。需以 http:// 或 https:// 開頭。</Hint>
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
