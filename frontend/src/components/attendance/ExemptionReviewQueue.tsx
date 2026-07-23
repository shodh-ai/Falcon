'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  exemptionStatusLabel,
  proofDocHref,
  reasonLabel,
  type AttendanceExemption,
} from '@/lib/attendance-policy';

function statusVariant(status: AttendanceExemption['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  if (status === 'RECOMMENDED') return 'warning' as const;
  return 'secondary' as const;
}

const BTN =
  'h-10 border border-[#0B2447] bg-[#0B2447] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#123A6D] hover:text-white active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy disabled:opacity-60';

export function ExemptionReviewQueue({
  title,
  description,
  listPath,
  decisionBasePath,
  mode,
}: {
  title?: string;
  description?: string;
  listPath: string;
  decisionBasePath: string;
  mode: 'HOD' | 'VIEW';
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AttendanceExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<AttendanceExemption[]>(listPath);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, listPath]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(id: string, decision: 'APPROVE' | 'REJECT') {
    setBusyId(id);
    try {
      await api.post(`${decisionBasePath}/${id}/decision`, {
        decision,
        remarks: remarks[id]?.trim() || undefined,
      });
      toast.success(decision === 'APPROVE' ? 'Approved' : 'Rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full space-y-4">
      {title || description ? (
        <Card className="border-sgvu-navy/10 bg-white shadow-sm">
          <CardContent className="p-5 md:p-6">
            {title ? <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1> : null}
            {description ? (
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{description}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-sgvu-navy/10 bg-white shadow-sm">
        <CardContent className="space-y-4 p-5 md:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3 border-b border-sgvu-navy/10 pb-4">
            <div>
              <h2 className="text-lg font-bold text-sgvu-navy">
                {mode === 'HOD' ? 'Exemption requests' : 'Approved exemptions'}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {loading
                  ? 'Loading…'
                  : `${rows.length} record${rows.length === 1 ? '' : 's'}`}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className={BTN}
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-sgvu-navy" />
              Loading requests…
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sgvu-navy/20 px-6 py-12 text-center">
              <p className="text-sm font-semibold text-sgvu-navy">No exemption requests yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Approved records will appear here once HOD completes review.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const pct = Math.round(Number(row.attendance_percent_at_request));
                const actionable =
                  mode === 'HOD' && (row.status === 'PENDING_HOD' || row.status === 'RECOMMENDED');

                return (
                  <article
                    key={row.exemption_id}
                    className="rounded-xl border border-sgvu-navy/10 bg-white p-4 md:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-sgvu-navy">
                            {row.student_name ?? 'Student'}
                          </h3>
                          {row.dept_name ? (
                            <span className="rounded-md bg-sgvu-navy/[0.05] px-2 py-0.5 text-xs font-medium text-sgvu-navy/70">
                              {row.dept_name}
                            </span>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-2.5 py-1 text-[11px] font-semibold text-sgvu-navy">
                            {reasonLabel(row.reason_category)}
                          </span>
                          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700">
                            Attendance {pct}%
                          </span>
                          {row.semester ? (
                            <span className="rounded-full border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-2.5 py-1 text-[11px] font-semibold text-sgvu-navy">
                              Semester {row.semester}
                            </span>
                          ) : null}
                        </div>
                      </div>

                      <Badge variant={statusVariant(row.status)} className="shrink-0">
                        {exemptionStatusLabel(row.status)}
                      </Badge>
                    </div>

                    {row.description ? (
                      <p className="mt-4 text-sm leading-relaxed text-sgvu-navy/80">
                        {row.description}
                      </p>
                    ) : null}

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      {row.supporting_doc_url ? (
                        <a
                          href={proofDocHref(row.supporting_doc_url)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs font-semibold text-[#0B2447] underline underline-offset-2 hover:text-sgvu-gold"
                        >
                          View supporting proof
                        </a>
                      ) : (
                        <span className="text-xs font-medium text-destructive">No proof attached</span>
                      )}
                    </div>

                    {row.hod_remarks ? (
                      <div className="mt-4 rounded-lg border border-sgvu-navy/10 bg-sgvu-navy/[0.03] px-3 py-2.5">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-sgvu-navy/50">
                          HOD note
                        </p>
                        <p className="mt-1 text-sm text-sgvu-navy/80">{row.hod_remarks}</p>
                      </div>
                    ) : null}

                    {mode === 'HOD' && actionable ? (
                      <div className="mt-4 space-y-3 border-t border-sgvu-navy/10 pt-4">
                        <textarea
                          className="w-full rounded-lg border border-sgvu-navy/20 bg-white px-3 py-2 text-sm focus:border-sgvu-gold focus:outline-none focus:ring-2 focus:ring-sgvu-gold/25"
                          rows={2}
                          placeholder="Remarks (optional)"
                          value={remarks[row.exemption_id] ?? ''}
                          onChange={(e) =>
                            setRemarks((m) => ({ ...m, [row.exemption_id]: e.target.value }))
                          }
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            className={BTN}
                            disabled={busyId === row.exemption_id}
                            onClick={() => void decide(row.exemption_id, 'APPROVE')}
                          >
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-10 border-red-600/30 px-5 text-sm font-semibold text-red-700 hover:bg-red-50 active:border-sgvu-gold active:bg-sgvu-gold active:text-sgvu-navy"
                            disabled={busyId === row.exemption_id}
                            onClick={() => void decide(row.exemption_id, 'REJECT')}
                          >
                            Reject
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
