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
import { useAuthedApi } from '@/lib/api';

export type ParentChild = {
  student_user_id: string;
  name: string;
  official_email: string;
  enrollment_number?: string | null;
  department?: string | null;
};

type ParentChildContextValue = {
  children: ParentChild[];
  selectedChild: ParentChild | null;
  selectedChildId: string | null;
  setSelectedChildId: (id: string) => void;
  loading: boolean;
  refresh: () => Promise<void>;
};

const STORAGE_KEY = 'falcon_parent_selected_child';

const ParentChildContext = createContext<ParentChildContextValue | null>(null);

export function ParentChildProvider({ children }: { children: ReactNode }) {
  const api = useAuthedApi();
  const [childList, setChildList] = useState<ParentChild[]>([]);
  const [selectedChildId, setSelectedChildIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const overview = await api.get<{ children: ParentChild[] }>('/api/parent/overview');
      const list = overview.children ?? [];
      setChildList(list);
      if (list.length === 0) {
        setSelectedChildIdState(null);
        return;
      }
      const stored =
        typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
      const valid = list.find((c) => c.student_user_id === stored);
      setSelectedChildIdState(valid?.student_user_id ?? list[0].student_user_id);
    } catch {
      setChildList([]);
      setSelectedChildIdState(null);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSelectedChildId = useCallback((id: string) => {
    setSelectedChildIdState(id);
    if (typeof window !== 'undefined') localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const selectedChild = useMemo(
    () => childList.find((c) => c.student_user_id === selectedChildId) ?? null,
    [childList, selectedChildId],
  );

  const value = useMemo(
    () => ({
      children: childList,
      selectedChild,
      selectedChildId,
      setSelectedChildId,
      loading,
      refresh,
    }),
    [childList, selectedChild, selectedChildId, setSelectedChildId, loading, refresh],
  );

  return <ParentChildContext.Provider value={value}>{children}</ParentChildContext.Provider>;
}

export function useParentChild() {
  const ctx = useContext(ParentChildContext);
  if (!ctx) throw new Error('useParentChild must be used within ParentChildProvider');
  return ctx;
}
