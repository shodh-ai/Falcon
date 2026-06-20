'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellPortfolioItem } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function IncubationPortfolioPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<EcellPortfolioItem[]>([]);

  useEffect(() => {
    void ecellApi
      .portfolio()
      .then(setItems)
      .catch(() => toast.error('Could not load portfolio'))
      .finally(() => setLoading(false));
  }, [ecellApi]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading active portfolio…</p>;

  return (
    <div className="space-y-5 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Active Portfolio</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Funded and operating student startups in the incubation program.
        </p>
      </div>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">No funded startups yet.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.project_id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-lg">{item.startup_name}</CardTitle>
                  <Badge>FUNDED</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{item.student_name}</p>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="line-clamp-4 text-muted-foreground">{item.innovation_description}</p>
                <p>Grant: {formatInr(item.disbursed_amount ?? item.approved_funding_amount)}</p>
                <p className="text-xs text-muted-foreground">{item.cohort_name ?? 'Incubation cohort'}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
