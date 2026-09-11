'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canRoleAccessPath, getDashboardPathForRole, type HrCapabilities } from '@/lib/auth-routing';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { useModuleRuntime } from '@/context/ModuleRuntimeContext';
import { runtimeModuleForPath } from '@/lib/launch-modules';

export function RoleGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { manifest, loading: moduleLoading } = useModuleRuntime();
  const redirectingRef = useRef(false);
  const hasHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  const allowed = canRoleAccessPath(
    user?.roles?.length ? user.roles : user?.role,
    pathname,
    user?.hr_capabilities as HrCapabilities | undefined,
    user?.permissions,
    user?.email,
  );
  const pathModule = runtimeModuleForPath(manifest, pathname);
  const moduleUnavailable = Boolean(pathModule && !pathModule.available);

  useEffect(() => {
    if (!hasHydrated || isLoading || redirectingRef.current) return;
    if (!isAuthenticated) {
      redirectingRef.current = true;
      const timer = window.setTimeout(() => {
        try {
          router.replace('/');
        } catch {
          window.location.assign('/');
        }
      }, 0);
      return () => window.clearTimeout(timer);
    }
    if (user && !allowed && !moduleUnavailable) {
      redirectingRef.current = true;
      const target = getDashboardPathForRole(user.primaryRole ?? user.role);
      const timer = window.setTimeout(() => {
        try {
          router.replace(target);
        } catch {
          window.location.assign(target);
        }
      }, 1200);
      return () => window.clearTimeout(timer);
    }
  }, [allowed, hasHydrated, isAuthenticated, isLoading, moduleUnavailable, router, user]);

  if (!hasHydrated || isLoading || moduleLoading || !isAuthenticated || !user) {
    return <FalconLoader label="Switching Falcon workspace…" className="min-h-screen" />;
  }

  if (moduleUnavailable && pathModule) {
    const paused = pathModule.state === 'PAUSED';
    return (
      <div className="flex min-h-screen items-center justify-center bg-sgvu-surface px-4">
        <div className="max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-600" />
          <h1 className="text-xl font-semibold text-sgvu-navy">
            {paused ? 'Module temporarily paused' : 'Module not available'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {pathModule.displayName} is not currently available for your campus or department.
            Existing records and deferred handoffs remain safely preserved.
          </p>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-sgvu-surface px-4">
        <div className="max-w-md rounded-2xl border bg-background p-6 text-center shadow-sm">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-red-600" />
          <h1 className="text-xl font-semibold text-sgvu-navy">403 Forbidden</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your role cannot access this workspace. Redirecting you to your assigned dashboard.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
