'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FalconLoader } from '@/components/brand/FalconLoader';
import { useAuth } from '@/context/AuthContext';
import { mapEssPathToWorkspace } from '@/lib/workspace-self-service';

export function EssLegacyRedirect() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  useEffect(() => {
    const role = user?.primaryRole ?? user?.role ?? 'Faculty';
    const fullPath = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    const target = mapEssPathToWorkspace(fullPath, role);
    router.replace(target);
  }, [pathname, router, searchParams, user]);

  return <FalconLoader label="Opening your workspace…" className="min-h-[40vh]" />;
}
