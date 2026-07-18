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
  return <AdminIamReadOnly />;
}
