'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';

type MatchState = { match_status: string; can_pay: boolean };

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [pos, setPos] = useState<any[]>([]);
  const [dofa, setDofa] = useState<any[]>([]);
  const [matches, setMatches] = useState<Record<string, MatchState>>({});

  const loadMatches = useCallback(
    async (orders: any[]) => {
      const next: Record<string, MatchState> = {};
      await Promise.all(
        orders
          .filter((p) => p.status !== 'PAID')
          .map(async (p) => {
            try {
              next[p.po_id] = await ops.threeWayMatch(p.po_id);
            } catch {
              next[p.po_id] = { match_status: 'UNKNOWN', can_pay: false };
            }
          }),
      );
      setMatches(next);
    },
    [ops],
  );

  const reload = useCallback(async () => {
    const [p, d] = await Promise.all([ops.purchaseOrders(), ops.dofa()]);
    setPos(p);
    setDofa(d);
    await loadMatches(p);
  }, [loadMatches, ops]);

  useEffect(() => {
    void reload().catch(() => toast.error('Load failed'));
  }, [reload]);

  const badge = (label: string, ok: boolean) => (
    <span
      className={`rounded px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {label}
    </span>
  );

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">P2P Oversight</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Procure-to-pay golden path: Create PO → GRN → Vendor invoice → 3-way match → Pay.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>DOFA Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {dofa.map((d) => (
            <div key={d.dofa_id}>
              {d.role_name}: ₹{Number(d.max_amount_inr).toLocaleString('en-IN')}
            </div>
          ))}
        </CardContent>
      </Card>
      <Button
        onClick={() =>
          ops
            .createPo({ description: 'Tokamak prototype parts', amount: 15000 })
            .then(() => {
              toast.success('Sample PO created');
              return reload();
            })
            .catch((e) => toast.error(String(e.message ?? e)))
        }
      >
        Create sample PO
      </Button>
      {pos.map((p) => {
        const paid = p.status === 'PAID';
        const match = matches[p.po_id];
        const hasGrn = match ? match.match_status !== 'MISSING_GRN' : false;
        const hasInvoice = match
          ? !['MISSING_GRN', 'MISSING_INVOICE'].includes(match.match_status)
          : false;
        const matched = match?.match_status === 'MATCHED';

        return (
          <Card key={p.po_id}>
            <CardContent className="space-y-3 pt-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {p.description} — ₹{Number(p.amount).toLocaleString('en-IN')}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs font-semibold ${
                    paid ? 'bg-sgvu-navy text-white' : 'bg-slate-200 text-slate-800'
                  }`}
                >
                  {p.status}
                </span>
                {!paid && match && badge(match.match_status, matched)}
              </div>
              {paid ? (
                <p className="text-muted-foreground">Payment complete — no further actions.</p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={hasGrn}
                    onClick={() =>
                      ops
                        .createGrn({ po_id: p.po_id })
                        .then(() => {
                          toast.success('GRN recorded');
                          return reload();
                        })
                        .catch((e) => toast.error(String(e.message ?? e)))
                    }
                  >
                    {hasGrn ? 'GRN ✓' : 'GRN'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={hasInvoice}
                    onClick={() =>
                      ops
                        .createInvoice(p.po_id)
                        .then(() => {
                          toast.success('Vendor invoice linked');
                          return reload();
                        })
                        .catch((e) => toast.error(String(e.message ?? e)))
                    }
                  >
                    {hasInvoice ? 'Invoice ✓' : 'Invoice'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      ops
                        .threeWayMatch(p.po_id)
                        .then((m) => {
                          setMatches((prev) => ({ ...prev, [p.po_id]: m }));
                          if (m.can_pay) toast.success('3-way MATCHED — ready to pay');
                          else toast.warning(`${m.match_status} — complete GRN + Invoice first`);
                        })
                        .catch((e) => toast.error(String(e.message ?? e)))
                    }
                  >
                    3-way
                  </Button>
                  <Button
                    size="sm"
                    disabled={!matched}
                    onClick={() =>
                      ops
                        .payPo(p.po_id)
                        .then(() => {
                          toast.success('PO paid');
                          return reload();
                        })
                        .catch((e) => toast.error(String(e.message ?? e)))
                    }
                  >
                    Pay
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
