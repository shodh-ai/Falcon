'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Activity, Loader2, Medal, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { StudentPageHeader } from '@/components/student/StudentPageHeader';
import { StudentPageShell } from '@/components/student/StudentPageShell';
import { StudentSectionCard } from '@/components/student/StudentSectionCard';
import { StudentStatCard } from '@/components/student/StudentStatCard';
import { StudentEmptyState } from '@/components/student/StudentEmptyState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';

type ExtraData = {
  records: {
    activity_type: string;
    details: string;
    credits_awarded: number;
    event_date: string;
    verification_status?: string;
  }[];
  totals: { activity_type: string; credits: number }[];
};

export default function StudentExtracurricularsPage() {
  const api = useAuthedApi();
  const [data, setData] = useState<ExtraData | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    activity_type: 'NSS',
    description: '',
    event_date: '',
    file: null as File | null,
  });

  async function load() {
    const res = await api.get<ExtraData>('/api/student/extracurriculars');
    setData(res);
  }

  useEffect(() => {
    void load();
  }, [api]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form.description.trim() || !form.event_date || !form.file) {
      toast.error('Fill all fields and attach your certificate PDF');
      return;
    }
    setSubmitting(true);
    try {
      const body = new FormData();
      body.append('activity_type', form.activity_type);
      body.append('description', form.description.trim());
      body.append('event_date', form.event_date);
      body.append('file', form.file);
      await api.post('/api/student/extracurriculars', body);
      toast.success('Activity logged — pending Proctor/IQAC verification');
      setShowForm(false);
      setForm({ activity_type: 'NSS', description: '', event_date: '', file: null });
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to log activity');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <StudentPageShell width="5xl">
      <StudentPageHeader
        title="Extra-Curriculars (NCC / NSS / SODECA)"
        description="Centralized log of non-academic university credits — camps, ranks, and SODECA points."
        actions={
          <Button size="sm" className="bg-sgvu-navy" onClick={() => setShowForm(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Log Activity
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {(data?.totals ?? []).map((t) => (
          <StudentStatCard
            key={t.activity_type}
            label={t.activity_type}
            value={t.credits}
            helper="Credits logged"
            icon={Medal}
            tone="gold"
          />
        ))}
        {!data?.totals?.length && (
          <StudentStatCard label="Total credits" value={0} helper="No activities logged yet" icon={Medal} />
        )}
      </div>

      <StudentSectionCard title="Activity log" description="Chronological record of extracurricular participation" icon={Activity}>
        {(data?.records ?? []).length === 0 ? (
          <StudentEmptyState
            icon={Activity}
            title="No activities yet"
            description="Log NSS camps, NCC activities, and SODECA events with your certificate."
            action={
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                Log your first activity
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {(data?.records ?? []).map((r, i) => (
              <div key={i} className="rounded-2xl border border-border/70 bg-white p-4 text-sm transition hover:border-sgvu-gold/40">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge>{r.activity_type}</Badge>
                    {r.verification_status && r.verification_status !== 'VERIFIED' && (
                      <Badge variant="outline">{r.verification_status.replace('_', ' ')}</Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {r.event_date ? new Date(r.event_date).toLocaleDateString() : '—'}
                  </span>
                </div>
                <p className="mt-2 font-medium text-sgvu-navy">{r.details}</p>
                <p className="mt-1 text-xs font-semibold text-sgvu-gold">+{r.credits_awarded} credits</p>
              </div>
            ))}
          </div>
        )}
      </StudentSectionCard>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-base">Log extracurricular activity</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit} className="space-y-3">
                <select
                  className="w-full rounded-md border px-2 py-2 text-sm"
                  value={form.activity_type}
                  onChange={(e) => setForm((f) => ({ ...f, activity_type: e.target.value }))}
                >
                  {['NCC', 'NSS', 'SODECA', 'OTHER'].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <textarea
                  className="min-h-[80px] w-full rounded-md border px-3 py-2 text-sm"
                  placeholder="Description"
                  required
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <Input
                  type="date"
                  required
                  value={form.event_date}
                  onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                />
                <div>
                  <label className="text-xs text-muted-foreground">Certificate (PDF / image)</label>
                  <Input
                    type="file"
                    accept=".pdf,image/jpeg,image/png"
                    required
                    onChange={(e) =>
                      setForm((f) => ({ ...f, file: e.target.files?.[0] ?? null }))
                    }
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Submit'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)} disabled={submitting}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </StudentPageShell>
  );
}
