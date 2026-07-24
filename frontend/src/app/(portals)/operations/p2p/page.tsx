'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [pos, setPos] = useState<any[]>([]);
  const [dofa, setDofa] = useState<any[]>([]);
  const reload = () => Promise.all([ops.purchaseOrders(), ops.dofa()]).then(([p, d]) => { setPos(p); setDofa(d); });
  useEffect(() => { void reload().catch(() => toast.error('Load failed')); }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">P2P Oversight</h1>
      <Card><CardHeader><CardTitle>DOFA Limits</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1">{dofa.map((d) => <div key={d.dofa_id}>{d.role_name}: ₹{Number(d.max_amount_inr).toLocaleString('en-IN')}</div>)}</CardContent></Card>
      <Button onClick={() => ops.createPo({ description: 'Tokamak prototype parts', amount: 15000 }).then(reload).catch((e) => toast.error(String(e.message ?? e)))}>Create sample PO</Button>
      {pos.map((p) => (
        <Card key={p.po_id}><CardContent className="pt-4 flex gap-2 text-sm items-center">
          <span>{p.description} — ₹{Number(p.amount).toLocaleString('en-IN')} — {p.status}</span>
          <Button size="sm" variant="outline" onClick={() => ops.createGrn({ po_id: p.po_id }).then(() => toast.success('GRN created')).catch((e) => toast.error(String(e.message ?? e)))}>GRN</Button>
          <Button size="sm" variant="secondary" onClick={() => ops.threeWayMatch(p.po_id).then((m) => toast.success(`${m.match_status} · pay=${m.can_pay}`)).catch((e) => toast.error(String(e.message ?? e)))}>3-way</Button>
          <Button size="sm" onClick={() => ops.payPo(p.po_id).then(() => { toast.success('PO paid'); return reload(); }).catch((e) => toast.error(String(e.message ?? e)))}>Pay</Button>
        </CardContent></Card>
      ))}
    </div>
  );
}
