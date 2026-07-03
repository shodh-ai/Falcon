'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';

export type StudentCourse = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  semester: number;
  course_type: string;
};

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
          setError(
            enrolled.length === 0
              ? 'No subjects enrolled for this semester yet.'
              : null,
          );
        }
      } catch (e) {
        if (!cancelled) {
          setCourses([]);
          setError(e instanceof Error ? e.message : 'Failed to load courses');
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
