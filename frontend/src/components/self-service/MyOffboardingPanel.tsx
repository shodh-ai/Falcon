'use client';

import { FormEvent, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { workforceMinDate } from '@/lib/workforce-dates';

export function MyOffboardingPanel() {
  const api = useAuthedApi();
  const [form, setForm] = useState({ resignation_date: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/hr/ess/resignation', form);
      toast.success('Resignation submitted to HR');
      setForm({ resignation_date: '', reason: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid max-w-md gap-3">
      <Input
        type="date"
        min={workforceMinDate()}
        value={form.resignation_date}
        onChange={(e) => setForm((f) => ({ ...f, resignation_date: e.target.value }))}
        required
      />
      <textarea
        className="min-h-[100px] rounded-md border px-3 py-2 text-sm"
        placeholder="Reason for separation"
        value={form.reason}
        onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
        required
      />
      <Button type="submit" disabled={submitting}>
        Submit resignation
      </Button>
    </form>
  );
}
