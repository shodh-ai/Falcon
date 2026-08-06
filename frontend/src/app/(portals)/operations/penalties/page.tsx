'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [vendorId, setVendorId] = useState('');
  const [reason, setReason] = useState('SLA breach — delayed delivery');
  const [amount, setAmount] = useState('5000');

  const reload = useCallback(
    () =>
      Promise.all([ops.penalties(), ops.vendors()]).then(([p, v]) => {
        setRows(p);
        setVendors(v);
        if (!vendorId && v[0]?.vendor_id) setVendorId(v[0].vendor_id);
      }),
    [ops, vendorId],
  );

  useEffect(() => {
    void reload().catch(() => toast.error('Load failed'));
  }, [reload]);

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Vendor Penalties</h1>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apply penalty</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={vendorId}
            onChange={(e) => setVendorId(e.target.value)}
          >
            {!vendors.length && <option value="">No vendors — create a PO first</option>}
            {vendors.map((v) => (
              <option key={v.vendor_id} value={v.vendor_id}>
                {v.business_name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <Input
            type="number"
            placeholder="Amount (INR)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <Button
            disabled={!vendorId || !reason.trim() || !(Number(amount) > 0)}
            onClick={() =>
              ops
                .applyPenalty({
                  vendor_id: vendorId,
                  reason: reason.trim(),
                  amount_inr: Number(amount),
                })
                .then(() => {
                  toast.success('Penalty applied');
                  return reload();
                })
                .catch((e) => toast.error(String(e.message ?? e)))
            }
          >
            Apply penalty
          </Button>
        </CardContent>
      </Card>
      {rows.map((p) => (
        <Card key={p.penalty_id}>
          <CardContent className="pt-4 text-sm">
            {p.vendor_name ?? p.vendor_id}: ₹{Number(p.amount_inr).toLocaleString('en-IN')} —{' '}
            {p.reason}
          </CardContent>
        </Card>
      ))}
      {!rows.length && <p className="text-sm text-muted-foreground">No penalties yet.</p>}
    </div>
  );
}
