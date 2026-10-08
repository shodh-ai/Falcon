'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type ReportPayload = {
  generated_at?: string;
  kpis?: Array<{ label: string; value: number }>;
};

export default function CampusReportsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ReportPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<ReportPayload>('/api/campus-admin/reports')
      .then(setData)
      .catch(() => setData({ kpis: [] }))
      .finally(() => setLoading(false));
  }, [api]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-sgvu-gold">Campus Admin</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Campus Reports</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Snapshot for your assigned campus only. Finance, Registrar, and Super Admin keep their own report desks.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports…
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(data?.kpis ?? []).map((kpi) => (
            <Card key={kpi.label} className="border-sgvu-navy/10 bg-white shadow-sm">
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">{kpi.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-sgvu-navy">{kpi.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
