import { useCallback, useState } from 'react';

export function useCursorPagination() {
  const [cursor, setCursor] = useState<string | undefined>();
  const [previousCursors, setPreviousCursors] = useState<Array<string | undefined>>([]);

  const reset = useCallback(() => {
    setCursor(undefined);
    setPreviousCursors([]);
  }, []);

  const next = useCallback((nextCursor: string | null) => {
    if (!nextCursor) return;
    setPreviousCursors((current) => [...current, cursor]);
    setCursor(nextCursor);
  }, [cursor]);

  const previous = useCallback(() => {
    if (previousCursors.length === 0) return;
    setCursor(previousCursors[previousCursors.length - 1]);
    setPreviousCursors(previousCursors.slice(0, -1));
  }, [previousCursors]);

  return {
    cursor,
    page: previousCursors.length + 1,
    canPrevious: previousCursors.length > 0,
    reset,
    next,
    previous,
  };
}
