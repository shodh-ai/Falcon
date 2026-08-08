'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

function statusLabel(status: string) {
  switch (status) {
    case 'REQUESTED':
      return 'Sent to COO for triage';
    case 'IN_PROGRESS':
      return 'COO accepted — in progress';
    case 'DONE':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled by COO';
    default:
      return status;
  }
}

function statusTone(status: string) {
  switch (status) {
    case 'REQUESTED':
      return 'text-amber-700';
    case 'IN_PROGRESS':
      return 'text-blue-700';
    case 'DONE':
      return 'text-emerald-700';
    case 'CANCELLED':
      return 'text-red-700';
    default:
      return 'text-muted-foreground';
  }
}

function formatWhen(iso?: string | null) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function Page() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [partners, setPartners] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    return Promise.all([labs.partners(), labs.workOrders()])
      .then(([p, o]) => {
        setPartners(p);
        setOrders(o);
      })
      .catch(() => toast.error('Load failed'))
      .finally(() => setLoading(false));
  }, [labs]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onFocus = () => void reload();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const requestWo = (p: any) =>
    labs
      .createWorkOrder({
        partner_id: p.partner_id,
        title: `Work order — ${p.partner_code}`,
        notes: p.specialty,
      })
      .then(() => {
        toast.success('Work order sent to COO queue');
        return reload();
      })
      .catch((e) => {
        const msg = String(e?.message ?? e);
        if (msg.includes('WORK_ORDER_ALREADY_OPEN') || msg.includes('open work order')) {
          toast.error('You already have a pending request for this partner. Refresh to see its status.');
          void reload();
          return;
        }
        toast.error(msg);
      });

  return (
    <div className="space-y-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-sgvu-navy">Fabless Network</h1>
          <p className="text-sm text-muted-foreground">
            Each Request WO creates one ticket in the COO queue. Status updates when COO accepts or closes it.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void reload()} disabled={loading}>
          Refresh status
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {partners.map((p) => (
          <Card key={p.partner_id}>
            <CardHeader className="pb-2"><CardTitle className="text-base">{p.name}</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>{p.specialty}</p>
              <Button size="sm" onClick={() => void requestWo(p)}>Request WO</Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <h2 className="text-lg font-bold">Work orders</h2>
      {loading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">Loading…</p>
      )}
      {!loading && orders.length === 0 && (
        <p className="text-sm text-muted-foreground">No work orders yet.</p>
      )}
      {orders.map((o) => (
        <Card key={o.work_order_id}>
          <CardContent className="space-y-1 pt-4 text-sm">
            <p className="font-medium">{o.partner_name}: {o.title}</p>
            <p className={statusTone(o.status)}>{statusLabel(o.status)}</p>
            <p className="text-xs text-muted-foreground">
              Raised {formatWhen(o.created_at)}
              {o.accepted_at ? ` · COO updated ${formatWhen(o.accepted_at)}` : ''}
            </p>
            {o.accepted_by_name && (
              <p className="text-xs text-muted-foreground">Handled by {o.accepted_by_name}</p>
            )}
            {o.pr_id && (
              <p>
                Procurement PR: {o.pr_description ?? 'Linked'} — {o.pr_status}
                {o.pr_amount != null && ` · ₹${Number(o.pr_amount).toLocaleString('en-IN')}`}
              </p>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
