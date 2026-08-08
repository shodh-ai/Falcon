'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createLabsApi } from '@/lib/api/api.labs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

function statusLabel(status: string) {
  switch (status) {
    case 'REQUESTED':
      return 'Awaiting COO triage';
    case 'IN_PROGRESS':
      return 'In progress';
    case 'DONE':
      return 'Completed';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

export default function FablessWorkOrdersPage() {
  const api = useAuthedApi();
  const labs = useMemo(() => createLabsApi(api), [api]);
  const [orders, setOrders] = useState<any[]>([]);
  const [amountById, setAmountById] = useState<Record<string, string>>({});

  const reload = () =>
    labs
      .workOrders()
      .then(setOrders)
      .catch(() => toast.error('Could not load work orders'));

  useEffect(() => {
    void reload();
  }, [labs]);

  const pending = orders.filter((o) => o.status === 'REQUESTED');
  const active = orders.filter((o) => o.status === 'IN_PROGRESS');
  const closed = orders.filter((o) => o.status === 'DONE' || o.status === 'CANCELLED');

  const spawnPr = async (order: any) => {
    const raw = amountById[order.work_order_id] ?? '';
    const amount = Number(raw);
    if (!(amount > 0)) {
      toast.error('Enter a valid amount (INR) to spawn procurement');
      return;
    }
    try {
      const res = await labs.spawnWorkOrderPr(order.work_order_id, { amount_estimate: amount });
      toast.success(`PR created — routed to Procurement (${res.requisition?.status ?? 'SUBMITTED'})`);
      void reload();
    } catch (e) {
      toast.error(String((e as Error).message ?? e));
    }
  };

  const renderOrder = (o: any, actions: boolean) => (
    <Card key={o.work_order_id}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{o.partner_name}: {o.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>{statusLabel(o.status)}</span>
          <span>Requested by {o.requester_name ?? 'Lab Admin'}</span>
          {o.accepted_by_name && <span>COO owner: {o.accepted_by_name}</span>}
        </div>
        {o.notes && <p className="text-muted-foreground">{o.notes}</p>}
        {o.pr_id && (
          <p>
            Linked PR:{' '}
            <Link className="underline text-sgvu-navy" href="/finance/procurement">
              {o.pr_description ?? o.pr_id.slice(0, 8)} — {o.pr_status}
            </Link>
            {o.pr_amount != null && (
              <span className="text-muted-foreground">
                {' '}
                (₹{Number(o.pr_amount).toLocaleString('en-IN')})
              </span>
            )}
          </p>
        )}
        {actions && (
          <div className="flex flex-wrap items-end gap-2 pt-1">
            {o.status === 'REQUESTED' && (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    labs.acceptWorkOrder(o.work_order_id).then(reload).catch((e) => toast.error(String(e.message ?? e)))
                  }
                >
                  Accept & start
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    labs.cancelWorkOrder(o.work_order_id, { notes: 'Rejected by COO' }).then(reload).catch((e) => toast.error(String(e.message ?? e)))
                  }
                >
                  Reject
                </Button>
              </>
            )}
            {o.status === 'IN_PROGRESS' && (
              <Button
                size="sm"
                onClick={() =>
                  labs.completeWorkOrder(o.work_order_id).then(reload).catch((e) => toast.error(String(e.message ?? e)))
                }
              >
                Mark done
              </Button>
            )}
            {(o.status === 'REQUESTED' || o.status === 'IN_PROGRESS') && !o.pr_id && (
              <>
                <Input
                  className="h-8 w-36"
                  type="number"
                  min={1}
                  placeholder="Amount (INR)"
                  value={amountById[o.work_order_id] ?? ''}
                  onChange={(e) =>
                    setAmountById((prev) => ({ ...prev, [o.work_order_id]: e.target.value }))
                  }
                />
                <Button size="sm" variant="secondary" onClick={() => void spawnPr(o)}>
                  Spawn PR → Procurement
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Fabless Work Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tokamak Labs partner requests land here for COO triage. Accept, spawn a purchase requisition for Procurement, then close when fulfilled.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Awaiting triage ({pending.length})</h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No new requests.</p>
        ) : (
          pending.map((o) => renderOrder(o, true))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">In progress ({active.length})</h2>
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing active.</p>
        ) : (
          active.map((o) => renderOrder(o, true))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Closed ({closed.length})</h2>
        {closed.slice(0, 10).map((o) => renderOrder(o, false))}
      </section>
    </div>
  );
}
