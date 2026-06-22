'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import {
  phdActionLabel,
  phdActionsForStatus,
  phdStatusLabel,
  type PhdCandidate,
} from '@/lib/phd-lifecycle';
import { PhdPipeline } from './PhdPipeline';

type GuideOption = { user_id: string; name: string; official_email?: string | null; dept_name?: string | null };

export function PhdReviewQueue({
  title,
  description,
  listPath,
  role,
  embedded = false,
  initialRows,
  onRefresh,
}: {
  title?: string;
  description?: string;
  listPath: string;
  role: string;
  embedded?: boolean;
  initialRows?: PhdCandidate[];
  onRefresh?: () => void;
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<PhdCandidate[]>(initialRows ?? []);
  const [loading, setLoading] = useState(!embedded);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const [guidePick, setGuidePick] = useState<Record<string, string>>({});
  const [guides, setGuides] = useState<GuideOption[]>([]);

  const load = useCallback(async () => {
    if (embedded || !listPath) return;
    setLoading(true);
    try {
      const data = await api.get<PhdCandidate[]>(listPath);
      setRows(Array.isArray(data) ? data : []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [api, embedded, listPath]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialRows) setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (!['DRC_MEMBER', 'RAC_MEMBER'].includes(role)) return;
    void api
      .get<GuideOption[]>('/api/phd-lifecycle/guide-options')
      .then((data) => setGuides(Array.isArray(data) ? data : []))
      .catch(() => setGuides([]));
  }, [api, role]);

  async function act(candidateId: string, action: string, success: string, needsGuidePick = false) {
    if (needsGuidePick && !guidePick[candidateId]?.trim()) {
      toast.error('Please select a research guide from the dropdown first.');
      return;
    }
    setBusyId(candidateId);
    try {
      await api.post(`/api/phd-lifecycle/candidates/${candidateId}/action`, {
        action,
        remarks: remarks[candidateId]?.trim() || undefined,
        guide_user_id: guidePick[candidateId] || undefined,
      });
      toast.success(success);
      await load();
      onRefresh?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusyId(null);
    }
  }

  const content = (
    <>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading queue…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No Ph.D. records in your queue.</p>
      ) : (
        rows.map((row) => {
          const actions = phdActionsForStatus(row.lifecycle_status, role);
          const needsGuide = actions.some((a) => a === 'ALLOCATE_SUPERVISOR' || a === 'ALLOCATE_GUIDE');
          return (
            <Card key={row.candidate_id}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{row.candidate_name ?? row.applicant_name ?? 'Candidate'}</CardTitle>
                  <Badge variant="outline">{phdStatusLabel(row.lifecycle_status)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">{row.proposed_topic}</p>
                {row.guide_name ? (
                  <p className="text-xs text-muted-foreground">Guide: {row.guide_name}</p>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-3">
                {!embedded ? <PhdPipeline candidate={row} /> : null}
                {needsGuide ? (
                  <div className="space-y-1">
                    <select
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                      value={guidePick[row.candidate_id] ?? ''}
                      onChange={(e) => setGuidePick((m) => ({ ...m, [row.candidate_id]: e.target.value }))}
                    >
                      <option value="">Select research guide (required)</option>
                      {guides.map((g) => (
                        <option key={g.user_id} value={g.user_id}>
                          {g.name}{g.dept_name ? ` · ${g.dept_name}` : ''}
                        </option>
                      ))}
                    </select>
                    {guides.length === 0 ? (
                      <p className="text-xs text-amber-700">No faculty guides loaded. Refresh or check backend.</p>
                    ) : null}
                  </div>
                ) : null}
                {actions.length > 0 ? (
                  <>
                    <textarea
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                      rows={2}
                      placeholder="Remarks (optional)"
                      value={remarks[row.candidate_id] ?? ''}
                      onChange={(e) => setRemarks((m) => ({ ...m, [row.candidate_id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap gap-2">
                      {actions.map((action) => {
                        const guideRequired =
                          action === 'ALLOCATE_SUPERVISOR' || action === 'ALLOCATE_GUIDE';
                        return (
                        <Button
                          key={action}
                          size="sm"
                          variant={action.includes('REJECT') || action.includes('CANCEL') || action.includes('FAIL') ? 'outline' : 'default'}
                          disabled={
                            busyId === row.candidate_id ||
                            (guideRequired && !guidePick[row.candidate_id]?.trim())
                          }
                          onClick={() => void act(row.candidate_id, action, phdActionLabel(action), guideRequired)}
                        >
                          <Check className="mr-1 h-3.5 w-3.5" />
                          {phdActionLabel(action)}
                        </Button>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>
          );
        })
      )}
    </>
  );

  if (embedded) return <div className="space-y-3">{content}</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold text-sgvu-navy">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="space-y-4">{content}</div>
    </div>
  );
}
