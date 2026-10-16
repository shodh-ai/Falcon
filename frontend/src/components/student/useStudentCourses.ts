'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';
import { withStudentReadTimeout } from '@/lib/student-read-request';

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
  const tenantId = user?.tenant_id ?? null;
  const [revision, setRevision] = useState(0);
  const [response, setResponse] = useState<{
    api: ReturnType<typeof useAuthedApi>;
    userId: string;
    tenantId: string | null;
    revision: number;
    courses: StudentCourse[];
    currentSemester: number | null;
    error: string | null;
  } | null>(null);
  const retry = useCallback(() => setRevision((current) => current + 1), []);

  useEffect(() => {
    if (!userId) return;

    let active = true;

    (async () => {
      try {
        const payload = await withStudentReadTimeout(
          api.get<EnrollmentResponse>('/api/academics/courses/my-enrollments'),
        );
        const { currentSemester: semester, rows } =
          parseEnrollmentResponse(payload);

        if (active) {
          setResponse({
            api, userId, tenantId, revision,
            currentSemester: semester,
            courses: rows.map((row) => ({
              course_id: row.course.course_id,
              course_code: row.course.course_code,
              course_name: row.course.course_name,
              credits: Number(row.course.credits) || 0,
              semester: Number(row.semester),
              course_type: row.course.is_elective ? 'ELECTIVE' : 'CORE',
            })),
            error: null,
          });
        }
      } catch {
        if (active) {
          setResponse({
            api, userId, tenantId, revision,
            courses: [],
            currentSemester: null,
            error: 'Your courses could not be loaded. Please try again. If the problem continues, contact Help & Support.',
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [api, userId, tenantId, revision]);

  const hasCurrentData = userId != null && response?.userId === userId &&
    response?.tenantId === tenantId && response?.api === api && response?.revision === revision;
  return {
    courses: hasCurrentData ? response.courses : [],
    currentSemester: hasCurrentData ? response.currentSemester : null,
    loading: Boolean(userId && !hasCurrentData),
    error: hasCurrentData ? response.error : null,
    retry,
  };
}
