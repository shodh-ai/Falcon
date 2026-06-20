'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Rocket } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createEcellApi, type EcellDashboard } from '@/lib/api/api.ecell';

function formatInr(value: string | number | null | undefined) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
    Number(value ?? 0),
  );
}

export default function IncubationDashboardPage() {
  const api = useAuthedApi();
  const ecellApi = useMemo(() => createEcellApi(api), [api]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<EcellDashboard | null>(null);

  useEffect(() => {
    void ecellApi
      .dashboard()
      .then(setSummary)
      .catch(() => toast.error('Could not load incubation dashboard'))
      .finally(() => setLoading(false));
  }, [ecellApi]);

  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading incubation overview…</p>;

  return (
    <div className="space-y-5 p-6">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-orange-50 p-3 text-orange-700">
          <Rocket className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">Incubation Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Isolated workspace for startup IP, grant approvals, and portfolio tracking — separate from Faculty and Admin Ops.
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Startups Incubated', summary?.funded_count],
          ['Total Funds Disbursed', summary?.total_disbursed, true],
          ['Active Cohorts', summary?.active_cohorts ?? 0],
          ['New Applications', summary?.submitted_count],
        ].map(([label, value, isMoney]) => (
          <Card key={String(label)}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-sgvu-navy">
                {isMoney ? formatInr(value as string | number) : Number(value ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['L1 Review Queue', summary?.l1_queue_count],
          ['L2 Review Queue', summary?.l2_queue_count],
          ['Rejected', summary?.rejected_count],
        ].map(([label, value]) => (
          <Card key={String(label)}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-xl font-bold text-sgvu-navy">{Number(value ?? 0)}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
