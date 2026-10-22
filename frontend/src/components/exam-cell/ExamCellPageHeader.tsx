'use client';

import type { ReactNode } from 'react';
import type { ExamCellPageId } from '@/lib/exam-cell-guide';
import { EXAM_CELL_PAGES } from '@/lib/exam-cell-guide';

interface ExamCellPageHeaderProps {
  pageId: ExamCellPageId;
  actions?: ReactNode;
  title?: string;
  subtitle?: string;
}

export function ExamCellPageHeader({ pageId, actions, title, subtitle }: ExamCellPageHeaderProps) {
  const page = EXAM_CELL_PAGES[pageId];

  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 border-l-4 pl-4" style={{ borderLeftColor: 'var(--sgvu-gold)' }}>
        <h1 className="text-xl font-bold leading-tight tracking-tight text-sgvu-navy sm:text-2xl">{title ?? page.title}</h1>
        <p className="mt-1.5 max-w-3xl text-sm leading-6 text-muted-foreground">{subtitle ?? page.subtitle}</p>
      </div>
      {actions ? <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
    </div>
  );
}
