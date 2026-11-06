import type { ReactNode } from 'react';
import type { AssistantMe } from '../api/assistant.js';

// 「用積分開通」入口：後台關閉兌換時反灰不可點，並顯示後台設定的提示文字。
// 尚未載入 me 時也視為關閉（寧可晚一點開放，不讓會員點進去才發現不能兌換）。

const FALLBACK_CLOSED_MESSAGE = '系統正在測試中';

export const exchangeOpen = (me: AssistantMe | null | undefined): boolean => me?.exchange?.enabled === true;

export const exchangeClosedMessage = (me: AssistantMe | null | undefined): string =>
  me?.exchange?.closedMessage ?? FALLBACK_CLOSED_MESSAGE;

export function OpenPassButton({
  me,
  className,
  onClick,
  children = '用積分開通',
}: {
  me: AssistantMe | null | undefined;
  className: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  if (exchangeOpen(me)) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {children}
      </button>
    );
  }
  return (
    <div className="aa-open-closed">
      <button type="button" className={className} disabled>
        {children}
      </button>
      <p className="aa-open-hint" role="status">{exchangeClosedMessage(me)}</p>
    </div>
  );
}
