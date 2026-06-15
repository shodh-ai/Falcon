'use client';

import { useMemo } from 'react';

import { useAuthedApi } from '@/lib/api';
import { useHrEntity } from '@/context/HrEntityContext';

const ENTITY_OPTIONAL_PATHS = ['/api/hr/entities', '/api/hr/admin/permissions'];

function isEntityOptionalPath(path: string): boolean {
  const base = path.split('?')[0];
  return ENTITY_OPTIONAL_PATHS.some((prefix) => base === prefix || base.startsWith(`${prefix}/`));
}

function entityRequiredError() {
  return new Error('Organization entity required. Select an entity from the header switcher.');
}

export function useHrApi() {
  const api = useAuthedApi();
  const { withEntityQuery, entityHeaders, entityId, entityReady, loading } = useHrEntity();

  return useMemo(() => {
    function resolveRequest<T>(
      path: string,
      invoke: (resolvedPath: string, headers: Record<string, string>) => Promise<T>,
    ): Promise<T> {
      if (entityId != null) {
        return invoke(withEntityQuery(path), entityHeaders);
      }
      if (isEntityOptionalPath(path)) {
        return invoke(path, {});
      }
      if (loading) {
        return new Promise<T>(() => {});
      }
      return Promise.reject(entityRequiredError());
    }

    return {
      entityId,
      entityReady,
      get: <T>(path: string) => resolveRequest(path, (p, h) => api.get<T>(p, h)),
      post: <T>(path: string, body?: unknown) =>
        resolveRequest(path, (p, h) => api.post<T>(p, body, h)),
      patch: <T>(path: string, body?: unknown) =>
        resolveRequest(path, (p, h) => api.patch<T>(p, body, h)),
      put: <T>(path: string, body?: unknown) =>
        resolveRequest(path, (p, h) => api.put<T>(p, body, h)),
      del: <T>(path: string) => resolveRequest(path, (p, h) => api.del<T>(p, h)),
    };
  }, [api, withEntityQuery, entityHeaders, entityId, entityReady, loading]);
}
