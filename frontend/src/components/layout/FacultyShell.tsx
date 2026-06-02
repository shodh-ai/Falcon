'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { facultyPortal } from '@/lib/navigation';

export function FacultyShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={facultyPortal} profileHref="/faculty/dashboard">
      {children}
    </AppShell>
  );
}
