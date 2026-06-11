'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ClinicAdminPage() {
  const api = useAuthedApi();
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [form, setForm] = useState({
    patient_user_id: 'b0000001-0000-4000-8000-000000000001',
    doctor_name: 'Dr. Mehta',
    diagnosis: 'Viral fever — advised rest',
    rest_advised_days: 3,
  });

  useEffect(() => {
    void api.get<Record<string, unknown>[]>('/api/clinic/records').then(setRecords).catch(() => setRecords([]));
  }, [api]);

  const logVisit = async () => {
    try {
      await api.post('/api/clinic/visits', form);
      toast.success('Visit logged — medical leave loop triggered');
      const next = await api.get<Record<string, unknown>[]>('/api/clinic/records');
      setRecords(next);
    } catch {
      toast.error('Failed to log visit');
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-sgvu-navy">Campus Infirmary</h1>
      <p className="text-sm text-muted-foreground">
        Scan student ID, log symptoms, trigger automatic ML attendance + warden/proctor alerts.
      </p>

      <div className="mt-6 grid max-w-lg gap-3 rounded-xl border p-4">
        <Input placeholder="Patient user ID" value={form.patient_user_id} onChange={(e) => setForm((f) => ({ ...f, patient_user_id: e.target.value }))} />
        <Input placeholder="Doctor" value={form.doctor_name} onChange={(e) => setForm((f) => ({ ...f, doctor_name: e.target.value }))} />
        <Input placeholder="Diagnosis" value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))} />
        <Input type="number" placeholder="Rest days" value={form.rest_advised_days} onChange={(e) => setForm((f) => ({ ...f, rest_advised_days: Number(e.target.value) }))} />
        <Button onClick={() => void logVisit()}>Log Visit & Trigger Sick Leave</Button>
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="p-2">Patient</th>
            <th className="p-2">Doctor</th>
            <th className="p-2">Diagnosis</th>
            <th className="p-2">Rest Days</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={String(r.visit_id)} className="border-b">
              <td className="p-2">{String(r.patient_name ?? '—')}</td>
              <td className="p-2">{String(r.doctor_name ?? '—')}</td>
              <td className="p-2">{String(r.diagnosis ?? '—')}</td>
              <td className="p-2">{String(r.rest_advised_days ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
