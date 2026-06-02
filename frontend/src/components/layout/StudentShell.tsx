'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { studentPortal } from '@/lib/navigation';
import { StudentFaqChat } from '@/components/student/StudentFaqChat';

export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={studentPortal} profileHref="/student/profile">
      {children}
      <StudentFaqChat />
    </AppShell>
  );
}
