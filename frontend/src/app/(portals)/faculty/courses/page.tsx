'use client';

import Link from 'next/link';
import { FacultyPageHeader } from '@/components/faculty/FacultyPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFacultyCourses } from '@/components/faculty/useFacultyCourses';

export default function FacultyCoursesIndexPage() {
  const { courses, loading } = useFacultyCourses();

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
      <FacultyPageHeader
        title="Course workspaces"
        description="Open a subject to plan syllabus modules, track coverage, and upload lecture materials."
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading courses…</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <Link key={c.course_id} href={`/faculty/courses/${c.course_id}`}>
              <Card className="transition hover:border-sgvu-gold">
                <CardHeader>
                  <CardTitle className="text-base">
                    {c.course_code}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {c.course_name} · {c.credits} credits
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
