'use client';

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { facultyPortal } from '@/lib/navigation';

const mockFacultyNotifications = [
  { id: '1', title: 'Class at 10:15 AM', body: 'OS — Room 112 · Mark attendance', type: 'info' as const, unread: true },
  { id: '2', title: 'Leave approved', body: 'HR processed your CL for 2 days', type: 'success' as const, unread: false },
];

export function FacultyShell({ children }: { children: ReactNode }) {
  return (
    <AppShell config={facultyPortal} notifications={mockFacultyNotifications} profileHref="/faculty/dashboard">
      {children}
    </AppShell>
  );
}
