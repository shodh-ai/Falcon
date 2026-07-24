'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { void ops.penalties().then(setRows).catch(() => toast.error('Load failed')); }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Vendor Penalties</h1>
      {rows.map((p) => (
        <Card key={p.penalty_id}><CardContent className="pt-4 text-sm">{p.vendor_name ?? p.vendor_id}: ₹{Number(p.amount_inr).toLocaleString('en-IN')} — {p.reason}</CardContent></Card>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">No penalties yet.</p>}
    </div>
  );
}
