'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { createVenueBookingApi } from '@/lib/api/api.venue-booking';

export function VenueRequestsWidget({
  title,
  href,
  loadPending,
}: {
  title: string;
  href: string;
  loadPending: (api: ReturnType<typeof createVenueBookingApi>) => Promise<unknown[]>;
}) {
  const api = useAuthedApi();
  const venueApi = useMemo(() => createVenueBookingApi(api), [api]);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    void loadPending(venueApi)
      .then((rows) => setCount(rows.length))
      .catch(() => setCount(0));
  }, [venueApi, loadPending]);

  return (
    <Card className={count && count > 0 ? 'border-amber-300' : undefined}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Building2 className="h-4 w-4" /> {title}
        </CardTitle>
        {count !== null && count > 0 ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {count} pending
          </span>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-3">
        <p className="text-3xl font-black text-sgvu-navy">{count ?? '—'}</p>
        <Button asChild size="sm" variant="outline">
          <Link href={href}>Open inbox</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
