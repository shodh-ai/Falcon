'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { HrPageHeader } from '@/components/hr/HrPageHeader';
import { HrAttendanceCalendar } from '@/components/hr/HrAttendanceCalendar';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type RegularizationRequest = {
  leave_id: string;
  request_type: string;
  regularization_date: string | null;
  start_date: string;
  reason: string | null;
  status: string;
  current_step_order: number | null;
  employee?: { name?: string; department?: string | null };
  staff?: { name?: string };
};

export default function HrAttendancePage() {
  const api = useHrApi();
  const { entityId, entityReady } = useHrEntity();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [firstStageRequests, setFirstStageRequests] = useState<RegularizationRequest[]>([]);
  const [finalRequests, setFinalRequests] = useState<RegularizationRequest[]>([]);
  const [regularizationLoading, setRegularizationLoading] = useState(true);
  const [regularizationError, setRegularizationError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const loadRegularizations = useCallback(async () => {
    try {
      const [pending, final] = await Promise.all([
        api.get<RegularizationRequest[]>('/api/hr/leaves/all?status=PENDING&request_type=REGULARIZATION'),
        api.get<RegularizationRequest[]>('/api/hr/workforce/final-pending?types=REGULARIZATION'),
      ]);
      setFirstStageRequests(pending);
      setFinalRequests(final);
      setRegularizationError(null);
    } catch (error) {
      setFirstStageRequests([]);
      setFinalRequests([]);
      setRegularizationError(error instanceof Error ? error.message : 'Could not load regularization approvals.');
    } finally {
      setRegularizationLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!entityReady) return;
    const timer = window.setTimeout(() => void loadRegularizations(), 0);
    return () => window.clearTimeout(timer);
  }, [entityReady, entityId, loadRegularizations]);

  async function actOnRegularization(leaveId: string, action: 'APPROVE' | 'REJECT') {
    setActing(leaveId);
    setRegularizationLoading(true);
    try {
      await api.patch(`/api/hr/workforce/team/${leaveId}/action`, { action });
      toast.success(action === 'APPROVE' ? 'Final regularization approval recorded' : 'Regularization rejected');
      await loadRegularizations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setActing(null);
    }
  }

  async function syncBiometric() {
    setSyncing(true);
    try {
      await api.post('/api/hr/workforce/biometric/sync', {});
      toast.success('Biometric sync completed');
      setRefreshKey((k) => k + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <HrPageHeader
        title="Attendance matrix"
        description="Color-coded daily status from assigned shifts, biometric punches, holidays, and pending requests."
        actions={
          <div className="flex gap-2">
            <input
              type="month"
              className="rounded-md border px-2 py-1 text-sm"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
            <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncBiometric()}>
              {syncing ? 'Syncing…' : 'Sync biometric'}
            </Button>
            <Button 
              size="sm" 
              className="bg-sgvu-navy hover:bg-sgvu-navy/90 text-white" 
              onClick={() => {
                const token = document.cookie.replace(/(?:(?:^|.*;\s*)access_token\s*=\s*([^;]*).*$)|^.*$/, "$1");
                const url = new URL(`${window.location.origin}/api/hr/reports/muster-roll`);
                url.searchParams.set('month', month);
                if (entityId) url.searchParams.set('entity_id', String(entityId));
                
                fetch(url.toString(), {
                  headers: { Authorization: `Bearer ${token}` }
                })
                .then(res => res.blob())
                .then(blob => {
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `bulk-attendance-${month}.xlsx`;
                  a.click();
                });
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Bulk Export
            </Button>
          </div>
        }
      />

      <HrAttendanceCalendar
        key={`${entityId}-${month}-${refreshKey}`}
        mode="matrix"
        month={month}
        title={`Master matrix — ${month}`}
      />

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Attendance regularizations</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Requests remain view-only here until first-level approval is complete.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setRegularizationLoading(true); void loadRegularizations(); }} disabled={regularizationLoading}>
            {regularizationLoading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {regularizationError && (
            <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              {regularizationError}
              <Button size="sm" variant="outline" className="ml-3" onClick={() => void loadRegularizations()}>Retry</Button>
            </div>
          )}
          {regularizationLoading ? (
            <p role="status" className="text-sm text-muted-foreground">Loading regularization requests…</p>
          ) : !regularizationError ? (
            <>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Awaiting first-level approval</h2>
                {firstStageRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No requests awaiting first-level approval.</p>
                ) : firstStageRequests.map((request) => (
                  <div key={request.leave_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                    <div>
                      <p className="font-medium">{request.employee?.name ?? request.staff?.name ?? 'Staff member'}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.regularization_date ?? request.start_date}{request.reason ? ` · ${request.reason}` : ''}
                      </p>
                    </div>
                    <Badge variant="outline">Awaiting first-level approval · view only</Badge>
                  </div>
                ))}
              </section>
              <section className="space-y-2">
                <h2 className="text-sm font-semibold">Final approval</h2>
                {finalRequests.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No regularizations are assigned to you for final approval.</p>
                ) : finalRequests.map((request) => (
                  <div key={request.leave_id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 p-3">
                    <div>
                      <p className="font-medium">{request.employee?.name ?? request.staff?.name ?? 'Staff member'}</p>
                      <p className="text-sm text-muted-foreground">
                        {request.regularization_date ?? request.start_date}{request.reason ? ` · ${request.reason}` : ''}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" disabled={acting === request.leave_id} onClick={() => void actOnRegularization(request.leave_id, 'REJECT')}>Reject</Button>
                      <Button size="sm" disabled={acting === request.leave_id} onClick={() => void actOnRegularization(request.leave_id, 'APPROVE')}>Final approve</Button>
                    </div>
                  </div>
                ))}
              </section>
            </>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
