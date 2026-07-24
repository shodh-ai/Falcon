'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [partners, setPartners] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const reload = () => Promise.all([labs.partners(), labs.workOrders()]).then(([p, o]) => { setPartners(p); setOrders(o); });
  useEffect(() => { void reload().catch(() => toast.error('Load failed')); }, [labs]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Fabless Network</h1>
      <div className="grid gap-3 md:grid-cols-3">
        {partners.map((p) => (
          <Card key={p.partner_id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{p.specialty}</p>
              <Button size="sm" onClick={() => labs.createWorkOrder({ partner_id: p.partner_id, title: `Work order — ${p.partner_code}` }).then(reload).catch((e) => toast.error(String(e.message ?? e)))}>Request WO</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <h2 className="text-lg font-bold">Work orders</h2>
      {orders.map((o) => (
        <Card key={o.work_order_id}><CardContent className="pt-4 text-sm">{o.partner_name}: {o.title} — {o.status}</CardContent></Card>
      ))}
    </div>
  );
}
