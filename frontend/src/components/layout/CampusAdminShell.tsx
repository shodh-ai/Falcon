'use client';

import { useMemo, type ReactNode } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { StaffLeaveStatusBanner } from '@/components/self-service/StaffLeaveStatusBanner';
import { AdmissionsLeaveNotificationListener } from '@/components/self-service/AdmissionsLeaveNotificationListener';
import { useAuth } from '@/context/AuthContext';
import { buildCampusAdminPortalConfig } from '@/lib/campus-admin.navigation';
import { campusAdminRoutes } from '@/lib/campus-admin.roles';
import { normalizeRoleName } from '@/lib/campus-admin.roles';

export function CampusAdminShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const roles = useMemo(
    () =>
      (user?.roles?.length ? user.roles : [user?.primaryRole ?? user?.role ?? ''])
        .filter(Boolean)
        .map((role) => normalizeRoleName(String(role))),
    [user?.primaryRole, user?.role, user?.roles],
  );

  const config = useMemo(() => buildCampusAdminPortalConfig(roles), [roles]);

  const showLeaveBanner =
    roles.includes('admissionsofficer') || roles.includes('campusadmin');

  return (
    <AppShell config={config}>
      <AdmissionsLeaveNotificationListener />
      {showLeaveBanner ? (
        <StaffLeaveStatusBanner statusPath={campusAdminRoutes.myLeave} />
      ) : null}
      {children}
    </AppShell>
  );
}
