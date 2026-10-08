'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onExamCellDevFallback } from '@/lib/exam-cell/dev-fallback';
import type { ExamCellDevFallbackMeta } from '@/lib/exam-cell/seed-data';

type ExamCellDevContextValue = {
  usingFallback: boolean;
  lastFallback: ExamCellDevFallbackMeta | null;
  fallbackCount: number;
  dismissBanner: () => void;
  clearFallbackState: () => void;
};

const ExamCellDevContext = createContext<ExamCellDevContextValue | null>(null);

export function ExamCellDevProvider({ children }: { children: ReactNode }) {
  const [lastFallback, setLastFallback] = useState<ExamCellDevFallbackMeta | null>(null);
  const [fallbackCount, setFallbackCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    return onExamCellDevFallback((meta) => {
      setLastFallback(meta);
      setFallbackCount((c) => c + 1);
      setDismissed(false);
    });
  }, []);

  const dismissBanner = useCallback(() => setDismissed(true), []);
  const clearFallbackState = useCallback(() => {
    setLastFallback(null);
    setFallbackCount(0);
    setDismissed(false);
  }, []);

  const value = useMemo(
    () => ({
      usingFallback: fallbackCount > 0 && !dismissed,
      lastFallback,
      fallbackCount,
      dismissBanner,
      clearFallbackState,
    }),
    [fallbackCount, dismissed, lastFallback, dismissBanner, clearFallbackState],
  );

  return <ExamCellDevContext.Provider value={value}>{children}</ExamCellDevContext.Provider>;
}

export function useExamCellDev() {
  return useContext(ExamCellDevContext);
}
