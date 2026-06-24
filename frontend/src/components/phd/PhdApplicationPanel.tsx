'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, GraduationCap, Loader2, XCircle } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  PHD_APPLICATION_TYPES,
  phdStatusLabel,
  type PhdCandidate,
  type PhdEligibility,
} from '@/lib/phd-lifecycle';
import { PhdPipeline } from './PhdPipeline';
import { PhdReviewQueue } from './PhdReviewQueue';

const ENTRANCE_EXAM_OPTIONS = [
  { value: 'PET', label: 'PET (institute entrance test)' },
  { value: 'GATE', label: 'GATE' },
  { value: 'NET', label: 'UGC/CSIR NET' },
];

export function PhdApplicationPanel() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<PhdCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [eligibility, setEligibility] = useState<PhdEligibility | null>(null);
  const [form, setForm] = useState({
    application_type: 'PET',
    proposed_topic: '',
    entrance_exam_type: 'PET',
    entrance_score: '',
    direct_phd_merit_approved: false,
  });

  const load = useCallback(async () => {
    try {
      const [data, elig] = await Promise.all([
        api.get<PhdCandidate[]>('/api/phd-lifecycle/applications/mine'),
        api
          .get<PhdEligibility>('/api/phd-lifecycle/applications/eligibility')
          .catch(() => null),
      ]);
      setRows(Array.isArray(data) ? data : []);
      setEligibility(elig);
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

  const isDirectRoute = eligibility?.route === 'BTECH_DIRECT';
  const eligibilityBlocks = eligibility ? !eligibility.can_apply : false;
  const applyDisabled = hasActive || eligibilityBlocks;

  async function submit() {
    if (!form.proposed_topic.trim()) {
      toast.error('Proposed research topic is required');
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        application_type: form.application_type,
        proposed_topic: form.proposed_topic,
      };
      if (isDirectRoute) {
        payload.entrance_exam_type = form.entrance_exam_type;
        payload.entrance_score = form.entrance_score ? Number(form.entrance_score) : undefined;
        payload.direct_phd_merit_approved = form.direct_phd_merit_approved;
      }
      await api.post('/api/phd-lifecycle/applications', payload);
      toast.success('Ph.D. application submitted');
      setOpen(false);
      setForm({
        application_type: 'PET',
        proposed_topic: '',
        entrance_exam_type: 'PET',
        entrance_score: '',
        direct_phd_merit_approved: false,
      });
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
        <CardContent className="space-y-3">
          {eligibility && !hasActive ? (
            <div className="space-y-2 rounded-lg border bg-white/60 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-sgvu-navy">Eligibility</span>
                <Badge variant={eligibility.can_apply ? 'default' : 'destructive'}>
                  {eligibility.can_apply ? eligibility.route_label : 'Not eligible yet'}
                </Badge>
                {eligibility.academic.program_label ? (
                  <span className="text-xs text-muted-foreground">
                    {eligibility.academic.program_label}
                  </span>
                ) : null}
              </div>
              <ul className="space-y-1">
                {eligibility.requirements.map((req) => (
                  <li key={req.label} className="flex items-center gap-2 text-sm">
                    {req.met ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <XCircle
                        className={`h-4 w-4 ${req.pending ? 'text-amber-500' : 'text-rose-500'}`}
                      />
                    )}
                    <span className={req.met ? 'text-foreground' : 'text-muted-foreground'}>
                      {req.label}
                      {req.pending ? ' (provide at submission)' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {eligibility.reasons.length > 0 ? (
                <p className="text-xs text-rose-600">{eligibility.reasons.join(' ')}</p>
              ) : null}
            </div>
          ) : null}
          <Button variant="outline" disabled={applyDisabled} onClick={() => setOpen((v) => !v)}>
            {open && !applyDisabled ? 'Cancel' : 'Apply for Ph.D.'}
          </Button>
          {hasActive ? (
            <p className="text-sm text-muted-foreground">You already have an active Ph.D. application or candidature.</p>
          ) : null}
        </CardContent>
      </Card>

      {open && !applyDisabled ? (
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
            {isDirectRoute ? (
              <div className="space-y-3 rounded-lg border border-sgvu-gold/30 bg-sgvu-gold/5 p-3">
                <p className="text-sm font-medium text-sgvu-navy">
                  B.Tech direct-PhD entrance evidence
                </p>
                <p className="text-xs text-muted-foreground">
                  Provide a qualifying entrance score, or confirm an approved direct-PhD merit.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <select
                    className="rounded-lg border px-3 py-2 text-sm"
                    value={form.entrance_exam_type}
                    onChange={(e) => setForm({ ...form, entrance_exam_type: e.target.value })}
                    disabled={form.direct_phd_merit_approved}
                  >
                    {ENTRANCE_EXAM_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="rounded-lg border px-3 py-2 text-sm"
                    placeholder="Score"
                    value={form.entrance_score}
                    onChange={(e) => setForm({ ...form, entrance_score: e.target.value })}
                    disabled={form.direct_phd_merit_approved}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.direct_phd_merit_approved}
                    onChange={(e) =>
                      setForm({ ...form, direct_phd_merit_approved: e.target.checked })
                    }
                  />
                  Approved direct-PhD merit (no entrance score required)
                </label>
              </div>
            ) : null}
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
