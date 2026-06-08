'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Payslip = {
  payslip_id: string;
  month: string;
  net_pay: string | number;
  status?: string;
};

export function MyPayslipsPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Payslip[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api
      .get<Payslip[]>('/api/hr/payslips/my-payslips')
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load payslips'))
      .finally(() => setLoading(false));
  }, [api]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-sgvu-gold" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No payslips published yet. They appear here after payroll is processed each month.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((p) => (
        <Card key={p.payslip_id}>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-semibold text-sgvu-navy">{p.month}</p>
              <p className="text-sm text-muted-foreground">Net pay: ₹{Number(p.net_pay).toLocaleString('en-IN')}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-2">
              <Download className="h-4 w-4" />
              Download
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
