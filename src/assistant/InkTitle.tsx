import type { ElementType } from 'react';

// 金色墨水字標題：文字與預設相同時顯示字圖（public/assets/assistant/ink/title-*.webp），
// 其他文字（例如後台改過的標題）則照常以文字呈現。比對時忽略空白與英文大小寫。

const INK_TITLES: Record<string, string> = {
  '精選空台 TOP 5': 'top',
  '戰神賽特 II': 'game',
  '曜金規則': 'rules',
  '未開轉數': 'unopened',
  'RTP 返還率': 'rtp',
  '今日下注量': 'bet',
  '助手怎麼排序': 'score',
  '使用提醒': 'note',
  '機台數據 一眼看清': 'hero',
  '本金推薦': 'recommend',
  '符合條件的機台': 'results',
  '積分兌換': 'exchange',
  '選擇方案': 'plans',
  '兌換紀錄': 'history',
};

const norm = (s: string) => s.replace(/\s+/g, '').toUpperCase();
const LOOKUP = new Map(Object.entries(INK_TITLES).map(([text, key]) => [norm(text), key]));

export const inkTitleSrc = (text: string): string | null => {
  const key = LOOKUP.get(norm(text));
  return key ? `/assets/assistant/ink/title-${key}.webp` : null;
};

export function InkTitle({
  text,
  as: Tag = 'h2',
  className,
  id,
  height,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  /** 字圖顯示高度（px） */
  height: number;
}) {
  const src = inkTitleSrc(text);
  if (!src) {
    return (
      <Tag id={id} className={className}>
        {text}
      </Tag>
    );
  }
  return (
    <Tag id={id} className={`${className ?? ''} aa-ink-title`}>
      <img src={src} alt={text} style={{ height }} draggable={false} />
    </Tag>
  );
}

/** 金色墨水筆觸圖示（按鈕與底部導航） */
export type InkIconName = 'rules' | 'recommend' | 'exchange' | 'history' | 'home' | 'wheel';

export function InkIcon({ name }: { name: InkIconName }) {
  return <img className="aa-ink-icon" src={`/assets/assistant/ink/icon-${name}.webp`} alt="" draggable={false} />;
}
