'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/notifications/falcon-toast';
import { useAuthedApi } from '@/lib/api';

export type DeanDepartment = {
  dept_id: number;
  dept_name: string;
  hod_name?: string | null;
};

let cachedDepartments: DeanDepartment[] | null = null;
let cachePromise: Promise<DeanDepartment[]> | null = null;

export function useDeanDepartments() {
  const api = useAuthedApi();
  const [departments, setDepartments] = useState<DeanDepartment[]>(
    cachedDepartments ?? [],
  );
  const [loading, setLoading] = useState(!cachedDepartments);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (cachedDepartments) {
      setDepartments(cachedDepartments);
      setLoading(false);
      return cachedDepartments;
    }
    if (cachePromise) {
      const data = await cachePromise;
      setDepartments(data);
      setLoading(false);
      return data;
    }
    setLoading(true);
    setError(null);
    cachePromise = api
      .get<DeanDepartment[]>('/api/academics/dean/departments')
      .then((data) => {
        cachedDepartments = data;
        return data;
      })
      .catch((err: Error) => {
        cachePromise = null;
        setError(err.message || 'Failed to load departments');
        toast.error('Failed to load school departments');
        return [] as DeanDepartment[];
      });
    const data = await cachePromise;
    setDepartments(data);
    setLoading(false);
    return data;
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  return { departments, loading, error, reload: load };
}

export function invalidateDeanDepartmentsCache() {
  cachedDepartments = null;
  cachePromise = null;
}
