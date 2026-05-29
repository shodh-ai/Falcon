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
import {
  applyTenantTheme,
  fetchTenantBranding,
  getSubdomainFromClient,
  hasFeature,
  type TenantBranding,
} from '@/lib/tenant';

type TenantContextValue = {
  branding: TenantBranding | null;
  loading: boolean;
  subdomain: string;
  hasFeature: (feature: string) => boolean;
  refresh: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export function TenantProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<TenantBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const subdomain = getSubdomainFromClient();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTenantBranding(subdomain);
      setBranding(data);
      applyTenantTheme(data);
      if (typeof document !== 'undefined') {
        document.title = `${data.name} Portal`;
      }
    } catch {
      setBranding(null);
    } finally {
      setLoading(false);
    }
  }, [subdomain]);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo<TenantContextValue>(
    () => ({
      branding,
      loading,
      subdomain,
      hasFeature: (feature) => hasFeature(branding, feature),
      refresh: load,
    }),
    [branding, loading, subdomain, load],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within TenantProvider');
  }
  return ctx;
}
