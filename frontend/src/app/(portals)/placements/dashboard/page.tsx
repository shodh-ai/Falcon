'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';

const links = [
  { href: '/placements/companies', label: 'Company Master' },
  { href: '/placements/drives', label: 'Placement Drives' },
  { href: '/placements/training', label: 'Skill & Training' },
  { href: '/placements/resumes', label: 'Resume Builder' },
];

export default function PlacementsDashboardPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Placement & Training ATS</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card>
              <CardContent className="p-4 font-medium">{l.label}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
