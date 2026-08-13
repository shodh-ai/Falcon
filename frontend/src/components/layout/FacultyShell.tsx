'use client';

import type { ReactNode } from 'react';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { TeachingDepartmentSwitcher } from '@/components/layout/TeachingDepartmentSwitcher';
import {
  facultyPortal,
  filterFacultyPortalForManagerAccess,
  filterFacultyPortalForPlacementCoordinator,
} from '@/lib/navigation';
import { FACULTY_CONTENT_MAX_CLASS } from '@/components/faculty/FacultyPageShell';
import { TeachingDepartmentProvider } from '@/components/faculty/TeachingDepartmentContext';
import { FacultyAiAssistantFab } from '@/components/faculty/ai/FacultyAiAssistant';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';

function FacultyShellInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const api = useAuthedApi();
  const pathname = usePathname();
  const [isPlacementCoordinator, setIsPlacementCoordinator] = useState(false);

  useEffect(() => {
    void api
      .get<{ is_coordinator: boolean }>('/api/academics/faculty/placement/coordinator-status')
      .then((res) => setIsPlacementCoordinator(res.is_coordinator))
      .catch(() => setIsPlacementCoordinator(false));
  }, [api]);

  const config = useMemo(() => {
    let next = filterFacultyPortalForManagerAccess(facultyPortal, canSeeFacultyTeamApprovals(user));
    next = filterFacultyPortalForPlacementCoordinator(next, isPlacementCoordinator);
    return next;
  }, [user, isPlacementCoordinator]);

  const contentMaxWidthClass =
    pathname?.startsWith('/faculty/ai-assistant') || pathname?.startsWith('/faculty/dashboard')
      ? 'max-w-[1400px]'
      : FACULTY_CONTENT_MAX_CLASS;

  return (
    <AppShell
      config={config}
      contentMaxWidthClass={contentMaxWidthClass}
      headerExtra={<TeachingDepartmentSwitcher />}
    >
      {children}
      <FacultyAiAssistantFab />
    </AppShell>
  );
}

export function FacultyShell({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <TeachingDepartmentProvider>
        <FacultyShellInner>{children}</FacultyShellInner>
      </TeachingDepartmentProvider>
    </Suspense>
  );
}
