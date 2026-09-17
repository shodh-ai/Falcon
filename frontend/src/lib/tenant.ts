export const TENANT_COOKIE = 'falcon_tenant_subdomain';

import {
  resolveTenantFromHost,
  resolveTenantSubdomain,
} from '@/lib/resolve-tenant-subdomain';

export type TenantBranding = {
  tenantId: string;
  name: string;
  subdomain: string;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  features: string[];
};

export function getSubdomainFromClient(): string {
  if (typeof window === 'undefined') {
    return resolveTenantSubdomain(null);
  }

  const hostname = window.location.hostname;
  if (hostname) {
    const fromCookie = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${TENANT_COOKIE}=`))
      ?.split('=')[1];
    return resolveTenantFromHost(hostname, fromCookie ? decodeURIComponent(fromCookie) : null);
  }

  return resolveTenantSubdomain(null);
}

export function rememberTenantSubdomain(subdomain: string): void {
  if (typeof document === 'undefined') return;
  const normalized = subdomain.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized)) return;
  document.cookie = `${TENANT_COOKIE}=${encodeURIComponent(normalized)}; Path=/; SameSite=Lax`;
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('tenant_subdomain', normalized);
    } catch {
      // Cookies are authoritative; storage can be unavailable in private mode.
    }
  }
}

export async function fetchTenantBranding(subdomain: string): Promise<TenantBranding> {
  const { getApiBaseUrl } = await import('./api-base-url');
  const apiUrl = getApiBaseUrl();
  const res = await fetch(`${apiUrl}/api/tenants/resolve/${subdomain}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve tenant: ${subdomain}`);
  }
  return res.json();
}

export function applyTenantTheme(branding: TenantBranding) {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.primaryColor);
  root.style.setProperty('--brand-accent', branding.accentColor);
  root.style.setProperty('--sgvu-navy', branding.primaryColor);
  root.style.setProperty('--sgvu-gold', branding.accentColor);
  root.dataset.tenant = branding.subdomain;
}

export function hasFeature(branding: TenantBranding | null, feature: string): boolean {
  return branding?.features.includes(feature) ?? false;
}
