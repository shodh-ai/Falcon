'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { DEMO_STUDENT, DEMO_SUBJECTS } from '@/lib/mock/student-portal-demo';
import { isStudentDemoModeEnabled } from '@/lib/student-demo-mode';

export type StudentCourse = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  semester: number;
  course_type: string;
};

function demoCourses(): StudentCourse[] {
  return DEMO_SUBJECTS.map((s) => ({
    course_id: s.course_id,
    course_code: s.course_code,
    course_name: s.course_name,
    credits: s.credits,
    semester: s.semester,
    course_type: s.course_type,
  }));
}

type EnrollmentResponse = Array<{
  enrollment_id: string;
  semester: number;
  status: string;
  course: {
    course_id: string;
    course_code: string;
    course_name: string;
    credits: number;
    is_elective?: boolean;
  };
}>;

export function useStudentCourses() {
  const api = useAuthedApi();
  const { user } = useAuth();
  const userId = user?.user_id ?? null;
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [currentSemester, setCurrentSemester] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) {
      setCourses([]);
      setCurrentSemester(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const rows = await api.get<EnrollmentResponse>(
          '/api/academics/courses/my-enrollments',
        );
        const active = (rows ?? []).filter(
          (row) => row.status === 'ENROLLED' || row.status === 'COMPLETED',
        );
        const semester =
          active.length > 0
            ? Math.max(...active.map((row) => Number(row.semester)))
            : null;
        const enrolled =
          semester == null
            ? []
            : active.filter((row) => Number(row.semester) === semester);

        if (!cancelled) {
          if (enrolled.length === 0) {
            if (isStudentDemoModeEnabled()) {
              setCurrentSemester(DEMO_STUDENT.semester);
              setCourses(demoCourses());
              setError(null);
            } else {
              setCurrentSemester(null);
              setCourses([]);
              setError('No subjects enrolled for this semester yet.');
            }
          } else {
            setCurrentSemester(semester);
            setCourses(
              enrolled.map((row) => ({
                course_id: row.course.course_id,
                course_code: row.course.course_code,
                course_name: row.course.course_name,
                credits: Number(row.course.credits) || 0,
                semester: Number(row.semester),
                course_type: row.course.is_elective ? 'ELECTIVE' : 'CORE',
              })),
            );
            setError(null);
          }
        }
      } catch (e) {
        if (!cancelled) {
          if (isStudentDemoModeEnabled()) {
            setCurrentSemester(DEMO_STUDENT.semester);
            setCourses(demoCourses());
            setError(null);
          } else {
            setCourses([]);
            setError(e instanceof Error ? e.message : 'Failed to load courses');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, userId]);

  return { courses, currentSemester, loading, error };
}
