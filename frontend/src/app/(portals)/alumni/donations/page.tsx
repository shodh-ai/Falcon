'use client';

import { Select } from '@/components/ui/select';
import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { AlumniPageHeader } from '@/components/alumni/AlumniPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type Fund = { code: string; label: string };
type Donation = { donation_id: string; amount: string; purpose: string; payment_status: string; tax_receipt_number: string | null };

export default function AlumniDonationsPage() {
  const api = useAuthedApi();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [mine, setMine] = useState<Donation[]>([]);
  const [amount, setAmount] = useState('5000');
  const [fund, setFund] = useState('ENDOWMENT');

  const load = () => {
    void api.get<Fund[]>('/api/alumni/donations/funds').then(setFunds);
    void api.get<Donation[]>('/api/alumni/donations/mine').then(setMine);
  };

  useEffect(() => {
    load();
  }, [api]);

  async function donate() {
    try {
      const order = await api.post<{ donation_id: string }>('/api/alumni/donations/initiate', {
        amount: Number(amount),
        fund_code: fund,
      });
      await api.post(`/api/alumni/donations/${order.donation_id}/confirm-mock`, {});
      const receipt = await api.get<{ receipt_number: string }>(`/api/alumni/donations/${order.donation_id}/receipt`);
      toast.success(`Donation recorded. Receipt: ${receipt.receipt_number}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Donation failed');
    }
  }

  async function downloadReceipt(id: string) {
    try {
      const receipt = await api.get<Record<string, unknown>>(`/api/alumni/donations/${id}/receipt`);
      const blob = new Blob([JSON.stringify(receipt, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `80g-receipt-${id}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Receipt unavailable');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <AlumniPageHeader
        title="Giving Back"
        description="Support SGVU through the Endowment ledger (Razorpay / Finance gateway). Download 80G tax exemption receipts after payment."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Make a donation</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Select className="rounded-md border px-3 py-2 text-sm" value={fund} onChange={(e) => setFund(e.target.value)}>
            {funds.map((f) => (
              <option key={f.code} value={f.code}>
                {f.label}
              </option>
            ))}
          </Select>
          <Input type="number" className="max-w-[140px]" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Button onClick={() => void donate()}>Pay via Gateway (demo)</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your contributions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {mine.map((d) => (
            <div key={d.donation_id} className="flex flex-wrap items-center justify-between gap-2 border-b py-2">
              <span>
                ₹{d.amount} · {d.purpose} · {d.payment_status}
              </span>
              {d.payment_status === 'SUCCESS' && (
                <Button size="sm" variant="outline" onClick={() => void downloadReceipt(d.donation_id)}>
                  Download 80G receipt
                </Button>
              )}
            </div>
          ))}
          {!mine.length && <p className="text-muted-foreground">No donations yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
