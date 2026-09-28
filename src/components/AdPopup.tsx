import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// Shared verbatim between luckywheels and luckywheels-juxin — keep in sync.
// Shown once per page load; stays invisible until the image has loaded so a slow or
// broken creative never leaves an empty frame over the wheel. Without a link, tapping
// the creative (e.g. its own "立即抽獎" art) just dismisses it.
export function AdPopup({ src, href, onClose }: { src: string; href: string; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [loaded, onClose]);

  const image = <img src={src} alt="活動廣告" onLoad={() => setLoaded(true)} onError={onClose} />;

  return (
    <div className={`ad-popup${loaded ? ' is-visible' : ''}`} role="dialog" aria-modal="true" aria-label="活動廣告">
      <div className="ad-popup-frame">
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer">
            {image}
          </a>
        ) : (
          <button type="button" className="ad-popup-hit" onClick={onClose} aria-label="關閉廣告並開始抽獎">
            {image}
          </button>
        )}
        <button type="button" className="ad-popup-close" onClick={onClose} aria-label="關閉廣告">
          <X aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
