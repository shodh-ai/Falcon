'use client';

import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import {
  facultyPortal,
  filterFacultyPortalForManagerAccess,
  filterFacultyPortalForPlacementCoordinator,
} from '@/lib/navigation';
import { FACULTY_CONTENT_MAX_CLASS } from '@/components/faculty/FacultyPageShell';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { canSeeFacultyTeamApprovals } from '@/lib/faculty-manager-access';

export function FacultyShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const api = useAuthedApi();
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

  return (
    <AppShell config={config} contentMaxWidthClass={FACULTY_CONTENT_MAX_CLASS}>
      {children}
    </AppShell>
  );
}
