export const TENANT_COOKIE = 'falcon_tenant_subdomain';

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
    return process.env.NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
  }

  const fromCookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${TENANT_COOKIE}=`))
    ?.split('=')[1];
  if (fromCookie) return decodeURIComponent(fromCookie);

  const host = window.location.hostname;
  const base = process.env.NEXT_PUBLIC_SAAS_BASE_DOMAIN ?? 'localhost';

  if (base === 'localhost') {
    if (host.endsWith('.localhost')) {
      return host.replace('.localhost', '');
    }
    return process.env.NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
  }

  if (host.endsWith(`.${base}`)) {
    return host.slice(0, -(base.length + 1));
  }

  return process.env.NEXT_PUBLIC_DEFAULT_TENANT_SUBDOMAIN ?? 'sgvu';
}

export async function fetchTenantBranding(subdomain: string): Promise<TenantBranding> {
  const { getApiBaseUrl, getServerApiBaseUrl } = await import('@/lib/api-base-url');
  const apiUrl = typeof window === 'undefined' ? getServerApiBaseUrl() : getApiBaseUrl();
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
