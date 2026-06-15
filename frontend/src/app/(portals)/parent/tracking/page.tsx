'use client';

import useSWR from 'swr';
import { Loader2, Shield } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';
import { useParentChild } from '@/context/ParentChildContext';
import { ParentBusMap } from '@/components/parent/ParentBusMap';
import { ParentPageHeader } from '@/components/parent/ParentPageHeader';

type GateLog = {
  pass_id: string;
  reason: string;
  status: string;
  exited_at: string | null;
  returned_at: string | null;
  created_at: string;
  hostel_name: string | null;
};

type TrackingData = {
  gate_logs: GateLog[];
};

export default function ParentTrackingPage() {
  const api = useAuthedApi();
  const { selectedChildId, loading: childLoading } = useParentChild();

  const { data, isLoading } = useSWR<TrackingData>(
    selectedChildId ? ['parent-tracking', selectedChildId] : null,
    () => api.get<TrackingData>(`/api/parent/students/${selectedChildId}/tracking`),
    { revalidateOnFocus: true, refreshInterval: 30_000 },
  );

  if (childLoading || isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
      </div>
    );
  }

  const logs = data?.gate_logs ?? [];

  return (
    <div className="space-y-6">
      <ParentPageHeader
        title="Safety & Live Tracking"
        description="Hostel gate movement logs and live university bus GPS for your child."
      />

      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-sgvu-navy" />
            Hostel In/Out Logs
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hostel gate pass activity recorded.</p>
          ) : (
            logs.map((log) => (
              <div key={log.pass_id} className="rounded-xl border px-3 py-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sgvu-navy">{log.hostel_name ?? 'Hostel'}</p>
                  <Badge variant="outline">{log.status}</Badge>
                </div>
                <p className="mt-1 text-muted-foreground">{log.reason}</p>
                <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
                  {log.exited_at ? (
                    <p>Left: {new Date(log.exited_at).toLocaleString('en-IN')}</p>
                  ) : null}
                  {log.returned_at ? (
                    <p>Returned: {new Date(log.returned_at).toLocaleString('en-IN')}</p>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Live Bus Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          {selectedChildId ? <ParentBusMap studentUserId={selectedChildId} /> : null}
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
