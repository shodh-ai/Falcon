'use client';

import { FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuthedApi } from '@/lib/api';

type CoPoRow = {
  mapping_id: string;
  co_code: string;
  po_code: string;
  question_ref: string;
  weight_percent: string;
  academic_year: string;
};

export default function FacultyCoPoPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [rows, setRows] = useState<CoPoRow[]>([]);
  const [form, setForm] = useState({
    co_code: 'CO1',
    po_code: 'PO1',
    question_ref: 'Q1',
    weight_percent: '10',
    academic_year: '2025-26',
  });

  useEffect(() => {
    if (!courseId) return;
    void api
      .get<CoPoRow[]>(`/api/academics/faculty/workspaces/copo?courseId=${encodeURIComponent(courseId)}`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [api, courseId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!courseId) return;
    try {
      await api.post('/api/academics/faculty/workspaces/copo', {
        course_id: courseId,
        ...form,
        weight_percent: Number(form.weight_percent),
      });
      toast.success('CO-PO mapping saved');
      setRows(
        await api.get<CoPoRow[]>(
          `/api/academics/faculty/workspaces/copo?courseId=${encodeURIComponent(courseId)}`,
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save mapping');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="CO-PO Mapping"
        description="Map questions to Course Outcomes and Program Outcomes for NBA/NAAC attainment tracking."
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Course</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
          >
            <option value="">Select course</option>
            {courses.map((c) => (
              <option key={c.course_id} value={c.course_id}>
                {c.course_code} — {c.course_name}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      {courseId ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add mapping</CardTitle>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
                <Input value={form.co_code} onChange={(e) => setForm({ ...form, co_code: e.target.value })} placeholder="CO code" />
                <Input value={form.po_code} onChange={(e) => setForm({ ...form, po_code: e.target.value })} placeholder="PO code" />
                <Input value={form.question_ref} onChange={(e) => setForm({ ...form, question_ref: e.target.value })} placeholder="Question ref" />
                <Input value={form.weight_percent} onChange={(e) => setForm({ ...form, weight_percent: e.target.value })} placeholder="Weight %" />
                <Input value={form.academic_year} onChange={(e) => setForm({ ...form, academic_year: e.target.value })} placeholder="Academic year" />
                <Button type="submit" className="md:col-span-2">
                  Save mapping
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Current mappings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {rows.length === 0 ? (
                <p className="text-muted-foreground">No mappings yet for this course.</p>
              ) : (
                rows.map((r) => (
                  <div key={r.mapping_id} className="rounded-lg border px-3 py-2">
                    {r.co_code} → {r.po_code} ({r.question_ref}) — {r.weight_percent}% · {r.academic_year}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
