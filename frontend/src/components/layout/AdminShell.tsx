'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { adminPortal, filterPortalConfigForRole } from '@/lib/navigation';
import { useAuth } from '@/context/AuthContext';

const mockAdminNotifications = [
  { id: '1', title: '12 leave requests pending', body: 'HOD approvals needed', type: 'warning' as const, unread: true },
  { id: '2', title: '₹12.4L fees collected today', body: 'Finance summary', type: 'success' as const, unread: false },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const config = filterPortalConfigForRole(adminPortal, user?.role);

  return (
    <AppShell config={config} notifications={mockAdminNotifications}>
      {children}
    </AppShell>
  );
}
