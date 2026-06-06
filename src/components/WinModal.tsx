import type { DrawResponse } from '../api/draw.js';
import { Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export function WinModal({ result, onClose }: { result: DrawResponse; onClose: () => void }) {
  const winningDraws = result.draws.filter((draw) => draw.winningCashAmount > 0);
  const totalWinAmount = winningDraws.reduce((sum, draw) => sum + draw.winningCashAmount, 0);
  const hasWin = totalWinAmount > 0;
  const redemptionCode = `LW-${result.redemption.code}`;
  const [revealedDraws, setRevealedDraws] = useState(0);

  useEffect(() => {
    if (!hasWin || result.tier !== 'multi') {
      setRevealedDraws(result.tier === 'multi' ? result.draws.length : 0);
      return;
    }

    setRevealedDraws(1);
    if (result.draws.length <= 1) return;

    const intervalMs = 600;
    const timer = window.setInterval(() => {
      setRevealedDraws((current) => {
        const next = current + 1;
        if (next >= result.draws.length) {
          window.clearInterval(timer);
          return result.draws.length;
        }
        return next;
      });
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [hasWin, result.draws.length, result.tier, result.redemption.code]);

  async function copyCode() {
    if (!hasWin) return;
    try {
      await navigator.clipboard.writeText(`LW-${result.redemption.code}`);
    } catch {
      /* ignore */
    }
  }

  return (
    <div
      className="win-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-modal-title"
    >
      <div className="win-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-modal-title">
          {hasWin ? (result.tier === 'multi' ? `${result.tierDraws} 連抽結果` : '中獎了！') : '感謝參與'}
        </h2>
        {hasWin ? (
          <div className="redemption-actions">
            <p className="redemption-code">{redemptionCode}</p>
            <button type="button" className="copy-code-button" onClick={copyCode} aria-label="複製兌換碼">
              <Copy size={20} />
            </button>
          </div>
        ) : null}
        {!hasWin ? (
          <div className="win-single">
            <strong>謝謝參加</strong>
            <span>這次沒有獲得獎金，歡迎再試一次。</span>
          </div>
        ) : result.tier === 'single' ? (
          <div className="win-single">
            <strong>{winningDraws[0]!.prize.rankLabel}</strong>
            <span>{winningDraws[0]!.prize.name}</span>
          </div>
        ) : (
          <div className="win-multi-grid">
            {result.draws.map((draw) => (
              <div
                key={draw.subIndex}
                className={`win-multi-cell ${draw.winningCashAmount > 0 ? 'is-winning' : 'is-not-winning'} ${
                  result.tier === 'multi' && draw.subIndex < revealedDraws ? 'is-revealed' : ''
                }`}
              >
                <span className="win-multi-icon">💰</span>
                <span className="win-multi-rank">{draw.prize.rankLabel}</span>
                <span className="win-multi-name">{draw.prize.name}</span>
              </div>
            ))}
          </div>
        )}
        {hasWin ? <p className="hint">請將兌換碼截圖傳送給客服以進行領取。</p> : null}
        <button type="button" onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
