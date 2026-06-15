'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type PendingMark = {
  mark_id: string;
  student_name: string;
  course_code: string;
  course_name: string;
  course_id: string;
  exam_type: string;
  marks_obtained: string;
  max_marks: string;
  percent: string;
};

type Distribution = {
  count: number;
  avg_marks: string;
  min_marks: string;
  max_marks: string;
  above_90pct: number;
  below_40pct: number;
};

export default function ExamCellResultsPage() {
  const api = useAuthedApi();
  const [pending, setPending] = useState<PendingMark[]>([]);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(() => {
    void api.get<PendingMark[]>('/api/exam-cell/results/pending').then(setPending);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = useMemo(() => {
    const map = new Map<string, { course_id: string; course_code: string; course_name: string; exam_type: string; rows: PendingMark[] }>();
    for (const row of pending) {
      const key = `${row.course_id}:${row.exam_type}`;
      if (!map.has(key)) {
        map.set(key, { course_id: row.course_id, course_code: row.course_code, course_name: row.course_name, exam_type: row.exam_type, rows: [] });
      }
      map.get(key)!.rows.push(row);
    }
    return [...map.values()];
  }, [pending]);

  async function publish(courseId: string, examType: string) {
    setPublishing(true);
    try {
      const res = await api.post<{ published: number; course_name: string }>('/api/exam-cell/results/publish', {
        course_id: courseId,
        exam_type: examType,
        batch_semester: 4,
      });
      toast.success(`Published ${res.published} results for ${res.course_name} — students notified 🔔`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <div>
        <p className="text-sm font-semibold text-sgvu-gold">Falcon Exam OS</p>
        <h1 className="text-2xl font-bold text-sgvu-navy">Result Processing</h1>
        <p className="text-sm text-muted-foreground">
          Faculty submissions arrive as PENDING_COE. Review distribution, then publish to unlock student marks and bell notifications.
        </p>
      </div>

      {groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No marks awaiting COE approval.</CardContent></Card>
      ) : (
        groups.map((g) => (
          <CourseResultBlock key={`${g.course_id}-${g.exam_type}`} group={g} onPublish={publish} publishing={publishing} api={api} />
        ))
      )}
    </div>
  );
}

function CourseResultBlock({
  group,
  onPublish,
  publishing,
  api,
}: {
  group: { course_id: string; course_code: string; course_name: string; exam_type: string; rows: PendingMark[] };
  onPublish: (courseId: string, examType: string) => void;
  publishing: boolean;
  api: ReturnType<typeof useAuthedApi>;
}) {
  const [dist, setDist] = useState<Distribution | null>(null);

  useEffect(() => {
    void api
      .get<Distribution[]>(`/api/exam-cell/results/distribution?course_id=${group.course_id}&exam_type=${group.exam_type}`)
      .then((rows) => setDist(rows[0] ?? null));
  }, [api, group.course_id, group.exam_type]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-lg">{group.course_code} — {group.exam_type}</CardTitle>
          <p className="text-sm text-muted-foreground">{group.course_name} · {group.rows.length} students</p>
        </div>
        <Button onClick={() => onPublish(group.course_id, group.exam_type)} disabled={publishing}>
          Publish results
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {dist && (
          <div className="flex flex-wrap gap-3 text-sm">
            <Badge variant="outline">Avg: {dist.avg_marks}</Badge>
            <Badge variant="outline">Min–Max: {dist.min_marks}–{dist.max_marks}</Badge>
            <Badge variant="outline">≥90%: {dist.above_90pct}</Badge>
            <Badge variant="outline">&lt;40%: {dist.below_40pct}</Badge>
          </div>
        )}
        <div className="max-h-48 overflow-y-auto rounded-lg border">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Student</th>
                <th className="px-3 py-2 text-right">Marks</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => (
                <tr key={r.mark_id} className="border-t">
                  <td className="px-3 py-1.5">{r.student_name}</td>
                  <td className="px-3 py-1.5 text-right">{r.marks_obtained}/{r.max_marks}</td>
                  <td className="px-3 py-1.5 text-right">{r.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
