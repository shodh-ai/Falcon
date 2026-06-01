'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { canRoleAccessPath, getDashboardPathForRole } from '@/lib/auth-routing';
import { FalconLoader } from '@/components/brand/FalconLoader';

export function RoleGate({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = canRoleAccessPath(user?.roles?.length ? user.roles : user?.role, pathname);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      router.replace('/');
      return;
    }
    if (user && !allowed) {
      const target = getDashboardPathForRole(user.primaryRole ?? user.role);
      const timer = window.setTimeout(() => router.replace(target), 1200);
      return () => window.clearTimeout(timer);
    }
  }, [allowed, isAuthenticated, isLoading, router, user]);

  if (isLoading || !isAuthenticated) {
    return <FalconLoader label="Switching Falcon workspace…" className="min-h-screen" />;
  }

  if (user && !allowed) {
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
