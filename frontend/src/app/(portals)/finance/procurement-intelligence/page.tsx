'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function ProcurementIntelligencePage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [data, setData] = useState<any>(null);

  const reload = () =>
    ops
      .fraudSignals()
      .then(setData)
      .catch(() => toast.error('Failed to load fraud signals'));

  useEffect(() => {
    void reload();
  }, [ops]);

  const flags = data?.flags ?? [];

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">Procurement Intelligence</h1>
          <p className="text-sm text-muted-foreground">
            Catches invoice splitting, L2 exceptions, and related-party quote patterns.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            ops
              .invoiceSplitScan()
              .then((r) => {
                toast.success(`Scan complete — ${r.signals ?? 0} signals`);
                return reload();
              })
              .catch((e) => toast.error(String(e?.message ?? e)))
          }
        >
          Run split scan
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending GST verifications</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black">
            {data?.pending_gst_verifications ?? '—'}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Pending escalations</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black">
            {data?.pending_escalations ?? '—'}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fraud signals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {flags.map((f: any) => (
            <div
              key={f.flag_id}
              className={`border rounded-md p-3 ${
                f.severity === 'RED' ? 'border-red-300 bg-red-50/40' : 'border-amber-200'
              }`}
            >
              <div className="font-medium">
                {f.rule_code} · {f.severity}
              </div>
              <div className="text-muted-foreground">
                {String(f.details?.message ?? JSON.stringify(f.details))}
              </div>
              <div className="text-xs mt-1">
                {f.created_at ? new Date(f.created_at).toLocaleString('en-IN') : ''}
              </div>
            </div>
          ))}
          {!flags.length && (
            <p className="text-muted-foreground">No procurement fraud flags yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
