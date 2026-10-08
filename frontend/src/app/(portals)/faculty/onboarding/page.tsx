'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { FalconLoader } from '@/components/brand/FalconLoader';
import {
  FACULTY_ONBOARDING_CONFIG,
  getOnboardingStepPath,
  isFirstLoginOnboardingComplete,
} from '@/lib/onboarding/portal-onboarding';

export default function FacultyOnboardingIndexPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading || !user) return;

    const role = user.primaryRole ?? user.role;
    const stepPath = getOnboardingStepPath(
      FACULTY_ONBOARDING_CONFIG.portalPrefix,
      user.onboarding_status,
      role,
    );

    if (stepPath) {
      router.replace(stepPath);
      return;
    }

    if (isFirstLoginOnboardingComplete(user.onboarding_status, role)) {
      router.replace(FACULTY_ONBOARDING_CONFIG.dashboardPath);
      return;
    }

    router.replace(`${FACULTY_ONBOARDING_CONFIG.portalPrefix}/onboarding/step-1`);
  }, [isLoading, router, user]);

  return <FalconLoader label="Loading onboarding…" className="min-h-screen" />;
}
