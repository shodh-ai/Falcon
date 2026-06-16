'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { GenericPortalShell } from '@/components/layout/GenericPortalShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { HOD_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';

export default function HodPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/hod/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <PortalOnboardingGuard config={HOD_ONBOARDING_CONFIG}>{children}</PortalOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <PortalOnboardingGuard config={HOD_ONBOARDING_CONFIG}>
        <GenericPortalShell portal="hod">{children}</GenericPortalShell>
      </PortalOnboardingGuard>
    </RoleGate>
  );
}
