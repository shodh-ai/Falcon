'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { createOperationsApi } from '@/lib/api/api.operations';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from '@/lib/notifications/falcon-toast';

export default function Page() {
  const api = useAuthedApi();
  const ops = useMemo(() => createOperationsApi(api), [api]);
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    void ops.purchaseOrders().then(setRows).catch(() => toast.error('Load failed'));
  }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Purchase Orders</h1>
      {rows.map((r) => (
        <Card key={r.po_id}>
          <CardContent className="pt-4 text-sm">
            {r.description} — ₹{Number(r.amount).toLocaleString('en-IN')} — {r.status}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
