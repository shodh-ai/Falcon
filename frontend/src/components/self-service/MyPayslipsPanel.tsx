'use client';

import { useEffect, useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type Payslip = {
  payslip_id: string;
  month: string;
  net_pay: string | number;
  status?: string;
  file_path?: string;
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
      <Card>
        <CardContent className="flex flex-col items-center justify-center px-6 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sgvu-navy/5 text-sgvu-navy">
            <FileText className="h-6 w-6" />
          </div>
          <h2 className="mt-4 font-semibold text-sgvu-navy">No payslips published yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Your payslip will appear here after HR completes and publishes the monthly payroll.
          </p>
        </CardContent>
      </Card>
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
            <Button 
              size="sm" 
              variant="outline" 
              className="gap-2"
              onClick={() => {
                if (p.file_path) {
                  window.open(p.file_path, '_blank');
                } else {
                  toast.error('Payslip document is not available');
                }
              }}
            >
              <Download className="h-4 w-4" />
              Download
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
