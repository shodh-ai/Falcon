'use client';

import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { facultyPortal, filterFacultyPortalForManagerAccess } from '@/lib/navigation';
import { FACULTY_CONTENT_MAX_CLASS } from '@/components/faculty/FacultyPageShell';
import { useAuth } from '@/context/AuthContext';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';

export function FacultyShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const config = useMemo(
    () => filterFacultyPortalForManagerAccess(facultyPortal, canSeeFacultyTeamApprovals(user)),
    [user],
  );

  return (
    <AppShell config={config} contentMaxWidthClass={FACULTY_CONTENT_MAX_CLASS}>
      {children}
    </AppShell>
  );
}
