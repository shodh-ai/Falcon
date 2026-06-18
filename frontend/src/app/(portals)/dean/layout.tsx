'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { DEAN_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function DeanPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/dean/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <PortalOnboardingGuard config={DEAN_ONBOARDING_CONFIG}>{children}</PortalOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <PortalOnboardingGuard config={DEAN_ONBOARDING_CONFIG}>
        <GenericPortalShell portal="dean">{children}</GenericPortalShell>
      </PortalOnboardingGuard>
    </RoleGate>
  );
}
