'use client';

import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  PHD_APPLICATION_TYPES,
  phdStatusLabel,
  type PhdCandidate,
} from '@/lib/phd-lifecycle';
import { PhdPipeline } from './PhdPipeline';
import { PhdReviewQueue } from './PhdReviewQueue';

export function PhdApplicationPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<PhdCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ application_type: 'PET', proposed_topic: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<PhdCandidate[]>('/api/phd-lifecycle/applications/mine');
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasActive = rows.some(
    (r) =>
      !['DEGREE_AWARDED', 'APPLICATION_SCRUTINY_REJECTED', 'PET_FAILED', 'DRC_REJECTED', 'REGISTRATION_CANCELLED'].includes(
        r.lifecycle_status,
      ),
  );

  async function submit() {
    if (!form.proposed_topic.trim()) {
      toast.error('Proposed research topic is required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/api/phd-lifecycle/applications', form);
      toast.success('Ph.D. application submitted');
      setOpen(false);
      setForm({ application_type: 'PET', proposed_topic: '' });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-sgvu-gold/30 bg-sgvu-gold/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-sgvu-navy">
            <GraduationCap className="h-5 w-5 text-sgvu-gold" />
            Ph.D. Application
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Apply for PET or PET exemption. After scrutiny, interview, and admission you enter the full research lifecycle.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button variant="outline" disabled={hasActive} onClick={() => setOpen((v) => !v)}>
            {open && !hasActive ? 'Cancel' : 'Apply for Ph.D.'}
          </Button>
          {hasActive ? (
            <p className="text-sm text-muted-foreground">You already have an active Ph.D. application or candidature.</p>
          ) : null}
        </CardContent>
      </Card>

      {open && !hasActive ? (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <select
              className="w-full rounded-lg border px-3 py-2 text-sm"
              value={form.application_type}
              onChange={(e) => setForm({ ...form, application_type: e.target.value })}
            >
              {PHD_APPLICATION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <textarea
              className="w-full rounded-lg border px-3 py-2 text-sm"
              rows={4}
              placeholder="Proposed research topic"
              value={form.proposed_topic}
              onChange={(e) => setForm({ ...form, proposed_topic: e.target.value })}
            />
            <Button onClick={() => void submit()} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length > 0 ? (
        <div className="space-y-4">
          {rows.map((row) => (
            <Card key={row.candidate_id}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{row.proposed_topic}</CardTitle>
                  <Badge>{phdStatusLabel(row.lifecycle_status)}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <PhdPipeline candidate={row} />
                <PhdReviewQueue
                  embedded
                  role="Student"
                  listPath=""
                  initialRows={[row]}
                  onRefresh={load}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : null}
    </div>
  );
}
