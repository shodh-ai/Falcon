'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { hrPortal } from '@/lib/navigation';

const mockHrNotifications = [
  { id: '1', title: 'Leave pending approval', body: 'Faculty One — CL request awaiting action', type: 'warning' as const, unread: true },
  { id: '2', title: 'Payroll draft ready', body: 'May 2026 payslips generated — review & publish', type: 'info' as const, unread: false },
];

export function HrShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={hrPortal} notifications={mockHrNotifications} profileHref="/hr/dashboard">
      {children}
    </AppShell>
  );
}
