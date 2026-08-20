'use client';

import { useAuth } from '@/context/AuthContext';
import { AdminIamReadOnly } from '@/components/admin/AdminIamReadOnly';
import CampusAdminHierarchyPage from '../../campus-admin/hierarchy/page';

function hasManageRole(roles: string[] | undefined) {
  return (roles ?? []).some((r) => ['superadmin', 'campusadmin'].includes(r.trim().toLowerCase()));
}

export default function AdminIamPage() {
  const { user } = useAuth();
  if (hasManageRole(user?.roles)) {
    return <CampusAdminHierarchyPage />;
  }
  return (
    <div className="space-y-4">
      <div className="mx-auto max-w-7xl px-4 pt-4 md:px-6">
        <div className="rounded-xl border border-sgvu-gold/25 bg-sgvu-gold/5 px-4 py-3 text-sm text-sgvu-navy">
          Registrar access is intentionally read-only on this screen. Super Admin manages
          hierarchy changes, while Registrar can inspect the current structure and assignments.
        </div>
      </div>
      <AdminIamReadOnly />
    </div>
  );
}
