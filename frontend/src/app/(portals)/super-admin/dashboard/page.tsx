'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';

const ENTITY_CREATOR_EMAIL = 'superadmin@mygyanvihar.com';

export default function SuperAdminDashboardPage() {
  const { user } = useAuth();
  const isEntityCreator = (user?.email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Master Admin Portal</h1>
      <p className="text-sm text-muted-foreground">
        Govern campus hierarchy, assign deans/HODs, bulk-map students to sections, and impersonate users for support.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {isEntityCreator && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Entity Management</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-sm text-muted-foreground">
                Add schools and campuses; grant HR admins scoped access per entity.
              </p>
              <Button asChild>
                <Link href="/super-admin/entities">Manage entities</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hierarchy Mapper</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Campus → School → Department → Program → Batch → Section</p>
            <Button asChild>
              <Link href="/super-admin/hierarchy">Open mapper</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Impersonation</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Read-only login-as with full audit trail</p>
            <Button asChild variant="outline">
              <Link href="/super-admin/impersonation">Manage impersonation</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <ProfileCorrectionWidget />
    </div>
  );
}
