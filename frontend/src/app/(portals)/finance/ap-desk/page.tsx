'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export default function ApDeskPage() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [pos, setPos] = useState<any[]>([]);
  const [preview, setPreview] = useState<Record<string, any>>({});

  const reload = () =>
    ops
      .purchaseOrders()
      .then((p) => setPos(p.filter((x: any) => ['APPROVED', 'PAID'].includes(x.status))))
      .catch(() => toast.error('Load failed'));

  useEffect(() => {
    void reload();
  }, [ops]);

  async function loadMatch(poId: string) {
    try {
      const m = await ops.threeWayMatch(poId);
      setPreview((prev) => ({ ...prev, [poId]: m }));
      toast.success(
        `${m.match_status} · gross ₹${Number(m.gross ?? 0).toLocaleString('en-IN')} · penalties ₹${Number(m.penalties ?? 0).toLocaleString('en-IN')} · net ₹${Number(m.net_paid ?? 0).toLocaleString('en-IN')}`,
      );
    } catch (e: any) {
      toast.error(String(e?.message ?? e));
    }
  }

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Accounts Payable Desk</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        AP Manager verifies 3-way match (PO + GRN + Invoice); vendor SLA penalties are
        auto-netted before Pay. You do not negotiate vendors or receive goods.
      </p>

      {pos.map((p) => {
        const m = preview[p.po_id];
        return (
          <Card key={p.po_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.description}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <span>
                  Gross ₹{Number(p.amount).toLocaleString('en-IN')} · {p.status}
                </span>
                {m && (
                  <span className="text-muted-foreground">
                    Penalties −₹{Number(m.penalties ?? 0).toLocaleString('en-IN')} → Net ₹
                    {Number(m.net_paid ?? p.amount).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void loadMatch(p.po_id)}>
                  3-way + penalty preview
                </Button>
                {p.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    onClick={() =>
                      ops
                        .payPo(p.po_id)
                        .then((res: any) => {
                          toast.success(
                            `Paid net ₹${Number(res.net_paid ?? p.amount).toLocaleString('en-IN')} (penalties ₹${Number(res.penalties ?? 0).toLocaleString('en-IN')})`,
                          );
                          return reload();
                        })
                        .catch((e) => toast.error(String(e?.message ?? e)))
                    }
                  >
                    Pay (NEFT/RTGS, net of penalties)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
      {!pos.length && (
        <p className="text-sm text-muted-foreground">No approved POs awaiting AP.</p>
      )}
    </div>
  );
}
