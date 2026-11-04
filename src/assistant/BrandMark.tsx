// 品牌徽記：四芒星（設計稿 comp-4 左上角）。純幾何，與品牌名稱分開，方便日後換名。
export function BrandMark() {
  return (
    <svg className="aa-mark" viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="aa-mark-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff0c2" />
          <stop offset="0.5" stopColor="#e7b552" />
          <stop offset="1" stopColor="#9c6a1c" />
        </linearGradient>
      </defs>
      <path d="M16 1 L19 13 L31 16 L19 19 L16 31 L13 19 L1 16 L13 13 Z" fill="url(#aa-mark-gold)" />
      <path d="M16 7 L17.4 14.6 L25 16 L17.4 17.4 L16 25 L14.6 17.4 L7 16 L14.6 14.6 Z" fill="#120c05" opacity="0.55" />
      <circle cx="16" cy="16" r="1.6" fill="#fff6d8" />
    </svg>
  );
}
