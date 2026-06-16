'use client';

import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';
import { useAuth } from '@/context/AuthContext';
import { useHrApi } from '@/lib/api/use-hr-api';
import { useHrEntity } from '@/context/HrEntityContext';

export function useHrSWR<T>(
  key: string | (string | number | boolean | null | undefined)[] | null,
  path: string,
  config?: SWRConfiguration<T>,
): {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<T>;
} {
  const { token, isAuthenticated } = useAuth();
  const api = useHrApi();
  const { entityReady, entityId } = useHrEntity();

  const swrKey =
    isAuthenticated && token && entityReady && entityId != null && key
      ? Array.isArray(key)
        ? [token, entityId, ...key]
        : [token, entityId, key]
      : null;

  const result = useSWR<T>(
    swrKey,
    () => api.get<T>(path),
    { revalidateOnFocus: true, dedupingInterval: 30_000, ...config },
  );

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    mutate: result.mutate,
  };
}
