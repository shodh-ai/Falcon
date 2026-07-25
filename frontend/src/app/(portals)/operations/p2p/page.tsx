'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [levels, setLevels] = useState<any[]>([]);
  const [pos, setPos] = useState<any[]>([]);

  useEffect(() => {
    void Promise.all([ops.dofaLevels(), ops.purchaseOrders()])
      .then(([l, p]) => {
        setLevels(l);
        setPos(p);
      })
      .catch(() => toast.error('Load failed'));
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">P2P Oversight</h1>
      <div className="flex flex-wrap gap-2 text-sm">
        <Link className="underline" href="/finance/requisitions">
          Requestor PR
        </Link>
        <Link className="underline" href="/finance/procurement">
          Procurement
        </Link>
        <Link className="underline" href="/finance/approvals">
          DOFA Approvals
        </Link>
        <Link className="underline" href="/finance/grn">
          Stores GRN
        </Link>
        <Link className="underline" href="/finance/ap-desk">
          AP Desk
        </Link>
        <Link className="underline" href="/finance/dofa">
          DOFA Matrix
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>DOFA Levels</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {levels.map((d) => (
            <div key={d.level_no}>
              L{d.level_no} {d.label}:{' '}
              {d.max_amount_inr == null
                ? 'unlimited'
                : `≤ ₹${Number(d.max_amount_inr).toLocaleString('en-IN')}`}{' '}
              · {(d.required_roles ?? []).join('+')} · {d.required_signatures} sig
            </div>
          ))}
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">
        Four departments: Requestor → Procurement → Stores → Finance. Direct sample PO create is
        Procurement-only.
      </p>
      {pos.slice(0, 20).map((p) => (
        <Card key={p.po_id}>
          <CardContent className="pt-4 text-sm">
            {p.description} — ₹{Number(p.amount).toLocaleString('en-IN')} — {p.status}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
