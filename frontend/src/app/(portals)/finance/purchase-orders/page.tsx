'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import {
  copyPoId,
  formatPoAmount,
  shortPoId,
  type PurchaseOrderRow,
} from '@/lib/finance/purchase-order-display';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<PurchaseOrderRow[]>([]);
  const [vendors, setVendors] = useState<Record<string, string>>({});

  useEffect(() => {
    void ops
      .purchaseOrders()
      .then((list) => setRows(Array.isArray(list) ? list : []))
      .catch(() => toast.error('Load failed'));
    void api.get<Array<{ vendor_id: string; business_name: string }>>('/finance/vendors')
      .then((list) => setVendors(Object.fromEntries(list.map((v) => [v.vendor_id, v.business_name]))))
      .catch(() => setVendors({}));
  }, [api, ops]);

  return (
    <div className="space-y-4 p-6">
      <div>
        <h1 className="text-2xl font-black text-sgvu-navy">Purchase Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Each PO has a system ID (UUID) used on Expense Heads & Bills for 3-way match. Pick the PO
          from the dropdown there — or copy the ID below.
        </p>
      </div>
      {rows.map((r) => (
        <Card key={r.po_id}>
          <CardContent className="space-y-2 pt-4 text-sm">
            <details>
              <summary className="cursor-pointer font-medium">{r.description} · ₹{formatPoAmount(r.amount)} · {r.status} <span className="text-xs font-normal underline">View details</span></summary>
              <dl className="mt-3 grid gap-1 text-muted-foreground sm:grid-cols-2">
                <div>PO ID: {r.po_id}</div>
                <div>Vendor: {r.vendor_id ? vendors[r.vendor_id] ?? `Vendor ${r.vendor_id}` : 'Not linked'}</div>
                <div>Created: {r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : 'Not recorded'}</div>
                <div>Requested by: {r.requested_by ?? 'Not recorded'}</div>
                <div>Approved by: {r.approved_by ?? 'Not recorded'}</div>
                <div>Approved at: {r.approved_at ? new Date(r.approved_at).toLocaleString('en-IN') : 'Not recorded'}</div>
                <div>Source: {r.source_system ?? 'Legacy'}</div>
              </dl>
            </details>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">PO ID: {r.po_id}</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-7 text-xs"
                onClick={() =>
                  void copyPoId(r.po_id)
                    .then(() => toast.success(`Copied PO ${shortPoId(r.po_id)}`))
                    .catch(() => toast.error('Could not copy'))
                }
              >
                Copy PO ID
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
      {!rows.length && (
        <p className="text-sm text-muted-foreground">No purchase orders yet.</p>
      )}
    </div>
  );
}
