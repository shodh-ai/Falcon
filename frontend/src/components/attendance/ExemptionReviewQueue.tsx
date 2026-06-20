'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  exemptionStatusLabel,
  reasonLabel,
  type AttendanceExemption,
} from '@/lib/attendance-policy';

function statusVariant(status: AttendanceExemption['status']) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'REJECTED') return 'destructive' as const;
  if (status === 'RECOMMENDED') return 'warning' as const;
  return 'secondary' as const;
}

export function ExemptionReviewQueue({
  title,
  description,
  listPath,
  decisionBasePath,
  mode,
}: {
  title: string;
  description: string;
  listPath: string;
  decisionBasePath: string;
  mode: 'HOD' | 'FINAL';
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<AttendanceExemption[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});

  const actionableStatus = mode === 'HOD' ? 'PENDING_HOD' : 'RECOMMENDED';
  const approveLabel = mode === 'HOD' ? 'Recommend' : 'Approve';

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
      toast.success(decision === 'APPROVE' ? `${approveLabel}d` : 'Rejected');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold text-sgvu-navy">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            No exemption requests yet.
          </CardContent>
        </Card>
      ) : (
        rows.map((row) => {
          const pct = Math.round(Number(row.attendance_percent_at_request));
          const actionable = row.status === actionableStatus;
          return (
            <Card key={row.exemption_id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">
                    {row.student_name ?? 'Student'}{' '}
                    <span className="text-sm font-normal text-muted-foreground">
                      {row.dept_name ? `· ${row.dept_name}` : ''}
                    </span>
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {reasonLabel(row.reason_category)} · Attendance at request{' '}
                    <span className="font-semibold text-destructive">{pct}%</span>
                    {row.semester ? ` · Sem ${row.semester}` : ''}
                  </p>
                </div>
                <Badge variant={statusVariant(row.status)}>
                  {exemptionStatusLabel(row.status)}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{row.description}</p>
                {row.supporting_doc_url ? (
                  <a
                    href={row.supporting_doc_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-primary underline"
                  >
                    View supporting document
                  </a>
                ) : null}
                {row.hod_remarks ? (
                  <p className="text-xs text-muted-foreground">HOD note: {row.hod_remarks}</p>
                ) : null}
                {row.final_remarks ? (
                  <p className="text-xs text-muted-foreground">
                    Final note: {row.final_remarks}
                  </p>
                ) : null}

                {actionable ? (
                  <div className="space-y-2 border-t pt-3">
                    <textarea
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Remarks (optional)"
                      value={remarks[row.exemption_id] ?? ''}
                      onChange={(e) =>
                        setRemarks((m) => ({ ...m, [row.exemption_id]: e.target.value }))
                      }
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={busyId === row.exemption_id}
                        onClick={() => void decide(row.exemption_id, 'APPROVE')}
                      >
                        <Check className="h-4 w-4" /> {approveLabel}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.exemption_id}
                        onClick={() => void decide(row.exemption_id, 'REJECT')}
                      >
                        <X className="h-4 w-4" /> Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
