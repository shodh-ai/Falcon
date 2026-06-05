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
  entityVersion: number;
  setEntityId: (id: number) => void;
  withEntityQuery: (path: string) => string;
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

export function HrEntityProvider({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuth();
  const [entities, setEntities] = useState<OrgEntity[]>([]);
  const [entityId, setEntityIdState] = useState<number | null>(null);
  const [entityVersion, setEntityVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  const applyEntityList = useCallback((list: OrgEntity[]) => {
    setEntities(list);
    const stored = localStorage.getItem(STORAGE_KEY);
    const storedId = stored ? Number(stored) : null;
    const valid = list.find((e) => e.entity_id === storedId);
    setEntityIdState(valid?.entity_id ?? list[0]?.entity_id ?? null);
  }, []);

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
        applyEntityList((await res.json()) as OrgEntity[]);
        return;
      }
    } catch {
      /* fall through to auth payload */
    }
    if (user?.allowed_entities?.length) {
      applyEntityList(mapAllowedEntities(user.allowed_entities));
    }
  }, [token, user?.allowed_entities, applyEntityList]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    if (user?.allowed_entities?.length) {
      applyEntityList(mapAllowedEntities(user.allowed_entities));
    }
    void refreshEntities().finally(() => setLoading(false));
  }, [token, user?.allowed_entities, refreshEntities, applyEntityList]);

  const setEntityId = useCallback((id: number) => {
    setEntityIdState(id);
    setEntityVersion((v) => v + 1);
    localStorage.setItem(STORAGE_KEY, String(id));
  }, []);

  const withEntityQuery = useCallback(
    (path: string) => {
      if (!entityId) return path;
      const sep = path.includes('?') ? '&' : '?';
      return `${path}${sep}entity_id=${entityId}`;
    },
    [entityId],
  );

  const value = useMemo(
    () => ({ entities, entityId, entityVersion, setEntityId, withEntityQuery, loading, refreshEntities }),
    [entities, entityId, entityVersion, setEntityId, withEntityQuery, loading, refreshEntities],
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
