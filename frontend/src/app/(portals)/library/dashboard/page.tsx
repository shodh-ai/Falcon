'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Metrics = {
  books_currently_issued: number;
  catalog_titles: number;
  total_copies: number;
  overdue_loans: number;
  walk_ins_today: number;
  patrons_inside: number;
};

export default function LibraryDashboardPage() {
  const api = useAuthedApi();
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    void api.get<Metrics>('/api/library-admin/dashboard/metrics').then(setMetrics);
  }, [api]);

  const tiles = [
    { label: 'Books issued now', value: metrics?.books_currently_issued, href: '/library/circulation' },
    { label: 'Catalog titles', value: metrics?.catalog_titles, href: '/library/catalog' },
    { label: 'Physical copies', value: metrics?.total_copies, href: '/library/catalog' },
    { label: 'Overdue loans', value: metrics?.overdue_loans, href: '/library/fines', alert: true },
    { label: 'Walk-ins today', value: metrics?.walk_ins_today, href: '/library/gate' },
    { label: 'Patrons inside', value: metrics?.patrons_inside, href: '/library/gate' },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">Library Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Dedicated librarian workspace — circulation, cataloging, and NAAC reporting only.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href}>
            <Card className={`transition hover:border-sgvu-gold ${t.alert && Number(t.value) > 0 ? 'border-red-300' : ''}`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className={`text-3xl font-black ${t.alert && Number(t.value) > 0 ? 'text-red-600' : 'text-sgvu-navy'}`}>
                  {t.value ?? '—'}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="bg-sgvu-navy">
          <Link href="/library/circulation">Open circulation desk</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/library/catalog">Smart cataloging</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/library/reports">NAAC export</Link>
        </Button>
      </div>
    </div>
  );
}
