'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [d, setD] = useState<any>(null);
  useEffect(() => { void ops.dashboard().then(setD).catch(() => toast.error('Load failed')); }, [ops]);
  const tiles = [
    ['ESM SLA Breaches', d?.esm_sla_breaches],
    ['Open POs', d?.open_pos],
    ['Pending GRN', d?.pending_grn],
    ['Vendor Penalties', d?.vendor_penalties_count],
    ['Lab Checkouts', d?.lab_active_checkouts],
    ['Fellowship Trials', d?.fellowship_trials],
    ['Golden Tickets', d?.challenge_funnel?.golden],
  ];
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">COO Operations</h1>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(([label, value]) => (
          <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold text-sgvu-navy">{Number(value ?? 0)}</CardContent></Card>
        ))}
      </div>
    </div>
  );
}
