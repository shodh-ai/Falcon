'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { FacultyShell } from '@/components/layout/FacultyShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

function FacultyPortalLayoutInner({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/faculty/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <PortalOnboardingGuard config={FACULTY_ONBOARDING_CONFIG}>{children}</PortalOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <PortalOnboardingGuard config={FACULTY_ONBOARDING_CONFIG}>
        <FacultyShell>{children}</FacultyShell>
      </PortalOnboardingGuard>
    </RoleGate>
  );
}

export default function FacultyPortalLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <FacultyPortalLayoutInner>{children}</FacultyPortalLayoutInner>
    </Suspense>
  );
}
