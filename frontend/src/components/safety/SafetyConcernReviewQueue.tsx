'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Check, Loader2, Shield } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuthedApi } from '@/lib/api';
import {
  accusedTypeLabel,
  concernStatusLabel,
  concernTypeLabel,
  proofDocHref,
  type SafetyConcern,
  type SafetyConcernStatus,
} from '@/lib/student-safety';

function statusVariant(status: SafetyConcernStatus) {
  if (status === 'RESOLVED' || status === 'CLOSED') return 'success' as const;
  if (status === 'ESCALATED') return 'destructive' as const;
  if (status === 'UNDER_REVIEW') return 'warning' as const;
  return 'secondary' as const;
}

export function SafetyConcernReviewQueue({
  title,
  description,
  listPath,
}: {
  title: string;
  description: string;
  listPath: string;
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<SafetyConcern[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [resolution, setResolution] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<SafetyConcern[]>(listPath);
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

  async function act(
    id: string,
    status: SafetyConcernStatus,
    success: string,
  ) {
    setBusyId(id);
    try {
      await api.patch(`/api/student-safety/concerns/${id}`, {
        status,
        remarks: remarks[id]?.trim() || undefined,
        resolution_summary: resolution[id]?.trim() || undefined,
      });
      toast.success(success);
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
          <Loader2 className="h-4 w-4 animate-spin" /> Loading concerns…
        </p>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">No concerns in your queue.</CardContent>
        </Card>
      ) : (
        rows.map((row) => {
          const evidence = Array.isArray(row.evidence_urls) ? row.evidence_urls : [];
          const actionable = ['SUBMITTED', 'UNDER_REVIEW', 'ESCALATED'].includes(row.status);
          return (
            <Card key={row.concern_id}>
              <CardHeader className="flex flex-row items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Shield className="h-4 w-4 text-sgvu-gold" />
                    {concernTypeLabel(row.concern_type)}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Against {accusedTypeLabel(row.accused_type)}
                    {row.accused_name ? ` · ${row.accused_name}` : ''}
                    {row.reporter_dept_name ? ` · Reporter dept: ${row.reporter_dept_name}` : ''}
                  </p>
                </div>
                <Badge variant={statusVariant(row.status)}>{concernStatusLabel(row.status)}</Badge>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="whitespace-pre-wrap">{row.incident_description}</p>
                {row.accused_description ? (
                  <p className="text-xs text-muted-foreground">
                    Accused details: {row.accused_description}
                  </p>
                ) : null}
                {row.incident_location ? (
                  <p className="text-xs text-muted-foreground">Location: {row.incident_location}</p>
                ) : null}
                {row.is_hostel_related ? (
                  <Badge variant="outline">Hostel-related</Badge>
                ) : null}
                {evidence.length > 0 ? (
                  <div className="space-y-1">
                    {evidence.map((url) => (
                      <a
                        key={url}
                        href={proofDocHref(url)}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs font-medium text-primary underline"
                      >
                        View evidence
                      </a>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No evidence attached</p>
                )}
                {row.reviewer_remarks ? (
                  <p className="text-xs text-muted-foreground">Reviewer note: {row.reviewer_remarks}</p>
                ) : null}

                {actionable ? (
                  <div className="space-y-2 border-t pt-3">
                    <textarea
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Internal remarks"
                      value={remarks[row.concern_id] ?? ''}
                      onChange={(e) =>
                        setRemarks((m) => ({ ...m, [row.concern_id]: e.target.value }))
                      }
                    />
                    <textarea
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Resolution summary for student (optional until closing)"
                      value={resolution[row.concern_id] ?? ''}
                      onChange={(e) =>
                        setResolution((m) => ({ ...m, [row.concern_id]: e.target.value }))
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.concern_id}
                        onClick={() => void act(row.concern_id, 'UNDER_REVIEW', 'Marked under review')}
                      >
                        Under review
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.concern_id}
                        onClick={() => void act(row.concern_id, 'ESCALATED', 'Escalated to Dean')}
                      >
                        <AlertTriangle className="mr-1 h-3.5 w-3.5" />
                        Escalate
                      </Button>
                      <Button
                        size="sm"
                        disabled={busyId === row.concern_id}
                        onClick={() => void act(row.concern_id, 'RESOLVED', 'Concern resolved')}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" />
                        Resolve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busyId === row.concern_id}
                        onClick={() => void act(row.concern_id, 'CLOSED', 'Concern closed')}
                      >
                        Close
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
