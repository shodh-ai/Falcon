'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { API_URL } from '@/lib/api/client';
import { getSubdomainFromClient } from '@/lib/tenant';

export type OrgEntity = {
  entity_id: number;
  entity_code: string;
  entity_name: string;
};

type HrEntityContextValue = {
  entities: OrgEntity[];
  entityId: number | null;
  /** True when entity list has loaded and a valid entity is selected. */
  entityReady: boolean;
  entityVersion: number;
  setEntityId: (id: number) => void;
  withEntityQuery: (path: string) => string;
  entityHeaders: Record<string, string>;
  loading: boolean;
  refreshEntities: () => Promise<void>;
};

const STORAGE_KEY = 'hr_selected_entity_id';

const HrEntityContext = createContext<HrEntityContextValue | undefined>(undefined);

function mapAllowedEntities(
  rows: Array<{ id: number; name: string; code: string }> | undefined,
): OrgEntity[] {
  return (rows ?? []).map((e) => ({
    entity_id: e.id,
    entity_code: e.code,
    entity_name: e.name,
  }));
}

function mapApiEntities(
  rows: Array<Partial<OrgEntity> & { id?: number; name?: string; code?: string }>,
): OrgEntity[] {
  return rows.map((e) => ({
    entity_id: Number(e.entity_id ?? e.id),
    entity_code: e.entity_code ?? e.code ?? '',
    entity_name: e.entity_name ?? e.name ?? '',
  }));
}

function intersectWithAllowed(list: OrgEntity[], allowed: OrgEntity[]): OrgEntity[] {
  if (allowed.length === 0) return list;
  const allowedIds = new Set(allowed.map((e) => e.entity_id));
  const scoped = list.filter((e) => allowedIds.has(e.entity_id));
  return scoped.length > 0 ? scoped : list;
}

export function HrEntityProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [entities, setEntities] = useState<OrgEntity[]>([]);
  const [entityId, setEntityIdState] = useState<number | null>(null);
  const [entityVersion, setEntityVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  const authAllowed = useMemo(
    () => mapAllowedEntities(user?.allowed_entities),
    [user?.allowed_entities],
  );

  const applyEntityList = useCallback(
    (list: OrgEntity[]) => {
      const scoped = intersectWithAllowed(list, authAllowed);
      setEntities(scoped);
      const stored = localStorage.getItem(STORAGE_KEY);
      const storedId = stored ? Number(stored) : null;
      const valid = scoped.find((e) => e.entity_id === storedId);
      setEntityIdState(valid?.entity_id ?? scoped[0]?.entity_id ?? null);
    },
    [authAllowed],
  );

  const refreshEntities = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/api/hr/entities`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-tenant-subdomain': getSubdomainFromClient(),
        },
      });
      if (res.ok) {
        const list = mapApiEntities((await res.json()) as OrgEntity[]);
        if (list.length > 0) {
          applyEntityList(list);
          return;
        }
      }
    } catch {
      /* fall through to auth payload */
    }
    if (authAllowed.length) {
      applyEntityList(authAllowed);
      return;
    }
    setEntities([]);
    setEntityIdState(null);
  }, [token, authAllowed, applyEntityList]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (authAllowed.length) {
      applyEntityList(authAllowed);
    }
    void refreshEntities().finally(() => setLoading(false));
  }, [token, authAllowed, refreshEntities, applyEntityList]);

  const setEntityId = useCallback((id: number) => {
    if (!entities.some((e) => e.entity_id === id)) return;
    setEntityIdState(id);
    setEntityVersion((v) => v + 1);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, [entities]);

  const withEntityQuery = useCallback(
    (path: string) => {
      if (!entityId) return path;
      const sep = path.includes('?') ? '&' : '?';
      return `${path}${sep}entity_id=${entityId}`;
    },
    [entityId],
  );

  const entityHeaders = useMemo((): Record<string, string> => {
    return entityId ? { 'x-entity-id': String(entityId) } : {};
  }, [entityId]);

  const entityReady = !loading && entityId != null;

  const value = useMemo(
    () => ({
      entities,
      entityId,
      entityReady,
      entityVersion,
      setEntityId,
      withEntityQuery,
      entityHeaders,
      loading,
      refreshEntities,
    }),
    [entities, entityId, entityReady, entityVersion, setEntityId, withEntityQuery, entityHeaders, loading, refreshEntities],
  );

  return <HrEntityContext.Provider value={value}>{children}</HrEntityContext.Provider>;
}

export function useHrEntity() {
  const ctx = useContext(HrEntityContext);
  if (!ctx) throw new Error('useHrEntity must be used within HrEntityProvider');
  return ctx;
}

export function useOptionalHrEntity() {
  return useContext(HrEntityContext);
}
