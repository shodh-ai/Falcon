'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';

type Defaulter = {
  transaction_id: string;
  name: string;
  official_email: string;
  title: string;
  accession_number: string;
  days_overdue: number;
  fine_amount: string;
  fine_pushed_to_finance: boolean;
};

export default function LibraryFinesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<Defaulter[]>([]);

  const load = () => void api.get<Defaulter[]>('/api/library-admin/defaulters').then(setRows);

  useEffect(() => {
    load();
  }, [api]);

  async function pushFine(transactionId: string) {
    try {
      const res = await api.post<{ message: string }>('/api/library-admin/fines/push', { transaction_id: transactionId });
      toast.success(res.message);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Push failed');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Defaulters & Fines</h1>
      <p className="text-sm text-muted-foreground">
        Push fines to Finance — students pay via Razorpay on the portal; admit card lock applies until cleared.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overdue loans</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2">Patron</th>
                <th>Book</th>
                <th>Days</th>
                <th>Fine</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.transaction_id} className="border-b">
                  <td className="py-3">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.official_email}</p>
                  </td>
                  <td>
                    {r.title}
                    <br />
                    <span className="text-xs">{r.accession_number}</span>
                  </td>
                  <td>{r.days_overdue}</td>
                  <td>₹{Number(r.fine_amount).toFixed(0)}</td>
                  <td>
                    <Button
                      size="sm"
                      disabled={r.fine_pushed_to_finance || Number(r.fine_amount) <= 0}
                      onClick={() => void pushFine(r.transaction_id)}
                    >
                      {r.fine_pushed_to_finance ? 'Pushed' : 'Push to account'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="py-6 text-center text-muted-foreground">No overdue loans.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
