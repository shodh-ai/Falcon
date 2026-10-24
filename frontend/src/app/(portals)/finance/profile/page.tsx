'use client';

import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function FinanceProfilePage() {
  const { user, isLoading } = useAuth();

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-6">
      <FinancePageHeader title="My Profile" description="Your signed-in identity and Finance workspace access." />
      <Card>
        <CardHeader><CardTitle className="text-base">Account details</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground">Loading your profile…</p> : (
            <dl className="grid gap-4 text-sm sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Name</dt><dd className="font-semibold">{user?.name || 'Not provided'}</dd></div>
              <div><dt className="text-muted-foreground">Email</dt><dd className="break-all font-semibold">{user?.email || 'Not provided'}</dd></div>
              <div><dt className="text-muted-foreground">Primary role</dt><dd className="font-semibold">{user?.primaryRole || user?.role || 'Not assigned'}</dd></div>
              <div><dt className="text-muted-foreground">Department</dt><dd className="font-semibold">{user?.department || 'Not assigned'}</dd></div>
              <div><dt className="text-muted-foreground">Other roles</dt><dd className="font-semibold">{user?.roles?.length ? user.roles.join(', ') : 'None'}</dd></div>
              <div><dt className="text-muted-foreground">Institution</dt><dd className="font-semibold">{user?.tenant_subdomain?.toUpperCase() || 'Current institution'}</dd></div>
            </dl>
          )}
          <Link href="/finance/settings" className="mt-6 inline-flex text-sm font-semibold text-sgvu-navy underline underline-offset-2">Account settings</Link>
        </CardContent>
      </Card>
    </div>
  );
}
