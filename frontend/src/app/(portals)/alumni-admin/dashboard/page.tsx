'use client';

import Link from 'next/link';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AlumniAdminDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Alumni Relations Dashboard"
        description="Verify graduates, track donations, publish events, and monitor NAAC engagement analytics."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          { href: '/alumni-admin/verification', label: 'Verification queue' },
          { href: '/alumni-admin/donations', label: 'Donation ledger' },
          { href: '/alumni-admin/analytics', label: 'Engagement analytics' },
          { href: '/alumni-admin/events', label: 'Event manager' },
        ].map((item) => (
          <Card key={item.href}>
            <CardHeader>
              <CardTitle className="text-base">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild size="sm">
                <Link href={item.href}>Open</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
