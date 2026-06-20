'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { VenueRequestsWidget } from '@/components/venues/VenueRequestsWidget';

export default function AdminOpsDashboardPage() {
  const links = [
    { href: '/admin-ops/assets', label: 'Inventory & Assets' },
    { href: '/admin-ops/fleet', label: 'Fleet & Transport' },
    { href: '/admin-ops/events', label: 'Event Management' },
    { href: '/admin-ops/venue-requests', label: 'Student Venue Requests' },
    { href: '/admin-ops/timetable', label: 'Master Timetable' },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Campus Administration</h1>
      <VenueRequestsWidget
        title="Estate venue requests"
        href="/admin-ops/venue-requests"
        loadPending={(v) => v.estatePending()}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="transition hover:border-sgvu-navy/40">
              <CardContent className="p-4 font-medium">{l.label}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
