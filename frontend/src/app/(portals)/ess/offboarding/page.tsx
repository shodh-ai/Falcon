'use client';

import { FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useHrApi } from '@/lib/api/use-hr-api';

export default function EssOffboardingPage() {
  const api = useHrApi();
  const [form, setForm] = useState({ last_working_day: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/api/hr/ess/resignation', form);
      toast.success('Resignation submitted to your reporting manager');
      setForm({ last_working_day: '', reason: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 p-4 md:p-6">
      <section>
        <h2 className="text-2xl font-bold text-sgvu-navy">Apply for Resignation</h2>
        <p className="text-sm text-muted-foreground">
          Your request goes to your HOD for clearance, then HR for final exit processing.
        </p>
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resignation form</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-3">
            <label className="block text-sm">
              Last working day
              <Input
                type="date"
                className="mt-1"
                value={form.last_working_day}
                onChange={(e) => setForm((f) => ({ ...f, last_working_day: e.target.value }))}
                required
              />
            </label>
            <label className="block text-sm">
              Reason
              <textarea
                className="mt-1 w-full rounded-md border px-2 py-2 text-sm"
                rows={4}
                value={form.reason}
                onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                required
              />
            </label>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit resignation'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
