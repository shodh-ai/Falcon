'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export type StudentCourse = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
  semester: number;
  course_type: string;
};

type RegistrationResponse = {
  current_semester: number;
  enrollments: Array<{
    course_id: string;
    course_code: string;
    course_name: string;
    credits: number;
    semester: number;
    course_type?: string;
    status?: string;
  }>;
};

export function useStudentCourses() {
  const api = useAuthedApi();
  const [courses, setCourses] = useState<StudentCourse[]>([]);
  const [currentSemester, setCurrentSemester] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<RegistrationResponse>('/api/student/registration');
        const semester = data.current_semester;
        const enrolled = (data.enrollments ?? []).filter(
          (row) =>
            Number(row.semester) === semester &&
            (!row.status || row.status === 'ENROLLED' || row.status === 'COMPLETED'),
        );
        if (!cancelled) {
          setCurrentSemester(semester);
          setCourses(
            enrolled.map((row) => ({
              course_id: row.course_id,
              course_code: row.course_code,
              course_name: row.course_name,
              credits: Number(row.credits) || 0,
              semester: Number(row.semester),
              course_type: row.course_type ?? 'CORE',
            })),
          );
          setError(enrolled.length === 0 ? 'No subjects enrolled for this semester yet.' : null);
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
  }, [api]);

  return { courses, currentSemester, loading, error };
}
