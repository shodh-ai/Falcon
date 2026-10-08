"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { getApiBaseUrl } from "@/lib/api-base-url";
import { getSubdomainFromClient } from "@/lib/tenant";
import type {
  BusinessModuleKey,
  RuntimeModuleManifest,
} from "@/lib/launch-modules";

type ModuleRuntimeContextValue = {
  manifest: RuntimeModuleManifest | null;
  loading: boolean;
  degraded: boolean;
  refresh: () => Promise<void>;
  module: (
    key: BusinessModuleKey,
  ) => RuntimeModuleManifest["modules"][number] | undefined;
};

const ModuleRuntimeContext = createContext<
  ModuleRuntimeContextValue | undefined
>(undefined);
const unconfiguredRuntime: ModuleRuntimeContextValue = {
  manifest: null,
  loading: false,
  degraded: true,
  refresh: async () => undefined,
  module: () => undefined,
};

export function ModuleRuntimeProvider({ children }: { children: ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [manifest, setManifest] = useState<RuntimeModuleManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [degraded, setDegraded] = useState(false);
  const loadedOnce = useRef(false);

  const refresh = useCallback(async () => {
    if (!token || !isAuthenticated) {
      setManifest(null);
      setLoading(false);
      loadedOnce.current = false;
      return;
    }
    if (!loadedOnce.current) setLoading(true);
    try {
      const response = await fetch(
        `${getApiBaseUrl()}/api/platform/modules/runtime`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "x-tenant-subdomain": getSubdomainFromClient(),
          },
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new Error(`Runtime module manifest failed (${response.status})`);
      setManifest(await response.json());
      setDegraded(false);
    } catch {
      // During rolling deployment the API remains authoritative. Keeping the
      // prior manifest avoids a false client-side outage.
      setDegraded(true);
    } finally {
      loadedOnce.current = true;
      setLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    void refresh();
    if (!token) return;
    const interval = window.setInterval(() => void refresh(), 30_000);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh, token]);

  const value = useMemo<ModuleRuntimeContextValue>(
    () => ({
      manifest,
      loading,
      degraded,
      refresh,
      module: (key) => manifest?.modules.find((item) => item.moduleKey === key),
    }),
    [degraded, loading, manifest, refresh],
  );

  return (
    <ModuleRuntimeContext.Provider value={value}>
      {children}
    </ModuleRuntimeContext.Provider>
  );
}

export function useModuleRuntime() {
  const value = useContext(ModuleRuntimeContext);
  return value ?? unconfiguredRuntime;
}
