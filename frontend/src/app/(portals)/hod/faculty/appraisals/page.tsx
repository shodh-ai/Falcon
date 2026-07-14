'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type Criterion = {
  key: string;
  label: string;
  weight: number;
  description: string;
};

type Row = {
  appraisal_record_id: string;
  appraisal_year: number;
  auto_api_score: number | null;
  api_breakdown: Record<string, number> | null;
  hod_rating: number | null;
  hod_evaluation_breakdown: Record<string, number> | null;
  hod_evaluation_notes: string | null;
  hr_final_status: string;
  user_id: string;
  name: string;
  email: string | null;
};

type AppraisalResponse = {
  appraisal_year: number;
  criteria: Criterion[];
  items: Row[];
};

type DraftScores = Record<string, Record<string, string>>;
type DraftNotes = Record<string, string>;

const CRITERION_KEYS = ['research', 'academics', 'extension', 'administration'] as const;

function computeWeightedOverall(scores: Record<string, number>, criteria: Criterion[]): number | null {
  let total = 0;
  let weightSum = 0;
  for (const c of criteria) {
    const val = scores[c.key];
    if (val === undefined || Number.isNaN(val)) continue;
    total += val * c.weight;
    weightSum += c.weight;
  }
  if (weightSum <= 0) return null;
  return Number((total / weightSum).toFixed(2));
}

function statusLabel(status: string) {
  if (status === 'HOD_REVIEW' || status === 'PENDING') return 'Pending review';
  if (status === 'HR_APPROVED') return 'Submitted';
  return status.replace(/_/g, ' ');
}

export default function HodAppraisalsPage() {
  const api = useAuthedApi();
  const [criteria, setCriteria] = useState<Criterion[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [appraisalYear, setAppraisalYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [draftScores, setDraftScores] = useState<DraftScores>({});
  const [draftNotes, setDraftNotes] = useState<DraftNotes>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<AppraisalResponse>('/api/academics/hod/appraisals');
      setCriteria(data.criteria ?? []);
      setRows(data.items ?? []);
      setAppraisalYear(data.appraisal_year ?? new Date().getFullYear());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load appraisals');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [api]);

  const pendingCount = useMemo(
    () => rows.filter((r) => r.hr_final_status === 'HOD_REVIEW' || r.hr_final_status === 'PENDING').length,
    [rows],
  );

  function getDraftScore(row: Row, key: string): string {
    const draft = draftScores[row.appraisal_record_id]?.[key];
    if (draft !== undefined) return draft;
    const saved = row.hod_evaluation_breakdown?.[key];
    return saved !== undefined && saved !== null ? String(saved) : '';
  }

  function getDraftNotes(row: Row): string {
    if (draftNotes[row.appraisal_record_id] !== undefined) {
      return draftNotes[row.appraisal_record_id];
    }
    return row.hod_evaluation_notes ?? '';
  }

  function getPreviewOverall(row: Row): number | null {
    const scores: Record<string, number> = {};
    for (const key of CRITERION_KEYS) {
      const raw = getDraftScore(row, key);
      if (!raw) continue;
      const val = Number(raw);
      if (!Number.isNaN(val)) scores[key] = val;
    }
    if (Object.keys(scores).length) {
      return computeWeightedOverall(scores, criteria);
    }
    return row.hod_rating;
  }

  async function submitEvaluation(row: Row) {
    const payload: Record<string, number | string> = {};
    for (const key of CRITERION_KEYS) {
      const raw = getDraftScore(row, key);
      if (!raw) continue;
      const val = Number(raw);
      if (Number.isNaN(val) || val < 0 || val > 5) {
        toast.error(`${key} score must be between 0 and 5`);
        return;
      }
      payload[key] = val;
    }

    const notes = getDraftNotes(row).trim();
    if (notes) payload.notes = notes;

    if (!Object.keys(payload).length || Object.keys(payload).every((k) => k === 'notes')) {
      toast.error('Enter at least one criterion score before submitting');
      return;
    }

    setSavingId(row.appraisal_record_id);
    try {
      await api.patch(`/api/academics/hod/appraisals/${row.appraisal_record_id}/rating`, payload);
      toast.success(`Evaluation submitted for ${row.name}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to submit evaluation');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <HodPageFrame>
      <HodPageHeader
        title="Appraisals & API Scores"
        description="Assign multi-criteria scores for faculty — research, academics, extension, and administration duties."
        meta={
          <span>
            {appraisalYear} cycle · {pendingCount} pending · {rows.length} faculty
          </span>
        }
      />

      {!loading && criteria.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {criteria.map((c) => (
            <div
              key={c.key}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <p className="font-semibold text-sgvu-navy">
                {c.label}{' '}
                <span className="font-normal text-muted-foreground">({Math.round(c.weight * 100)}%)</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{c.description}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sgvu-navy" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 py-12 text-center text-sm text-muted-foreground">
          No faculty appraisals found for your department this year.
        </p>
      ) : (
        <div className="space-y-6">
          {rows.map((row) => {
            const isPending = row.hr_final_status === 'HOD_REVIEW' || row.hr_final_status === 'PENDING';
            const previewOverall = getPreviewOverall(row);
            const apiBreakdown = row.api_breakdown ?? {};

            return (
              <Card key={row.appraisal_record_id} className="border-slate-200">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base text-sgvu-navy">{row.name}</CardTitle>
                      <p className="text-sm text-muted-foreground">{row.email}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="rounded-md border border-gray-200 bg-slate-50 px-2 py-1 text-xs font-medium">
                        {statusLabel(row.hr_final_status)}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        Auto API: <strong className="text-sgvu-navy">{row.auto_api_score ?? '—'}</strong>
                      </span>
                      {previewOverall !== null && (
                        <span className="tabular-nums text-muted-foreground">
                          Overall: <strong className="text-sgvu-navy">{previewOverall}</strong> / 5
                        </span>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.keys(apiBreakdown).length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="text-muted-foreground">Research API breakdown:</span>
                      {Object.entries(apiBreakdown).map(([k, v]) => (
                        <span key={k} className="rounded bg-blue-50 px-2 py-0.5 text-blue-800">
                          {k.replace(/_/g, ' ')}: {v}
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    {criteria.map((c) => (
                      <label key={c.key} className="block space-y-1.5 text-sm">
                        <span className="font-medium text-sgvu-navy">{c.label}</span>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.1}
                          disabled={!isPending}
                          className={cn(
                            'w-full rounded-md border border-gray-200 px-3 py-2 text-sm',
                            !isPending && 'bg-slate-50 text-muted-foreground',
                          )}
                          placeholder="0–5"
                          value={getDraftScore(row, c.key)}
                          onChange={(e) =>
                            setDraftScores((prev) => ({
                              ...prev,
                              [row.appraisal_record_id]: {
                                ...(prev[row.appraisal_record_id] ?? {}),
                                [c.key]: e.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                    ))}
                  </div>

                  <label className="block space-y-1.5 text-sm">
                    <span className="font-medium text-sgvu-navy">Evaluation notes</span>
                    <textarea
                      rows={2}
                      disabled={!isPending}
                      className={cn(
                        'w-full rounded-md border border-gray-200 px-3 py-2 text-sm',
                        !isPending && 'bg-slate-50 text-muted-foreground',
                      )}
                      placeholder="Optional remarks on teaching load, lab coordination, research output…"
                      value={getDraftNotes(row)}
                      onChange={(e) =>
                        setDraftNotes((prev) => ({
                          ...prev,
                          [row.appraisal_record_id]: e.target.value,
                        }))
                      }
                    />
                  </label>

                  {isPending && (
                    <div className="flex justify-end">
                      <Button
                        size="default"
                        className="h-9 bg-sgvu-gold text-sm font-semibold text-sgvu-navy hover:bg-sgvu-gold/90"
                        disabled={savingId === row.appraisal_record_id}
                        onClick={() => void submitEvaluation(row)}
                      >
                        {savingId === row.appraisal_record_id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          'Submit evaluation'
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </HodPageFrame>
  );
}
