'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import { formatInr } from '@/components/finance/FinancePageHeader';

type Fee = {
  fee_head: string;
  total_amount: string;
  paid_amount: string;
  due_date: string;
  status: string;
};

export default function ParentFeesPage() {
  const api = useAuthedApi();
  const [fees, setFees] = useState<Fee[]>([]);

  useEffect(() => {
    void api.get<Fee[]>('/api/parent/fees').then(setFees).catch(() => setFees([]));
  }, [api]);

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Fee Desk</h1>
      <p className="text-xs text-muted-foreground">Read-only view · Pay via gateway (no edits in parent portal).</p>
      {fees.map((f, i) => {
        const due = Number(f.total_amount) - Number(f.paid_amount);
        return (
          <div key={i} className="rounded-lg border p-4 text-sm">
            <p className="font-semibold">{f.fee_head}</p>
            <p className="text-muted-foreground">Due {f.due_date} · {f.status}</p>
            <p className="mt-1">Outstanding {formatInr(due)}</p>
            {due > 0 && (
              <Button className="mt-2" size="sm" onClick={() => window.open('/student/fees', '_blank')}>
                Pay Now (Student Gateway)
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
