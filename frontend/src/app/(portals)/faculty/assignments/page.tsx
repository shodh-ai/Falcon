'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthedApi } from '@/lib/api';

type FacultyAssignment = {
  assignment_id: string;
  course_id: string;
  title: string;
  due_date: string;
  max_marks: number;
  submission_count: number;
  course?: { course_code: string; course_name: string };
};

export default function FacultyAssignmentsPage() {
  const api = useAuthedApi();
  const { courses } = useFacultyCourses();
  const [courseId, setCourseId] = useState('');
  const [assignments, setAssignments] = useState<FacultyAssignment[]>([]);

  useEffect(() => {
    const q = courseId ? `?courseId=${encodeURIComponent(courseId)}` : '';
    void api
      .get<FacultyAssignment[]>(`/api/academics/faculty/assignments${q}`)
      .then(setAssignments)
      .catch(() => setAssignments([]));
  }, [api, courseId]);

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Digital Assignments (DA)"
        description="Dedicated DA workspace — deadlines, late submission policy, and PDF grading."
        actions={
          <Button size="sm" asChild>
            <Link href="/faculty/courses">Open a course → DA tab</Link>
          </Button>
        }
      />

      <select
        className="w-full max-w-md rounded-md border bg-background px-3 py-2 text-sm"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
      >
        <option value="">All courses</option>
        {courses.map((c) => (
          <option key={c.course_id} value={c.course_id}>
            {c.course_code}
          </option>
        ))}
      </select>

      <div className="grid gap-3">
        {assignments.map((a) => (
          <Card key={a.assignment_id}>
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base">{a.title}</CardTitle>
                <Badge variant="secondary">{a.submission_count} submissions</Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              <p>
                {a.course?.course_code} · Due {new Date(a.due_date).toLocaleString()} · Max {a.max_marks} marks
              </p>
              <Button className="mt-3" variant="outline" size="sm" asChild>
                <Link href={`/faculty/courses/${a.course_id}?tab=assignments`}>Grade submissions</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
        {assignments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No digital assignments yet. Create one from the DA editor.</p>
        ) : null}
      </div>
    </div>
  );
}
