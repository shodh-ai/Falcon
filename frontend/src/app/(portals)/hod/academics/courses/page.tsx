'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Search, Users } from 'lucide-react';
import { HodMetricChip, HodPageFrame, HodPageHeader } from '@/components/hod/HodPagePrimitives';
import { useAuthedApi } from '@/lib/api';
import { Input } from '@/components/ui/input';
import type { FacultyCourse } from '@/components/faculty/useFacultyCourses';

type CourseGroup = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  allocations: FacultyCourse[];
  faculty: { id: string; name: string }[];
};

export default function HodCoursesPage() {
  const api = useAuthedApi();
  const [rows, setRows] = useState<FacultyCourse[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api.get<FacultyCourse[]>('/api/academics/faculty/workspaces/courses?scope=department')
      .then((data) => { if (active) setRows(Array.isArray(data) ? data : []); })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load department courses'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api]);

  const courses = useMemo(() => {
    const grouped = new Map<string, CourseGroup>();
    for (const row of rows) {
      if (!row.course_id) continue;
      let group = grouped.get(row.course_id);
      if (!group) {
        group = { course_id: row.course_id, course_code: row.course_code, course_name: row.course_name, credits: row.credits, allocations: [], faculty: [] };
        grouped.set(row.course_id, group);
      }
      if (row.allocation_id) group.allocations.push(row);
      if (row.faculty_user_id && !group.faculty.some((faculty) => faculty.id === row.faculty_user_id)) {
        group.faculty.push({ id: row.faculty_user_id, name: row.faculty_name || 'Assigned faculty' });
      }
    }
    return [...grouped.values()].sort((a, b) => a.course_code.localeCompare(b.course_code));
  }, [rows]);
  const visible = courses.filter((course) =>
    [course.course_code, course.course_name, ...course.faculty.map((faculty) => faculty.name), ...course.allocations.map((row) => `${row.program_name} ${row.semester}`)]
      .join(' ').toLowerCase().includes(query.trim().toLowerCase()),
  );

  return <HodPageFrame>
    <HodPageHeader title="Department courses & subjects" description="Courses taught by your department or taken by its students. Faculty workspaces here are read-only; use My Teaching to edit your own courses."
      meta={<><HodMetricChip label="Courses" value={courses.length} emphasis /><HodMetricChip label="Faculty" value={new Set(courses.flatMap((course) => course.faculty.map((faculty) => faculty.id))).size} /></>} />
    <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
      <label htmlFor="hod-course-search" className="mb-2 block text-sm font-semibold text-sgvu-navy">Find a course or faculty member</label>
      <div className="relative max-w-xl"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" aria-hidden /><Input id="hod-course-search" value={query} onChange={(event) => setQuery(event.target.value)} className="pl-9" placeholder="Course code, title, programme, semester or faculty" /></div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {loading ? <p className="mt-5 text-sm text-muted-foreground">Loading courses…</p> : visible.length === 0 ? <p className="mt-5 text-sm text-muted-foreground">No department courses match this search.</p> :
        <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visible.map((course) => <Link key={course.course_id} href={`/hod/academics/courses/${course.course_id}`} className="rounded-xl border border-slate-200 p-4 transition hover:border-sgvu-gold hover:bg-amber-50/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sgvu-gold">
          <div className="flex items-start justify-between gap-2"><span className="flex items-center gap-2 text-sm font-bold text-sgvu-navy"><BookOpen className="h-4 w-4" />{course.course_code}</span><span className="text-xs text-slate-500">{course.credits} credits</span></div>
          <h2 className="mt-2 text-base font-semibold text-sgvu-navy">{course.course_name}</h2>
          <p className="mt-3 flex items-start gap-2 text-sm text-slate-700"><Users className="mt-0.5 h-4 w-4 shrink-0" />{course.faculty.length ? course.faculty.map((faculty) => faculty.name).join(', ') : 'Faculty not assigned'}</p>
          <p className="mt-2 text-xs text-slate-500">{[...new Set(course.allocations.map((row) => [row.program_name, row.semester ? `Semester ${row.semester}` : ''].filter(Boolean).join(' · ')))].filter(Boolean).join(' • ') || 'Department student enrollment'}</p>
          <p className="mt-3 text-xs font-semibold text-sgvu-navy">View course overview →</p>
        </Link>)}</div>}
    </div>
  </HodPageFrame>;
}
