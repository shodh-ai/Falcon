'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  getOnboardingConfigForRole,
  getOnboardingStepPath,
  isFirstLoginOnboardingComplete,
  normalizeOnboardingStatus,
  type PortalOnboardingConfig,
} from '@/lib/onboarding/portal-onboarding';
import { FalconLoader } from '@/components/brand/FalconLoader';

export function PortalOnboardingGuard({
  config,
  children,
}: {
  config: PortalOnboardingConfig;
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const redirectingRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user || redirectingRef.current) return;

    const activeConfig = getOnboardingConfigForRole(user.primaryRole ?? user.role);
    if (!activeConfig || activeConfig.portalPrefix !== config.portalPrefix) return;

    const role = user.primaryRole ?? user.role;
    const status = normalizeOnboardingStatus(user.onboarding_status, role);
    const onboardingPrefix = `${config.portalPrefix}/onboarding`;
    const onOnboardingRoute = pathname.startsWith(onboardingPrefix);
    const requiredPath = getOnboardingStepPath(config.portalPrefix, status, role);

    if (requiredPath && pathname !== requiredPath) {
      redirectingRef.current = true;
      router.replace(requiredPath);
      return;
    }

    if (isFirstLoginOnboardingComplete(status, role) && onOnboardingRoute) {
      redirectingRef.current = true;
      router.replace(config.dashboardPath);
    }
  }, [config.dashboardPath, config.portalPrefix, isLoading, pathname, router, user]);

  if (isLoading) {
    return <FalconLoader label="Loading onboarding…" className="min-h-screen" />;
  }

  return <>{children}</>;
}
