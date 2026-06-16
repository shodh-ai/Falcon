'use client';

'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGate } from '@/components/layout/RoleGate';
import { StudentShell } from '@/components/layout/StudentShell';
import { StudentOnboardingGuard } from '@/components/student/StudentOnboardingGuard';

export default function StudentPortalLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isOnboarding = pathname.startsWith('/student/onboarding');

  if (isOnboarding) {
    return (
      <RoleGate>
        <StudentOnboardingGuard>{children}</StudentOnboardingGuard>
      </RoleGate>
    );
  }

  return (
    <RoleGate>
      <StudentOnboardingGuard>
        <StudentShell>{children}</StudentShell>
      </StudentOnboardingGuard>
    </RoleGate>
  );
}
