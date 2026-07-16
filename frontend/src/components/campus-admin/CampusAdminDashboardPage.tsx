'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import { ProfileCorrectionWidget } from '@/components/hod/ProfileCorrectionWidget';
import { campusAdminRoutes, CAMPUS_ADMIN_LOGIN_EMAIL } from '@/lib/campus-admin.roles';

const ENTITY_CREATOR_EMAIL = CAMPUS_ADMIN_LOGIN_EMAIL;

export function CampusAdminDashboardPage() {
  const { user } = useAuth();
  const isEntityCreator = (user?.email ?? '').trim().toLowerCase() === ENTITY_CREATOR_EMAIL;

  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Campus Admin Portal</h1>
      <p className="text-sm text-muted-foreground">
        Govern campus hierarchy, run admissions operations, and support users across Falcon.
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
                <Link href={campusAdminRoutes.entities}>Manage entities</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hierarchy Mapper</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">Campus → School → Department → Program → Batch</p>
            <Button asChild>
              <Link href={campusAdminRoutes.hierarchy}>Open mapper</Link>
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
              <Link href={campusAdminRoutes.impersonation}>Manage impersonation</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admissions Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">
              Kanban board, verifications, counseling, and enrolled student records.
            </p>
            <Button asChild variant="outline">
              <Link href={campusAdminRoutes.admissionsPipeline}>Open admissions</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
      <ProfileCorrectionWidget />
    </div>
  );
}
