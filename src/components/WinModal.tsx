import type { DrawResponse } from '../api/draw.js';
import { Check, Copy, Gift, Trophy } from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';

const formatAmount = (amount: number) => amount.toLocaleString('zh-TW');

function WinAmount({ amount, reducedMotion }: { amount: number; reducedMotion: boolean }) {
  const [display, setDisplay] = useState(0);
  const value = useRef(0);
  useEffect(() => {
    if (reducedMotion) {
      value.current = amount;
      setDisplay(amount);
      return;
    }
    const from = value.current;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const progress = Math.min((now - start) / 620, 1);
      value.current = Math.round(from + (amount - from) * (1 - (1 - progress) ** 3));
      setDisplay(value.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [amount, reducedMotion]);
  return <span aria-hidden="true">{formatAmount(display)}</span>;
}

export function WinModal({ result, onClose, onRevealWin }: {
  result: DrawResponse;
  onClose: () => void;
  onRevealWin?: () => void;
}) {
  const total = result.draws.reduce((sum, draw) => sum + draw.winningCashAmount, 0);
  const hasWin = total > 0;
  const isMulti = result.tier === 'multi';
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [revealed, setRevealed] = useState(0);
  const [copyStatus, setCopyStatus] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onClose, onRevealWin });
  callbacks.current = { onClose, onRevealWin };
  const code = `LW-${result.redemption.code}`;
  const complete = revealed >= result.draws.length;
  const visibleTotal = result.draws.slice(0, revealed).reduce((sum, draw) => sum + draw.winningCashAmount, 0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    setRevealed(0);
    let count = 0;
    let timer: number;
    const reveal = () => {
      count = reducedMotion || !hasWin ? result.draws.length : count + 1;
      setRevealed(count);
      if (reducedMotion ? hasWin : result.draws[count - 1]?.winningCashAmount > 0) callbacks.current.onRevealWin?.();
      if (count < result.draws.length) timer = window.setTimeout(reveal, 480);
    };
    timer = window.setTimeout(reveal, reducedMotion || !hasWin ? 0 : 380);
    return () => window.clearTimeout(timer);
  }, [result, reducedMotion, hasWin]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') callbacks.current.onClose();
      if (event.key !== 'Tab') return;
      const buttons = panel.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', keydown);
      previous?.focus();
    };
  }, []);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopyStatus('兌換碼已複製');
    } catch {
      setCopyStatus('無法複製，請長按兌換碼或截圖保存。');
    }
  }

  return (
    <div className={`win-modal-backdrop ${hasWin ? 'has-win' : ''}`} onClick={onClose}>
      {hasWin && <div className="win-atmosphere" aria-hidden="true">
        <div className="win-halo" />
        {Array.from({ length: 22 }, (_, i) => <i key={i} className="win-mote" style={{
          '--x': `${(i * 43 + 7) % 100}%`, '--drift': `${(i % 2 ? 1 : -1) * (24 + i * 3)}px`,
          '--delay': `${(i % 7) * 0.12}s`, '--duration': `${2.4 + (i % 5) * 0.3}s`,
          '--turn': `${i * 47}deg`,
        } as CSSProperties} />)}
      </div>}
      <div ref={panel} className={`win-modal ${complete ? 'is-complete' : ''}`} onClick={(event) => event.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="win-modal-title" tabIndex={-1}>
        <div className="win-modal-content-panel">
          <div className={`win-emblem ${hasWin ? 'is-gold' : ''}`} aria-hidden="true">
            {hasWin ? <Trophy size={34} strokeWidth={1.4} /> : <Gift size={34} strokeWidth={1.4} />}
          </div>
          <h2 id="win-modal-title">{hasWin ? '恭喜中獎' : '感謝參與'}</h2>
          {hasWin && <div className="win-total-block">
            <p className="win-total-label">{isMulti ? `${result.tierDraws} 連抽・${complete ? '獎金合計' : '獎金累計'}` : '獲得獎金'}</p>
            <div className="win-total" aria-label={`獎金 ${formatAmount(visibleTotal)} 元`}>
              <span className="win-currency">$</span><WinAmount amount={visibleTotal} reducedMotion={reducedMotion} />
            </div>
          </div>}
          {!hasWin ? <div className="win-single"><strong>好運，留待下一次</strong><span>這次沒有獲得獎金，謝謝參加。</span></div>
            : !isMulti ? <div className={`win-single ${revealed > 0 ? 'is-revealed' : ''}`}>
              <strong>{result.draws[0]?.prize.rankLabel}</strong><span>{result.draws[0]?.prize.name}</span>
            </div> : <>
              <div className="win-reveal-progress"><span>{complete ? '全部獎項已揭曉' : '好運揭曉中'}</span><span>{revealed} / {result.draws.length}</span></div>
              <div className="win-multi-grid">{result.draws.map((draw, index) => {
                const shown = index < revealed;
                return <div key={draw.subIndex} className={`win-multi-cell ${draw.winningCashAmount > 0 ? 'is-winning' : 'is-not-winning'} ${shown ? 'is-revealed' : ''}`}>
                  {shown ? <><span className="win-multi-icon" aria-hidden="true">{draw.winningCashAmount > 0 ? <Trophy size={22} strokeWidth={1.5} /> : <Gift size={22} strokeWidth={1.5} />}</span>
                    <span className="win-multi-rank">{draw.prize.rankLabel}</span><span className="win-multi-name">{draw.prize.name}</span></>
                    : <span className="win-card-pending" aria-label={`第 ${index + 1} 抽待揭曉`}>{String(index + 1).padStart(2, '0')}</span>}
                </div>;
              })}</div>
            </>}
          <p className="sr-only" role="status">{complete ? (hasWin ? `揭曉完成，共獲得 ${formatAmount(total)} 元獎金。` : '本次未中獎。') : '正在揭曉抽獎結果。'}</p>
          {hasWin && <div className="win-redemption">
            <span className="win-total-label">兌換碼</span>
            <div className="redemption-actions"><p className="redemption-code">{code}</p>
              <button type="button" className="copy-code-button" onClick={copyCode} aria-label="複製兌換碼">{copyStatus === '兌換碼已複製' ? <Check size={18} /> : <Copy size={18} />}</button></div>
            <p className="hint" role="status">{copyStatus || '請將兌換碼截圖傳送給客服以進行領取。'}</p>
          </div>}
          <button className="win-close-button" type="button" onClick={onClose}>返回轉盤</button>
        </div>
      </div>
    </div>
  );
}
