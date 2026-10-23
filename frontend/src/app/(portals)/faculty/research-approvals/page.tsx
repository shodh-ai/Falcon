'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthedApi } from '@/lib/api';
import { createAcademicRndApi, type RndApplication } from '@/lib/api/api.academic-rnd';
import { FacultyPageHeader, FacultyPageShell } from '@/components/faculty';
import { FacultyResearchGrantDetails } from '@/components/faculty/FacultyResearchGrantDetails';
import {
  isEmptyArray,
  isFacultyDemoSmokeId,
  withFacultyDemoFallback,
} from '@/lib/faculty-demo-mode';
import { facultyDemoResearchApprovals } from '@/lib/mock/faculty-portal-demo';

export default function FacultyResearchApprovalsPage() {
  const api = useAuthedApi();
  const rndApi = useMemo(() => createAcademicRndApi(api), [api]);
  const [queue, setQueue] = useState<RndApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remarks, setRemarks] = useState<Record<string, string>>({});
  const mounted = useRef(false);
  const activeApi = useRef(api);
  const [loadedApi, setLoadedApi] = useState(() => api);
  const loadRequest = useRef(0);
  const deciding = useRef(false);
  const unavailable = busy || loading || Boolean(loadError) || loadedApi !== api;

  const load = useCallback(async (afterDecision = false) => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await rndApi.guideQueue();
      if (!mounted.current || activeApi.current !== api || requestId !== loadRequest.current) return;
      if (!Array.isArray(rows)) throw new Error('Could not read research approvals');
      setLoadedApi(api);
      setLoadError(null);
      setQueue(
        withFacultyDemoFallback(
          rows.filter((row) => row.status === 'PENDING_GUIDE'),
          facultyDemoResearchApprovals() as RndApplication[],
          isEmptyArray,
        ),
      );
    } catch (error) {
      if (!mounted.current || activeApi.current !== api || requestId !== loadRequest.current) return;
      const fallback = withFacultyDemoFallback(
          [],
          facultyDemoResearchApprovals() as RndApplication[],
          isEmptyArray,
      );
      if (fallback.length) { setLoadedApi(api); setQueue(fallback); }
      else {
        const message = error instanceof Error ? error.message : 'Could not load research approvals';
        setLoadError(afterDecision ? `Decision saved, but the remaining queue could not be refreshed. ${message}` : message);
      }
    } finally {
      if (mounted.current && activeApi.current === api && requestId === loadRequest.current) setLoading(false);
    }
  }, [api, rndApi]);

  useEffect(() => {
    mounted.current = true;
    activeApi.current = api;
    deciding.current = false;
    // Reset account-owned approval drafts and mutation state before requesting the new queue.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBusy(false);
    setQueue([]);
    setRemarks({});
    void load();
    return () => { mounted.current = false; loadRequest.current += 1; };
  }, [api, load]);

  async function decide(id: string, approve: boolean) {
    if (unavailable || deciding.current || !queue.some((row) => row.application_id === id && row.status === 'PENDING_GUIDE')) return;
    const text = remarks[id]?.trim();
    if (!approve && !text) { toast.error('Remarks required for rejection'); return; }
    deciding.current = true;
    setBusy(true);
    try {
      const demo = isFacultyDemoSmokeId(id);
      if (!demo) {
        if (approve) await rndApi.approveGuide(id, text || undefined);
        else await rndApi.rejectGuide(id, text!);
      }
      if (!mounted.current || activeApi.current !== api) return;
      setQueue((current) => current.filter((row) => row.application_id !== id));
      setRemarks((current) => { const next = { ...current }; delete next[id]; return next; });
      toast.success(`${approve ? 'Technical review approved — forwarded to Finance' : 'Application rejected — student notified'}${demo ? ' (demo)' : ''}`);
      if (!demo) await load(true);
    } catch (err) {
      if (mounted.current && activeApi.current === api) toast.error(err instanceof Error ? err.message : approve ? 'Approval failed' : 'Rejection failed');
    } finally {
      if (activeApi.current === api) { deciding.current = false; if (mounted.current) setBusy(false); }
    }
  }

  if (loading || loadedApi !== api) {
    return (
      <FacultyPageShell>
        <FacultyPageHeader
          title="Research Grants"
          description="Review student research grant proposals awaiting your guide approval."
        />
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-sgvu-navy" />
          <p role="status" className="text-sm text-muted-foreground">Loading research approvals…</p>
        </div>
      </FacultyPageShell>
    );
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        title="Research Grants"
        description="Verify technical validity of student research proposals before Finance review."
      />

      <Card>
        <CardHeader>
          <CardTitle>Pending Guide Approvals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loadError ? (
            <div role="alert" className="space-y-2 text-sm text-destructive"><p>{loadError}</p><Button variant="outline" disabled={busy} onClick={() => void load()}>Retry approvals</Button></div>
          ) : queue.length === 0 ? (
            <p className="text-sm text-muted-foreground">No applications awaiting your review.</p>
          ) : null}
          {queue.length > 0 ? (
            queue.map((app) => (
              <div key={app.application_id} className="space-y-2 rounded-lg border p-4">
                <p className="font-semibold text-sgvu-navy">{app.project_title}</p>
                <p className="text-xs text-muted-foreground">{app.student_name}</p>
                <FacultyResearchGrantDetails application={app} />
                <Input
                  placeholder="Remarks (required for reject)"
                  value={remarks[app.application_id] ?? ''}
                  disabled={unavailable}
                  onChange={(e) => setRemarks((r) => ({ ...r, [app.application_id]: e.target.value }))}
                />
                <div className="flex gap-2">
                  <Button size="sm" disabled={unavailable} onClick={() => void decide(app.application_id, true)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="destructive" disabled={unavailable} onClick={() => void decide(app.application_id, false)}>
                    Reject
                  </Button>
                </div>
              </div>
            ))
          ) : null}
        </CardContent>
      </Card>
    </FacultyPageShell>
  );
}
