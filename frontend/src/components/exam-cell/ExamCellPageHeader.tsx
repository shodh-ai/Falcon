'use client';

import type { ReactNode } from 'react';
import type { ExamCellPageId } from '@/lib/exam-cell-guide';
import { EXAM_CELL_PAGES } from '@/lib/exam-cell-guide';

interface ExamCellPageHeaderProps {
  pageId: ExamCellPageId;
  actions?: ReactNode;
}

export function ExamCellPageHeader({ pageId, actions }: ExamCellPageHeaderProps) {
  const page = EXAM_CELL_PAGES[pageId];

  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">{page.title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{page.subtitle}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
