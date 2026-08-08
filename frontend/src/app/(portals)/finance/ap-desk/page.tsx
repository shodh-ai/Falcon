'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import { shortPoId } from '@/lib/finance/purchase-order-display';

function matchLabel(status: string | undefined) {
  if (status === 'MISSING_GRN') return '3-Way Match Failed: Missing GRN.';
  if (status === 'MISSING_INVOICE') return '3-Way Match Failed: Missing invoice.';
  if (status === 'AMOUNT_MISMATCH') return '3-Way Match Failed: Amount mismatch.';
  if (status === 'PO_NOT_APPROVED') return '3-Way Match Failed: PO not approved.';
  if (status === 'MATCHED') return '3-way match OK — ready to pay.';
  return status ?? 'Run 3-way preview';
}

function nextStepHint(status: string | undefined, poId: string): { label: string; href: string } | null {
  if (status === 'MISSING_INVOICE') {
    return {
      label: 'Log vendor invoice for this PO',
      href: `/finance/expenses?po_id=${encodeURIComponent(poId)}`,
    };
  }
  if (status === 'MISSING_GRN') {
    return {
      label: 'Record goods receipt (Stores)',
      href: '/finance/grn',
    };
  }
  if (status === 'AMOUNT_MISMATCH') {
    return {
      label: 'Fix invoice amount on Expense Heads & Bills',
      href: `/finance/expenses?po_id=${encodeURIComponent(poId)}`,
    };
  }
  return null;
}

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

  useEffect(() => {
    if (!pos.length) return;
    void Promise.all(
      pos.map((p) => ops.threeWayMatch(p.po_id).then((m) => [p.po_id, m] as const)),
    )
      .then((entries) => {
        setPreview((prev) => {
          const next = { ...prev };
          for (const [id, m] of entries) next[id] = m;
          return next;
        });
      })
      .catch(() => {});
  }, [pos, ops]);

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
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Accounts Payable Desk</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Payment needs <strong>PO + GRN + invoice linked to the same PO</strong>. Use the next-step
          link on each row — you do not need to copy UUIDs manually.
        </p>
      </div>

      {pos.map((p) => {
        const m = preview[p.po_id];
        const canPay = Boolean(m?.can_pay) && p.status === 'APPROVED';
        const next = nextStepHint(m?.match_status, p.po_id);
        return (
          <Card key={p.po_id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{p.description}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <p className="text-xs font-mono text-muted-foreground">
                PO ID: {p.po_id} ({shortPoId(p.po_id)})
              </p>
              <div className="flex flex-wrap gap-2 items-center">
                <span>
                  Gross ₹{Number(p.amount).toLocaleString('en-IN')} · {p.status}
                </span>
                {m && (
                  <span
                    className={
                      m.can_pay ? 'text-emerald-700 font-medium' : 'text-red-700 font-medium'
                    }
                  >
                    {matchLabel(m.match_status)}
                  </span>
                )}
                {m && (
                  <span className="text-muted-foreground">
                    GRN {m.has_grn ? '✓' : '✗'} · Invoices {m.invoice_count ?? 0} · Penalties −₹
                    {Number(m.penalties ?? 0).toLocaleString('en-IN')} → Net ₹
                    {Number(m.net_paid ?? p.amount).toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              {next && p.status === 'APPROVED' && (
                <Link
                  href={next.href}
                  className="text-sm font-medium text-sgvu-navy underline underline-offset-2"
                >
                  Next: {next.label} →
                </Link>
              )}
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => void loadMatch(p.po_id)}>
                  3-way + penalty preview
                </Button>
                {p.status === 'APPROVED' && (
                  <Button
                    size="sm"
                    disabled={!canPay}
                    title={canPay ? 'Execute payment' : matchLabel(m?.match_status)}
                    onClick={() => {
                      if (!canPay) {
                        toast.error(matchLabel(m?.match_status));
                        return;
                      }
                      ops
                        .payPo(p.po_id)
                        .then((res: any) => {
                          toast.success(
                            `Paid net ₹${Number(res.net_paid ?? p.amount).toLocaleString('en-IN')} (penalties ₹${Number(res.penalties ?? 0).toLocaleString('en-IN')})`,
                          );
                          return reload();
                        })
                        .catch((e) => toast.error(String(e?.message ?? e)));
                    }}
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
