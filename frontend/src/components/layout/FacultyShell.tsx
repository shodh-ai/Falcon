'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { facultyPortal } from '@/lib/navigation';
import { FACULTY_CONTENT_MAX_CLASS } from '@/components/faculty/FacultyPageShell';

export function FacultyShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={facultyPortal} contentMaxWidthClass={FACULTY_CONTENT_MAX_CLASS}>
      {children}
    </AppShell>
  );
}
