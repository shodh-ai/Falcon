'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { FinancePageHeader } from '@/components/finance/FinancePageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type ChequeTxn = {
  transaction_id: string;
  student_user_id: string | null;
  amount: number;
  cheque_number: string | null;
  bank_name: string | null;
  cheque_status: string | null;
  created_at: string;
};

export default function ChequeClearingPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<ChequeTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    student_user_id: '',
    demand_id: '',
    amount: '',
    cheque_number: '',
    bank_name: '',
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<ChequeTxn[]>('/finance/cheques/pending');
      setRows(data);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function logCheque(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post('/finance/cheques/log', {
        student_user_id: form.student_user_id,
        demand_id: form.demand_id || undefined,
        amount: Number(form.amount),
        cheque_number: form.cheque_number,
        bank_name: form.bank_name,
      });
      toast.success('Cheque logged — fee status PENDING_CLEARANCE');
      setForm({ student_user_id: '', demand_id: '', amount: '', cheque_number: '', bank_name: '' });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log cheque');
    }
  }

  async function clearCheque(id: string) {
    try {
      await api.patch(`/finance/cheques/${id}/clear`, {});
      toast.success('Cheque cleared');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    }
  }

  async function returnCheque(id: string) {
    const reason = prompt('Cheque bounce reason:');
    if (!reason?.trim()) return;
    try {
      const result = await api.patch<{ penalty_demand?: { total_amount: number } }>(
        `/finance/cheques/${id}/return`,
        { bounce_reason: reason },
      );
      toast.warning(
        `Cheque returned. ₹${result.penalty_demand?.total_amount ?? 500} bounce penalty applied. Admit card locked.`,
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Return failed');
    }
  }

  return (
    <div className="space-y-6 p-6">
      <FinancePageHeader title="Cheque Clearing" description="Deposit cheques, track clearance, and handle bounces" />

      <form onSubmit={logCheque} className="grid gap-3 rounded-xl border p-4 md:grid-cols-3">
        <Input placeholder="Student user ID" value={form.student_user_id} onChange={(e) => setForm((f) => ({ ...f, student_user_id: e.target.value }))} required />
        <Input placeholder="Demand ID (optional)" value={form.demand_id} onChange={(e) => setForm((f) => ({ ...f, demand_id: e.target.value }))} />
        <Input placeholder="Amount" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} required />
        <Input placeholder="Cheque number" value={form.cheque_number} onChange={(e) => setForm((f) => ({ ...f, cheque_number: e.target.value }))} required />
        <Input placeholder="Bank name" value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} required />
        <Button type="submit">Log cheque deposit</Button>
      </form>

      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">Cheque</th>
              <th className="p-3">Bank</th>
              <th className="p-3">Amount</th>
              <th className="p-3">Status</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="p-4 text-muted-foreground" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="p-4 text-muted-foreground" colSpan={5}>No pending cheques</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.transaction_id} className="border-t">
                  <td className="p-3 font-mono text-xs">{r.cheque_number}</td>
                  <td className="p-3">{r.bank_name}</td>
                  <td className="p-3 tabular-nums">₹{Number(r.amount).toLocaleString('en-IN')}</td>
                  <td className="p-3"><Badge variant="secondary">{r.cheque_status}</Badge></td>
                  <td className="p-3 flex gap-2">
                    <Button size="sm" onClick={() => void clearCheque(r.transaction_id)}>Clear</Button>
                    <Button size="sm" variant="destructive" onClick={() => void returnCheque(r.transaction_id)}>Cheque Returned</Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
