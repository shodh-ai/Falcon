'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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

export default function FacultyAnalyticsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<AnalyticsRow[]>([]);
  const [remedial, setRemedial] = useState({ rowKey: '', action: '' });

  useEffect(() => {
    const q = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    void api.get<AnalyticsRow[]>(`/api/academics/faculty/workspaces/analytics${q}`).then(setRows);
  }, [api, courseId]);

  const atRisk = dedupeAnalyticsRows(rows).filter(
    (r) => Number(r.attendance_percent) < 75 || Number(r.internal_avg_percent) < 40,
  );

  async function logRemedial(row: AnalyticsRow) {
    if (!remedial.action.trim()) {
      toast.error('Describe the remedial action');
      return;
    }
    try {
      await api.post('/api/academics/faculty/workspaces/remedial', {
        student_user_id: row.student_user_id,
        course_id: row.course_id,
        reason:
          Number(row.attendance_percent) < 75 ? 'LOW_ATTENDANCE' : 'LOW_INTERNALS',
        action_taken: remedial.action,
      });
      toast.success('Remedial class logged');
      setRemedial({ rowKey: '', action: '' });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">At-risk students ({atRisk.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atRisk.map((r) => (
            <div key={analyticsRowKey(r)} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.course_code}</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={Number(r.attendance_percent) < 75 ? 'destructive' : 'secondary'}>
                    Attendance {r.attendance_percent}%
                  </Badge>
                  <Badge variant={Number(r.internal_avg_percent) < 40 ? 'destructive' : 'secondary'}>
                    Internals {Math.round(r.internal_avg_percent)}%
                  </Badge>
                </div>
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  className="h-8 flex-1"
                  placeholder="Remedial class summary"
                  value={remedial.rowKey === analyticsRowKey(r) ? remedial.action : ''}
                  onChange={(e) => setRemedial({ rowKey: analyticsRowKey(r), action: e.target.value })}
                />
                <Button size="sm" variant="outline" onClick={() => void logRemedial(r)}>
                  Log remedial
                </Button>
              </div>
            </div>
          ))}
          {atRisk.length === 0 ? (
            <p className="text-sm text-muted-foreground">No at-risk students in this filter.</p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
