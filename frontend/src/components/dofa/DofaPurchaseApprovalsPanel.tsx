'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

export function DofaPurchaseApprovalsPanel() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);

  const reload = () =>
    ops.approvalsInbox().then(setRows).catch(() => toast.error('Load failed'));

  useEffect(() => {
    void reload();
  }, [ops]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">DOFA Purchase Approvals</h1>
      <p className="text-sm text-muted-foreground max-w-2xl">
        P2P level inbox. Higher bands may need multiple signatures (e.g. Procurement Head +
        Finance Controller) before a PO is generated.
      </p>

      {rows.map((r) => (
        <Card key={r.pr_id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{r.description}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 items-center text-sm">
            <span>
              ₹{Number(r.amount_estimate).toLocaleString('en-IN')} · {r.status} · L
              {r.required_level} · sigs {r.signatures_collected ?? 0}
            </span>
            <Button
              size="sm"
              onClick={() =>
                ops
                  .approveRequisition(r.pr_id, { decision: 'APPROVED' })
                  .then((res) => {
                    toast.success(
                      res.po
                        ? 'Fully approved — PO created'
                        : `Signed (${res.signatures_collected ?? '?'}/${res.required_signatures ?? '?'})`,
                    );
                    return reload();
                  })
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                ops
                  .approveRequisition(r.pr_id, { decision: 'REJECTED', notes: 'Rejected in DOFA inbox' })
                  .then(() => {
                    toast.success('Rejected');
                    return reload();
                  })
                  .catch((e) => toast.error(String(e?.message ?? e)))
              }
            >
              Reject
            </Button>
          </CardContent>
        </Card>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No items pending your DOFA level.</p>
      )}
    </div>
  );
}
