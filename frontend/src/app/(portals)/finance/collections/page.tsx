'use client';

import { useEffect, useState, useRef } from 'react';
import { FinancePageHeader, formatInr } from '@/components/finance/FinancePageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';

type Row = {
  transaction_id: string;
  gateway_payment_id: string | null;
  gateway_order_id: string | null;
  enrollment_no: string | null;
  student_name: string | null;
  amount: string;
  status: string;
  payment_mode: string | null;
  receipt_url: string | null;
  created_at: string;
};

export default function FinanceCollectionsPage() {
  const api = useAuthedApi();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingTransactionId, setUploadingTransactionId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      void api.get<Row[]>(`/finance/collections?q=${encodeURIComponent(q)}`).then(setRows).catch(() => setRows([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [api, q]);

  function handleUploadReceipt(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !uploadingTransactionId) return;

    const formData = new FormData();
    formData.append('file', file);

    api.post<{ path: string }>('/api/uploads/single', formData)
      .then((res) => {
        return api.patch(`/finance/transactions/${uploadingTransactionId}/receipt`, {
          receipt_url: res.path,
        });
      })
      .then(() => {
        toast.success('Receipt uploaded successfully');
        return api.get<Row[]>(`/finance/collections?q=${encodeURIComponent(q)}`).then(setRows);
      })
      .catch(() => toast.error('Failed to upload receipt'))
      .finally(() => {
        setUploadingTransactionId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <FinancePageHeader
        title="Fee Collections & Receipts"
        description="Payment gateway hub — search by Razorpay ID or enrollment number to resolve disputes."
      />
      <Input placeholder="Search transaction / enrollment / name" value={q} onChange={(e) => setQ(e.target.value)} />
      <input type="file" accept="application/pdf,image/*" className="hidden" ref={fileInputRef} onChange={handleUploadReceipt} />
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <th className="p-3">Student</th>
                <th className="p-3">Gateway ID</th>
                <th className="p-3">Amount</th>
                <th className="p-3">Mode</th>
                <th className="p-3">Status</th>
                <th className="p-3">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.transaction_id} className="border-b">
                  <td className="p-3">
                    <div>{r.student_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.enrollment_no ?? '—'}</div>
                  </td>
                  <td className="p-3 font-mono text-xs">{r.gateway_payment_id ?? r.gateway_order_id ?? '—'}</td>
                  <td className="p-3">{formatInr(r.amount)}</td>
                  <td className="p-3">{r.payment_mode ?? '—'}</td>
                  <td className="p-3">{r.status}</td>
                  <td className="p-3">
                    {r.receipt_url ? (
                      <a className="text-sgvu-navy underline" href={`/api/uploads/download?path=${encodeURIComponent(r.receipt_url)}`} target="_blank" rel="noreferrer">
                        PDF
                      </a>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => {
                        setUploadingTransactionId(r.transaction_id);
                        fileInputRef.current?.click();
                      }}>
                        Upload
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length && <p className="p-4 text-muted-foreground">No transactions found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
