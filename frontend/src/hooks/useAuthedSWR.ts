'use client';

import useSWR, { type SWRConfiguration, type KeyedMutator } from 'swr';
import { useAuth } from '@/context/AuthContext';
import { useAuthedApi } from '@/lib/api';

export function useAuthedSWR<T>(
  key: string | (string | number | boolean | null | undefined)[] | null,
  fetcher: (api: ReturnType<typeof useAuthedApi>) => Promise<T>,
  config?: SWRConfiguration<T>,
): {
  data: T | undefined;
  error: unknown;
  isLoading: boolean;
  isValidating: boolean;
  mutate: KeyedMutator<T>;
} {
  const { token, isAuthenticated } = useAuth();
  const api = useAuthedApi();
  const swrKey =
    isAuthenticated && token && key
      ? Array.isArray(key)
        ? [token, ...key]
        : [token, key]
      : null;

  const result = useSWR<T>(
    swrKey,
    () => fetcher(api),
    { revalidateOnFocus: true, dedupingInterval: 5_000, ...config },
  );

  return {
    data: result.data,
    error: result.error,
    isLoading: result.isLoading,
    isValidating: result.isValidating,
    mutate: result.mutate,
  };
}
