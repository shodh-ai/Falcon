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

type EnrollmentRow = {
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
};

type EnrollmentResponse =
  | EnrollmentRow[]
  | {
      current_semester: number;
      enrollments: EnrollmentRow[];
    };

function parseEnrollmentResponse(payload: EnrollmentResponse | null | undefined): {
  currentSemester: number | null;
  rows: EnrollmentRow[];
} {
  if (!payload) return { currentSemester: null, rows: [] };

  if (Array.isArray(payload)) {
    const active = payload.filter(
      (row) => row.status === 'ENROLLED' || row.status === 'COMPLETED',
    );
    const semester =
      active.length > 0
        ? Math.max(...active.map((row) => Number(row.semester)))
        : null;
    const rows =
      semester == null
        ? []
        : active.filter((row) => Number(row.semester) === semester);
    return { currentSemester: semester, rows };
  }

  const rows = (payload.enrollments ?? []).filter(
    (row) => row.status === 'ENROLLED' || row.status === 'COMPLETED',
  );
  return {
    currentSemester: Number(payload.current_semester) || null,
    rows,
  };
}

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
        const payload = await api.get<EnrollmentResponse>(
          '/api/academics/courses/my-enrollments',
        );
        const { currentSemester: semester, rows } =
          parseEnrollmentResponse(payload);

        if (!cancelled) {
          setCurrentSemester(semester);
          setCourses(
            rows.map((row) => ({
              course_id: row.course.course_id,
              course_code: row.course.course_code,
              course_name: row.course.course_name,
              credits: Number(row.course.credits) || 0,
              semester: Number(row.semester),
              course_type: row.course.is_elective ? 'ELECTIVE' : 'CORE',
            })),
          );
          setError(
            rows.length === 0
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
