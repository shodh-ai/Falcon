'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';
import { useAuthedApi } from '@/lib/api';

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
}: {
  row: AnalyticsRow;
  onLogRemedial: (row: AnalyticsRow, action: string) => Promise<void>;
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
    <div className="rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{row.name}</p>
          <p className="text-xs text-muted-foreground">{row.course_code}</p>
        </div>
        <div className="flex gap-2">
          <Badge variant={Number(row.attendance_percent) < 75 ? 'destructive' : 'secondary'}>
            Attendance {row.attendance_percent}%
          </Badge>
          <Badge variant={Number(row.internal_avg_percent) < 40 ? 'destructive' : 'secondary'}>
            Internals {Math.round(row.internal_avg_percent)}%
          </Badge>
          {atRisk ? <Badge variant="destructive">At risk</Badge> : <Badge variant="outline">On track</Badge>}
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <Input
          className="h-8 flex-1"
          placeholder="Remedial class summary"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={submitting} onClick={() => void submit()}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Log remedial'}
        </Button>
      </div>
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
      toast.success('Remedial class logged to faculty_remedial_actions');
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
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Student Analytics & Slow Learners"
        description="Students below 75% attendance or weak internal performance — log remedial interventions."
      />

      <select
        className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        <option value="">All my courses</option>
        {courses.map((c) => (
          <option key={c.course_id} value={c.course_id}>
            {c.course_code}
          </option>
        ))}
      </select>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Slow learners (at-risk) — {atRisk.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {atRisk.map((r) => (
              <StudentAnalyticsRow key={analyticsRowKey(r)} row={r} onLogRemedial={logRemedial} />
            ))}
            {atRisk.length === 0 ? (
              <p className="text-sm text-muted-foreground">No at-risk students in this filter.</p>
            ) : null}
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent remedial logs — {remedialLogs.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {remedialLogs.length === 0 ? (
              <p className="text-muted-foreground">No remedial actions logged yet. Entries are saved to faculty_remedial_actions.</p>
            ) : (
              remedialLogs.slice(0, 10).map((log) => (
                <div key={log.remedial_id} className="rounded-lg border p-3">
                  <p className="font-medium">{log.student_name} · {log.course_code ?? 'General'}</p>
                  <p className="text-muted-foreground">{log.action_taken}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {!loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">All enrolled students — {allRows.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {allRows.map((r) => (
              <StudentAnalyticsRow key={`all-${analyticsRowKey(r)}`} row={r} onLogRemedial={logRemedial} />
            ))}
            {allRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No enrolled students found for this filter.</p>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
