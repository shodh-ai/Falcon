'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { resolveDofaInboxPathForUser } from '@/lib/dofa-portal-routes';
import { resolveUserRoleList } from '@/lib/available-workspaces';

/** Leadership sidebar entry — routes COO/CFO/HOD/etc. to their scoped universal inbox. */
export default function LeadershipDofaInboxPage() {
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const roles = resolveUserRoleList(user);
    const target =
      resolveDofaInboxPathForUser(roles, '/leadership/dofa-inbox') ??
      '/operations/approvals/dofa-inbox';
    router.replace(target);
  }, [router, user]);

  return (
    <div className="p-6">
      <p className="text-sm text-muted-foreground">Opening your DOFA inbox…</p>
    </div>
  );
}
