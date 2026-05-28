'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { studentPortal } from '@/lib/navigation';
import { mockNotifications } from '@/lib/mock/student-dashboard';

export function StudentShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={studentPortal} notifications={mockNotifications} profileHref="/student/profile">
      {children}
    </AppShell>
  );
}
