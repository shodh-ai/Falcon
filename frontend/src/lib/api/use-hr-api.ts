'use client';

import { useMemo } from 'react';
import { useAuthedApi } from '@/lib/api';
import { useHrEntity } from '@/context/HrEntityContext';

export function useHrApi() {
  const api = useAuthedApi();
  const { withEntityQuery } = useHrEntity();

  return useMemo(
    () => ({
      get: <T>(path: string) => api.get<T>(withEntityQuery(path)),
      post: <T>(path: string, body?: unknown) => api.post<T>(withEntityQuery(path), body),
      patch: <T>(path: string, body?: unknown) => api.patch<T>(withEntityQuery(path), body),
      put: <T>(path: string, body?: unknown) => api.put<T>(withEntityQuery(path), body),
      del: <T>(path: string) => api.del<T>(withEntityQuery(path)),
    }),
    [api, withEntityQuery],
  );
}
