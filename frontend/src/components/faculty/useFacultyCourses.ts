'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useOptionalTeachingDepartment } from '@/components/faculty/TeachingDepartmentContext';
import { withTeachingDeptId } from '@/lib/faculty/teaching-departments';
import { isEmptyArray, withFacultyDemoFallback } from '@/lib/faculty-demo-mode';
import { facultyDemoCourses } from '@/lib/mock/faculty-portal-demo';

export type FacultyCourse = {
  allocation_id?: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  program_name?: string | null;
  semester?: string | null;
  academic_year?: string | null;
};

export function uniqueFacultyCoursesByCourseId(courses: FacultyCourse[]): FacultyCourse[] {
  const seen = new Set<string>();
  return courses.filter((course) => {
    if (seen.has(course.course_id)) return false;
    seen.add(course.course_id);
    return true;
  });
}

export function useFacultyCourses() {
  const api = useAuthedApi();
  const teachingDept = useOptionalTeachingDepartment();
  const activeDeptId = teachingDept?.activeDeptId ?? null;
  const deptLoading = teachingDept?.loading ?? false;
  const [courses, setCourses] = useState<FacultyCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (deptLoading) return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await api.get<FacultyCourse[]>(
          withTeachingDeptId('/api/academics/faculty/workspaces/courses', activeDeptId),
        );
        if (!cancelled) {
          const uniqueMap = new Map<string, FacultyCourse>();
          for (const c of data) {
            if (!uniqueMap.has(c.course_id)) {
              uniqueMap.set(c.course_id, c);
            }
          }
          const uniqueData = withFacultyDemoFallback(
            Array.from(uniqueMap.values()),
            facultyDemoCourses(),
            isEmptyArray,
          );
          setCourses(uniqueData);
          setError(uniqueData.length === 0 ? 'No courses allocated to your timetable yet.' : null);
        }
      } catch (e) {
        if (!cancelled) {
          const demo = withFacultyDemoFallback([], facultyDemoCourses(), isEmptyArray);
          setCourses(demo);
          setError(
            demo.length > 0 ? null : e instanceof Error ? e.message : 'Failed to load courses',
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, activeDeptId, deptLoading]);

  return { courses, loading, error };
}
