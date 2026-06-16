'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  getStudentOnboardingPath,
  isStudentOnboardingComplete,
  isStudentRole,
} from '@/lib/auth-routing';
import { FalconLoader } from '@/components/brand/FalconLoader';

const ONBOARDING_PREFIX = '/student/onboarding';

export function StudentOnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user || redirectingRef.current) return;
    if (!isStudentRole(user.primaryRole ?? user.role)) return;

    const status = user.onboarding_status ?? 'ACTIVE';
    const onOnboardingRoute = pathname.startsWith(ONBOARDING_PREFIX);
    const requiredPath = getStudentOnboardingPath(status);

    if (requiredPath && pathname !== requiredPath && !onOnboardingRoute) {
      redirectingRef.current = true;
      router.replace(requiredPath);
      return;
    }

    if (requiredPath && onOnboardingRoute && pathname !== requiredPath) {
      redirectingRef.current = true;
      router.replace(requiredPath);
      return;
    }

    if (isStudentOnboardingComplete(status) && onOnboardingRoute) {
      redirectingRef.current = true;
      router.replace('/student/dashboard');
    }
  }, [isLoading, pathname, router, user]);

  if (isLoading) {
    return <FalconLoader label="Loading onboarding…" className="min-h-screen" />;
  }

  return <>{children}</>;
}
