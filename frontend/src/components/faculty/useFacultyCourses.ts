'use client';

import { useEffect, useState } from 'react';
import { useAuthedApi } from '@/lib/api';

export type FacultyCourse = {
  course_id: string;
  course_code: string;
  course_name: string;
  credits: number;
};

export function useFacultyCourses() {
  const api = useAuthedApi();
  const [courses, setCourses] = useState<FacultyCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.get<FacultyCourse[]>('/api/academics/faculty/workspaces/courses');
        if (!cancelled) setCourses(data);
      } catch {
        if (!cancelled) setCourses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return { courses, loading };
}
