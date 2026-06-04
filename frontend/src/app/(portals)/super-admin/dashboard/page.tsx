'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function SuperAdminDashboardPage() {
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Master Admin Portal</h1>
      <p className="text-sm text-muted-foreground">
        Govern campus hierarchy, assign deans/HODs, bulk-map students to sections, and impersonate users for support.
      </p>
      <div className="grid gap-4 md:grid-cols-2">
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
    </div>
  );
}
