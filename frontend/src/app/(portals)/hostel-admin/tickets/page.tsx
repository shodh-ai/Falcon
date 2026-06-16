'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DataTable } from '@/components/ui/DataTable';
import { useAuthedApi } from '@/lib/api';
import { HostelScopeBar } from '@/components/hostel/HostelScopeBar';
import { toast } from '@/lib/notifications/falcon-toast';



type Fine = {
  fine_id: string;
  student_name: string;
  item_description: string;
  damage_severity: string;
  amount: string;
  status: string;
};

export default function HostelTicketsFinesPage() {
  const api = useAuthedApi();
  const [hostelId, setHostelId] = useState('');

  const [fines, setFines] = useState<Fine[]>([]);
  const [fineForm, setFineForm] = useState({
    student_user_id: '',
    item_description: '',
    amount: '',
    damage_severity: 'MEDIUM',
  });

  useEffect(() => {

    const q = hostelId ? `?hostelId=${hostelId}` : '';
    void api.get<Fine[]>(`/api/hostel-admin/fines${q}`).then(setFines);
  }, [api, hostelId]);

  async function addFine() {
    if (!hostelId || !fineForm.student_user_id || !fineForm.item_description || !fineForm.amount) {
      toast.error('Fill all fine fields and select hostel');
      return;
    }
    try {
      await api.post('/api/hostel-admin/fines', {
        ...fineForm,
        hostel_id: hostelId,
        amount: Number(fineForm.amount),
      });
      toast.success('Fine created — fee demand sent to Finance');
      setFineForm({ student_user_id: '', item_description: '', amount: '', damage_severity: 'MEDIUM' });
      const updated = await api.get<Fine[]>(`/api/hostel-admin/fines?hostelId=${hostelId}`);
      setFines(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold text-sgvu-navy">Fines &amp; Damages</h1>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Fines &amp; Damages</h2>
          <HostelScopeBar value={hostelId} onChange={setHostelId} allowAll={false} />
        </div>

        <div className="grid gap-2 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Input
            placeholder="Student user UUID"
            value={fineForm.student_user_id}
            onChange={(e) => setFineForm((f) => ({ ...f, student_user_id: e.target.value }))}
          />
          <Input
            placeholder="Item (e.g. Ceiling Fan)"
            value={fineForm.item_description}
            onChange={(e) => setFineForm((f) => ({ ...f, item_description: e.target.value }))}
          />
          <select
            className="rounded-lg border px-3 py-2 text-sm"
            value={fineForm.damage_severity}
            onChange={(e) => setFineForm((f) => ({ ...f, damage_severity: e.target.value }))}
          >
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <Input
            placeholder="Amount ₹"
            type="number"
            value={fineForm.amount}
            onChange={(e) => setFineForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Button className="bg-sgvu-navy" onClick={() => void addFine()}>
            + Add Fine
          </Button>
        </div>

        <DataTable
          columns={[
            { key: 'student', header: 'Student', render: (r) => r.student_name },
            { key: 'item', header: 'Item', render: (r) => r.item_description },
            { key: 'sev', header: 'Severity', render: (r) => r.damage_severity },
            { key: 'amt', header: 'Amount', render: (r) => `₹${r.amount}` },
            { key: 'st', header: 'Status', render: (r) => <Badge>{r.status}</Badge> },
          ]}
          rows={fines}
          rowKey={(r) => r.fine_id}
        />
      </section>
    </div>
  );
}
