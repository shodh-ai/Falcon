'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { StudentShell } from '@/components/layout/StudentShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';
import { useAuth } from '@/context/AuthContext';
import { getStudentLandingPath } from '@/lib/student-access';

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user } = useAuth();
  const config = {
    ...STUDENT_ONBOARDING_CONFIG,
    dashboardPath: getStudentLandingPath(user?.roles?.length ? user.roles : user?.primaryRole ?? user?.role),
  };
  const isOnboarding = pathname.startsWith('/student/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <PortalOnboardingGuard config={config}>{children}</PortalOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <PortalOnboardingGuard config={config}>
        <StudentShell>{children}</StudentShell>
      </PortalOnboardingGuard>
    </RoleGate>
  );
}
