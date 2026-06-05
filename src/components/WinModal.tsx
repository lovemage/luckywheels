import type { DrawResponse } from '../api/draw.js';

export function WinModal({ result, onClose }: { result: DrawResponse; onClose: () => void }) {
  return (
    <div
      className="win-modal-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="win-modal-title"
    >
      <div className="win-modal" onClick={(e) => e.stopPropagation()}>
        <h2 id="win-modal-title">{result.tier === 'multi' ? `${result.tierDraws} 連抽結果` : '中獎了！'}</h2>
        <p className="redemption-code">兌換碼：LW-{result.redemption.code}</p>
        <p className="redemption-total">總中獎金額：{result.redemption.totalWinAmount}</p>
        {result.tier === 'single' ? (
          <div className="win-single">
            <strong>{result.draws[0]!.prize.rankLabel}</strong>
            <span>{result.draws[0]!.prize.name}</span>
            <span>{result.draws[0]!.winningCashAmount}</span>
          </div>
        ) : (
          <ol className="win-multi-list">
            {result.draws.map((d) => (
              <li key={d.subIndex}>
                <span>#{d.subIndex + 1}</span>
                <span>{d.prize.rankLabel}</span>
                <span>{d.winningCashAmount}</span>
              </li>
            ))}
          </ol>
        )}
        <p className="hint">請將兌換碼截圖傳送給客服以進行領取。</p>
        <button onClick={onClose}>關閉</button>
      </div>
    </div>
  );
}
