'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import {
  getOnboardingConfigForRole,
  getOnboardingStepPath,
  isFirstLoginOnboardingComplete,
  needsPortalOnboarding,
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

  const role = user?.primaryRole ?? user?.role;
  const activeConfig = getOnboardingConfigForRole(role);
  const applies = Boolean(activeConfig && activeConfig.portalPrefix === config.portalPrefix);
  const onboardingPrefix = `${config.portalPrefix}/onboarding`;
  const onOnboardingRoute = pathname.startsWith(onboardingPrefix);
  const requiredPath = applies
    ? getOnboardingStepPath(config.portalPrefix, user?.onboarding_status, role)
    : null;
  const mustRedirect = Boolean(requiredPath && pathname !== requiredPath);
  const leaveOnboarding =
    applies && isFirstLoginOnboardingComplete(user?.onboarding_status, role) && onOnboardingRoute;

  useEffect(() => {
    if (isLoading || !user || !applies || redirectingRef.current) return;

    if (mustRedirect && requiredPath) {
      redirectingRef.current = true;
      router.replace(requiredPath);
      return;
    }

    if (leaveOnboarding) {
      redirectingRef.current = true;
      router.replace(config.dashboardPath);
    }
  }, [
    applies,
    config.dashboardPath,
    isLoading,
    leaveOnboarding,
    mustRedirect,
    requiredPath,
    router,
    user,
  ]);

  useEffect(() => {
    redirectingRef.current = false;
  }, [pathname]);

  if (isLoading || !user) {
    return <FalconLoader label="Loading onboarding…" className="min-h-screen" />;
  }

  if (applies && (mustRedirect || leaveOnboarding)) {
    return <FalconLoader label="Redirecting to onboarding…" className="min-h-screen" />;
  }

  if (applies && needsPortalOnboarding(user.onboarding_status, role) && !onOnboardingRoute) {
    return <FalconLoader label="Redirecting to onboarding…" className="min-h-screen" />;
  }

  return <>{children}</>;
}
