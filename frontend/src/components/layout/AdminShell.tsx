'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { adminPortal } from '@/lib/navigation';

const mockAdminNotifications = [
  { id: '1', title: '12 leave requests pending', body: 'HOD approvals needed', type: 'warning' as const, unread: true },
  { id: '2', title: '₹12.4L fees collected today', body: 'Finance summary', type: 'success' as const, unread: false },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={adminPortal} notifications={mockAdminNotifications}>
      {children}
    </AppShell>
  );
}
