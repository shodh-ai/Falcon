'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { StudentShell } from '@/components/layout/StudentShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { STUDENT_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/student/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <PortalOnboardingGuard config={STUDENT_ONBOARDING_CONFIG}>{children}</PortalOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <PortalOnboardingGuard config={STUDENT_ONBOARDING_CONFIG}>
        <StudentShell>{children}</StudentShell>
      </PortalOnboardingGuard>
    </RoleGate>
  );
}
