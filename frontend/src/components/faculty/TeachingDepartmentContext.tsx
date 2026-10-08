'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthedApi } from '@/lib/api';
import type {
  TeachingDepartment,
  TeachingDepartmentsResponse,
} from '@/lib/faculty/teaching-departments';

type TeachingDepartmentContextValue = {
  loading: boolean;
  isMultiDepartment: boolean;
  departments: TeachingDepartment[];
  homeDeptId: number | null;
  activeDeptId: number | null;
  activeDepartment: TeachingDepartment | null;
  setActiveDeptId: (deptId: number) => void;
};

const TeachingDepartmentContext = createContext<TeachingDepartmentContextValue | null>(null);

function pickDefaultDeptId(
  data: TeachingDepartmentsResponse,
  urlDeptId: number | null,
): number | null {
  if (!data.is_multi_department) return null;
  if (urlDeptId != null && data.departments.some((d) => d.dept_id === urlDeptId)) {
    return urlDeptId;
  }
  if (data.home_dept_id != null && data.departments.some((d) => d.dept_id === data.home_dept_id)) {
    return data.home_dept_id;
  }
  return data.departments[0]?.dept_id ?? null;
}

function TeachingDepartmentProviderInner({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<TeachingDepartmentsResponse | null>(null);

  const urlDeptRaw = searchParams.get('deptId');
  const urlDeptId =
    urlDeptRaw != null && urlDeptRaw !== '' && Number.isFinite(Number(urlDeptRaw))
      ? Number(urlDeptRaw)
      : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await api.get<TeachingDepartmentsResponse>(
          '/api/academics/faculty/teaching-departments',
        );
        if (!cancelled) setData(response);
      } catch {
        if (!cancelled) {
          setData({
            is_multi_department: false,
            home_dept_id: null,
            departments: [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  const activeDeptId = useMemo(() => {
    if (!data?.is_multi_department) return null;
    return pickDefaultDeptId(data, urlDeptId);
  }, [data, urlDeptId]);

  useEffect(() => {
    if (!data?.is_multi_department || activeDeptId == null) return;
    if (urlDeptId === activeDeptId) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set('deptId', String(activeDeptId));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [activeDeptId, data?.is_multi_department, pathname, router, searchParams, urlDeptId]);

  const setActiveDeptId = useCallback(
    (deptId: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('deptId', String(deptId));
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const activeDepartment =
    data?.departments.find((dept) => dept.dept_id === activeDeptId) ?? null;

  const value = useMemo<TeachingDepartmentContextValue>(
    () => ({
      loading,
      isMultiDepartment: data?.is_multi_department ?? false,
      departments: data?.departments ?? [],
      homeDeptId: data?.home_dept_id ?? null,
      activeDeptId,
      activeDepartment,
      setActiveDeptId,
    }),
    [activeDeptId, activeDepartment, data, loading, setActiveDeptId],
  );

  return (
    <TeachingDepartmentContext.Provider value={value}>{children}</TeachingDepartmentContext.Provider>
  );
}

export function TeachingDepartmentProvider({ children }: { children: ReactNode }) {
  return <TeachingDepartmentProviderInner>{children}</TeachingDepartmentProviderInner>;
}

export function useTeachingDepartment() {
  const context = useContext(TeachingDepartmentContext);
  if (!context) {
    throw new Error('useTeachingDepartment must be used within TeachingDepartmentProvider');
  }
  return context;
}

export function useOptionalTeachingDepartment() {
  return useContext(TeachingDepartmentContext);
}
