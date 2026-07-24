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
    void ops.grns().then(setRows).catch(() => toast.error('Load failed'));
  }, [ops]);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-black text-sgvu-navy">Goods Receipt Notes</h1>
      {rows.map((r) => (
        <Card key={r.grn_id}>
          <CardContent className="pt-4 text-sm">
            {r.po_description} — PO ₹{Number(r.po_amount).toLocaleString('en-IN')}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
