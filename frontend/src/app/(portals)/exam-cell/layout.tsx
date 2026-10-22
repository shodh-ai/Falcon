'use client';

import type { ReactNode } from 'react';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { RoleGate } from '@/components/layout/RoleGate';
import { ExamCellDevBanner } from '@/components/exam-cell/ExamCellDevBanner';
import { ExamCellDevProvider } from '@/lib/exam-cell/dev-context';
import { ExamCellWorkspace } from '@/components/exam-cell/ExamCellWorkspace';

export default function ExamCellLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGate>
      <ExamCellDevProvider>
        <GenericPortalShell portal="exam-cell">
          <ExamCellDevBanner />
          <ExamCellWorkspace>{children}</ExamCellWorkspace>
        </GenericPortalShell>
      </ExamCellDevProvider>
    </RoleGate>
  );
}
