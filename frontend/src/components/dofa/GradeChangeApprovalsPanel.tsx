'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Loader2, X } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  FacultyEmptyState,
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPanel,
} from '@/components/faculty';
import { toast } from '@/lib/notifications/falcon-toast';
import { cn } from '@/lib/utils';

type GradeChangeRow = {
  change_id: string;
  course_code: string;
  from_grade: string;
  to_grade: string;
  reason?: string | null;
  status?: string;
  student_name?: string | null;
  requester_name?: string | null;
  dofa_case_id?: string | null;
  dofa_awaiting_role?: string | null;
  requested_by?: string;
};

function statusLabel(row: GradeChangeRow) {
  if (row.status === 'APPLIED') return 'Applied';
  if (row.status === 'REJECTED') return 'Rejected';
  if (row.status === 'AWAITING_COE') return 'Awaiting Exam Cell (COE)';
  if (row.dofa_awaiting_role) return `Awaiting ${row.dofa_awaiting_role}`;
  if (row.status === 'PENDING_DOFA') return 'Awaiting HOD';
  return row.status ?? 'Unknown';
}

function statusBadgeClass(status?: string) {
  if (status === 'APPLIED') return 'border-green-200 bg-green-50 text-green-700';
  if (status === 'REJECTED') return 'border-red-200 bg-red-50 text-red-700';
  if (status === 'AWAITING_COE') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-sky-200 bg-sky-50 text-sky-800';
}

function canAct(role: 'hod' | 'exam-cell', row: GradeChangeRow) {
  if (!row.dofa_case_id) return false;
  if (row.status === 'APPLIED' || row.status === 'REJECTED') return false;
  if (role === 'hod') {
    return (
      row.status === 'PENDING_DOFA' ||
      String(row.dofa_awaiting_role || '').toLowerCase() === 'hod'
    );
  }
  return (
    row.status === 'AWAITING_COE' ||
    String(row.dofa_awaiting_role || '').toLowerCase() === 'examcell'
  );
}

export function GradeChangeApprovalsPanel({
  role,
  title,
  description,
  eyebrow,
}: {
  role: 'hod' | 'exam-cell';
  title: string;
  description: string;
  eyebrow?: string;
}) {
  const api = useAuthedApi();
  const [rows, setRows] = useState<GradeChangeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<GradeChangeRow[]>('/api/uos/sis/grade-changes');
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
      toast.error(e instanceof Error ? e.message : 'Failed to load grade changes');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const actionable = useMemo(
    () => rows.filter((r) => canAct(role, r)),
    [rows, role],
  );
  const history = useMemo(
    () => rows.filter((r) => !canAct(role, r)),
    [rows, role],
  );

  async function decide(row: GradeChangeRow, decision: 'APPROVED' | 'REJECTED') {
    if (!row.dofa_case_id) {
      toast.error('No open DOFA case for this request');
      return;
    }
    setBusyId(row.change_id);
    try {
      const res = await api.post<{
        status?: string;
        steps?: Array<{ required_role: string; decision: string | null }>;
      }>(`/api/dofa/cases/${row.dofa_case_id}/decide`, { decision });

      if (decision === 'REJECTED') {
        toast.success('Grade change rejected');
      } else if (role === 'exam-cell' || res?.status === 'APPROVED') {
        toast.success('Grade change applied by Exam Cell (COE)');
      } else {
        toast.success('Approved — forwarded to Exam Cell (COE)');
      }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Decision failed');
    } finally {
      setBusyId(null);
    }
  }

  const renderCard = (row: GradeChangeRow, showActions: boolean) => (
    <div
      key={row.change_id}
      className="box-border grid w-full gap-3 rounded-xl border border-border/60 bg-background p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-sgvu-navy">{row.course_code}</span>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/40 px-2 py-0.5 text-xs font-semibold text-sgvu-navy">
            {row.from_grade}
            <ArrowRight className="h-3 w-3 text-muted-foreground" />
            {row.to_grade}
          </span>
        </div>
        <p className="text-sm text-sgvu-navy">
          {row.student_name || 'Student'}
          {row.requester_name ? (
            <span className="text-muted-foreground"> · requested by {row.requester_name}</span>
          ) : null}
        </p>
        {row.reason ? (
          <p className="text-xs leading-relaxed text-muted-foreground">{row.reason}</p>
        ) : null}
      </div>

      <div className="flex flex-col items-stretch gap-2 sm:items-end">
        <Badge
          variant="outline"
          className={cn(
            'h-8 w-fit justify-center px-3 text-xs font-semibold',
            statusBadgeClass(row.status),
          )}
        >
          {statusLabel(row)}
        </Badge>
        {showActions ? (
          <div className="grid grid-cols-2 gap-2 sm:w-[14rem]">
            <Button
              size="sm"
              className="h-9"
              disabled={busyId === row.change_id}
              onClick={() => void decide(row, 'APPROVED')}
            >
              {busyId === row.change_id ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              {role === 'exam-cell' ? 'Apply' : 'Approve'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 border-red-200 text-red-700 hover:bg-red-50"
              disabled={busyId === row.change_id}
              onClick={() => void decide(row, 'REJECTED')}
            >
              <X className="mr-1.5 h-4 w-4" />
              Reject
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        eyebrow={eyebrow}
        title={title}
        description={description}
        meta={
          <div className="flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            <span className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">
              1. Faculty submits
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">
              2. HOD approves
            </span>
            <span className="rounded-md border border-border/60 bg-muted/30 px-2.5 py-1">
              3. Exam Cell (COE) applies
            </span>
          </div>
        }
      />

      <div className="w-full space-y-6">
        <FacultyPanel
          title={role === 'hod' ? 'Pending HOD approval' : 'Pending Exam Cell apply'}
          description={
            role === 'hod'
              ? 'Approve to forward to Exam Cell. You cannot approve your own request.'
              : 'Final apply step. Confirms the grade change after HOD approval.'
          }
          count={actionable.length || undefined}
          className="w-full"
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : actionable.length === 0 ? (
            <FacultyEmptyState
              title="No pending grade changes"
              description="New requests will appear here when they reach your step."
            />
          ) : (
            <div className="grid w-full grid-cols-1 gap-3">
              {actionable.map((row) => renderCard(row, true))}
            </div>
          )}
        </FacultyPanel>

        <FacultyPanel
          title="All grade change requests"
          description="Full department / exam-cell history for this workflow"
          count={history.length || undefined}
          className="w-full"
        >
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <FacultyEmptyState title="No other requests" description="History will show here." />
          ) : (
            <div className="grid w-full grid-cols-1 gap-3">
              {history.map((row) => renderCard(row, false))}
            </div>
          )}
        </FacultyPanel>
      </div>
    </FacultyPageShell>
  );
}
