'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuthedApi } from '@/lib/api';
import { useTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';

type Course = { course_id: string; course_code: string; course_name: string };
type Class = {
  timetable_id: string;
  course_code: string;
  course_name: string;
  start_time: string;
  end_time: string;
  room: string | null;
  student_count: number;
};

/** Deliberately mounts no HR, research, approval or notification widgets. */
export function FacultyObserverDashboard() {
  const api = useAuthedApi();
  const { activeDeptId, loading: deptLoading } = useTeachingDepartment();
  const [courses, setCourses] = useState<Course[]>([]);
  const [classes, setClasses] = useState<Class[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    Promise.resolve().then(() => {
      if (cancelled) return null;
      setLoading(true);
      setError(null);
      setCourses([]);
      setClasses([]);
      return Promise.all([
      api.get<Course[]>(withTeachingDeptId('/api/academics/faculty/workspaces/courses', activeDeptId)),
      api.get<Class[]>(withTeachingDeptId('/api/academics/faculty/timetable/today', activeDeptId)),
      ]);
    }).then((data) => {
      if (cancelled || !data) return;
      const [courseData, classData] = data;
      if (!Array.isArray(courseData) || !Array.isArray(classData)) {
        throw new Error('The academic dashboard returned an invalid response.');
      }
      setCourses(courseData);
      setClasses(classData);
    }).catch((e: unknown) => {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to load assigned academic data.');
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [api, activeDeptId, deptLoading]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-white p-6">
        <h1 className="text-xl font-semibold">Academic observer dashboard</h1>
        <p className="mt-2 text-sm text-slate-600">
          View assigned courses, student rosters and the timetable. This account cannot change teaching data.
          HR, research, approvals and personal notifications are not part of this testing access.
        </p>
        <Link href="/faculty/timetable" className="mt-4 inline-block font-medium text-blue-800 underline">View full timetable</Link>
      </section>
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}
      {loading ? <p role="status">Loading assigned academic data…</p> : !error && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-white p-6">
            <h2 className="font-semibold">Assigned courses ({courses.length})</h2>
            {courses.length === 0 && <p className="mt-4 text-sm text-slate-600">No assigned courses in this teaching department.</p>}
            <ul className="mt-4 space-y-3">
              {courses.map(course => <li key={course.course_id} className="rounded-lg border p-3">
                <p className="font-medium">{course.course_code} · {course.course_name}</p>
              </li>)}
            </ul>
            <Link href="/faculty/courses" className="mt-4 inline-block font-medium text-blue-800 underline">View courses and student rosters</Link>
          </section>
          <section className="rounded-xl border bg-white p-6">
            <h2 className="font-semibold">Today’s classes ({classes.length})</h2>
            {classes.length === 0 && <p className="mt-4 text-sm text-slate-600">No classes scheduled today in this teaching department.</p>}
            <ul className="mt-4 space-y-3">
              {classes.map(slot => <li key={slot.timetable_id} className="rounded-lg border p-3">
                <p className="font-medium">{slot.course_code} · {slot.course_name}</p>
                <p className="mt-1 text-sm text-slate-600">{slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)} · {slot.room || 'Room not specified'} · {slot.student_count} students</p>
              </li>)}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}
