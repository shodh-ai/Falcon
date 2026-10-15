'use client';

import { Suspense, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { FacultyShell } from '@/components/layout/FacultyShell';
import { PortalOnboardingGuard } from '@/components/onboarding/PortalOnboardingGuard';
import { StaffProfileFreezeGate } from '@/components/onboarding/StaffProfileFreezeGate';
import { FACULTY_ONBOARDING_CONFIG } from '@/lib/onboarding/portal-onboarding';
import { useAuth } from '@/context/AuthContext';

function FacultyPortalLayoutInner({ children }: { children: ReactNode }) {
  const { user } = useAuth();
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
        <StaffProfileFreezeGate>
          <FacultyShell>
            {user?.read_only_academic_view && (
              <div role="status" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                Read-only academic testing. Teaching data changes are blocked by the server.
                HR, banking and private documents are not available in this account.
              </div>
            )}
            {children}
          </FacultyShell>
        </StaffProfileFreezeGate>
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
