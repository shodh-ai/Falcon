'use client';

import { useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { Loader2 } from 'lucide-react';
import {
  FacultyPageHeader,
  FacultyPageShell,
  FacultyPageLoading,
  FacultyEmptyState,
  FacultyPanel,
  FacultyMetricChip,
} from '@/components/faculty';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';
import { cn } from '@/lib/utils';

type AnalyticsRow = {
  student_user_id: string;
  name: string;
  course_id: string;
  course_code: string;
  attendance_percent: string;
  internal_avg_percent: number;
};

function analyticsRowKey(r: AnalyticsRow) {
  return `${r.student_user_id}:${r.course_id}`;
}

function dedupeAnalyticsRows(rows: AnalyticsRow[]) {
  const byKey = new Map<string, AnalyticsRow>();
  for (const row of rows) {
    byKey.set(analyticsRowKey(row), row);
  }
  return [...byKey.values()];
}

function isAtRisk(r: AnalyticsRow) {
  return Number(r.attendance_percent) < 75 || Number(r.internal_avg_percent) < 40;
}

function StudentAnalyticsRow({
  row,
  onLogRemedial,
  compact,
}: {
  row: AnalyticsRow;
  onLogRemedial: (row: AnalyticsRow, action: string) => Promise<void>;
  compact?: boolean;
}) {
  const [action, setAction] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const atRisk = isAtRisk(row);

  async function submit() {
    if (!action.trim()) {
      toast.error('Describe the remedial action');
      return;
    }
    setSubmitting(true);
    try {
      await onLogRemedial(row, action);
      setAction('');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-border/60 bg-background p-4 shadow-sm',
        atRisk && 'border-amber-200/80 bg-amber-50/30',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-sgvu-navy">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.course_code}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant={Number(row.attendance_percent) < 75 ? 'destructive' : 'secondary'} className="text-[10px]">
            Attendance {row.attendance_percent}%
          </Badge>
          <Badge variant={Number(row.internal_avg_percent) < 40 ? 'destructive' : 'secondary'} className="text-[10px]">
            Internals {Math.round(row.internal_avg_percent)}%
          </Badge>
          {atRisk ? (
            <Badge variant="destructive" className="text-[10px]">At risk</Badge>
          ) : (
            <Badge variant="outline" className="text-[10px]">On track</Badge>
          )}
        </div>
      </div>
      {!compact && (
        <div className="mt-3 flex gap-2">
          <Input
            className="h-9 flex-1"
            placeholder="Remedial class summary"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
          <Button size="sm" variant="outline" disabled={submitting} onClick={() => void submit()}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log remedial'}
          </Button>
        </div>
      )}
    </div>
  );
}

export default function FacultyAnalyticsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [remedialLogs, setRemedialLogs] = useState<
    { remedial_id: string; student_name: string; course_code: string | null; action_taken: string; created_at: string }[]
  >([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const q = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    void Promise.all([
      api.get<AnalyticsRow[]>(`/api/academics/faculty/workspaces/analytics${q}`),
      api.get<
        { remedial_id: string; student_name: string; course_code: string | null; action_taken: string; created_at: string }[]
      >('/api/academics/faculty/workspaces/remedial'),
    ])
      .then(([analytics, logs]) => {
        setRows(analytics);
        setRemedialLogs(logs);
      })
      .catch((e) => {
        toast.error(e instanceof Error ? e.message : 'Failed to load analytics');
        setRows([]);
      })
      .finally(() => setLoading(false));
  }, [api, courseId]);

  const allRows = dedupeAnalyticsRows(rows);
  const atRisk = allRows.filter(isAtRisk);

  async function logRemedial(row: AnalyticsRow, actionTaken: string) {
    try {
      await api.post('/api/academics/faculty/workspaces/remedial', {
        student_user_id: row.student_user_id,
        course_id: row.course_id,
        reason: Number(row.attendance_percent) < 75 ? 'LOW_ATTENDANCE' : 'LOW_INTERNALS',
        action_taken: actionTaken,
      });
      toast.success('Remedial class logged');
      const logs = await api.get<
        { remedial_id: string; student_name: string; course_code: string | null; action_taken: string; created_at: string }[]
      >('/api/academics/faculty/workspaces/remedial');
      setRemedialLogs(logs);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to log remedial action');
      throw e;
    }
  }

  return (
    <FacultyPageShell>
      <FacultyPageHeader
        description="Students below 75% attendance or weak internals — log remedial interventions."
        meta={
          !loading ? (
            <>
              <FacultyMetricChip label="Enrolled" value={allRows.length} emphasis />
              <FacultyMetricChip label="At risk" value={atRisk.length} />
              <FacultyMetricChip label="Remedial logs" value={remedialLogs.length} />
            </>
          ) : null
        }
      />

      <div className="max-w-xs">
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Filter by course</label>
        <select
          className="w-full rounded-lg border border-border/60 bg-background px-3 py-2 text-sm"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
        >
          <option value="">All my courses</option>
          {courses.map((c) => (
            <option key={c.course_id} value={c.course_id}>{c.course_code}</option>
          ))}
        </select>
      </div>

      {loading && <FacultyPageLoading label="Loading analytics…" />}

      {!loading && (
        <FacultyPanel
          title="At-risk students"
          count={atRisk.length}
          description="Below 75% attendance or under 40% internals"
        >
          <div className="space-y-3">
            {atRisk.map((r) => (
              <StudentAnalyticsRow key={analyticsRowKey(r)} row={r} onLogRemedial={logRemedial} />
            ))}
            {atRisk.length === 0 && (
              <FacultyEmptyState description="No at-risk students in this filter." />
            )}
          </div>
        </FacultyPanel>
      )}

      {!loading && remedialLogs.length > 0 && (
        <FacultyPanel title="Recent remedial logs" count={remedialLogs.length}>
          <div className="space-y-2">
            {remedialLogs.slice(0, 10).map((log) => (
              <div key={log.remedial_id} className="rounded-lg border border-border/50 bg-muted/20 px-4 py-3 text-sm">
                <p className="font-medium text-sgvu-navy">
                  {log.student_name} · {log.course_code ?? 'General'}
                </p>
                <p className="text-muted-foreground">{log.action_taken}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(log.created_at).toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        </FacultyPanel>
      )}

      {!loading && allRows.length > 0 && (
        <FacultyPanel title="All enrolled students" count={allRows.length}>
          <div className="space-y-3">
            {allRows.map((r) => (
              <StudentAnalyticsRow
                key={`all-${analyticsRowKey(r)}`}
                row={r}
                onLogRemedial={logRemedial}
                compact={!isAtRisk(r)}
              />
            ))}
          </div>
        </FacultyPanel>
      )}
    </FacultyPageShell>
  );
}
