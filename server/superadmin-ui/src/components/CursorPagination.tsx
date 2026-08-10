interface CursorPaginationProps {
  page: number;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}

export function CursorPagination({
  page,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
}: CursorPaginationProps) {
  return (
    <nav className="sa-pagination" aria-label="分頁">
      <button type="button" className="sa-btn sa-btn--ghost sa-btn--sm" disabled={!canPrevious} onClick={onPrevious}>上一頁</button>
      <span>第 {page} 頁</span>
      <button type="button" className="sa-btn sa-btn--ghost sa-btn--sm" disabled={!canNext} onClick={onNext}>下一頁</button>
    </nav>
  );
}
