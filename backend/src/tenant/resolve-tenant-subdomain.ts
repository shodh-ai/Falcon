const DEFAULT_SUBDOMAIN = 'sgvu';

/** Hostname subdomains that map to DEFAULT_TENANT_SUBDOMAIN (not real tenants). */
const TENANT_SUBDOMAIN_ALIASES = new Set(['falcon', 'apifalcon']);

/** App URLs that are not tenant subdomains (e.g. falcon.jataka.io → sgvu). */
export function isDedicatedAppHost(hostname: string): boolean {
  const host = hostname.split(':')[0].trim().toLowerCase();
  const dedicated = (
    process.env.DEDICATED_APP_HOSTS ?? 'falcon.jataka.io,apifalcon.jataka.io'
  )
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return dedicated.includes(host);
}

export function resolveTenantSubdomain(
  value?: string | null,
  fallback?: string | null,
): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  if (trimmed && !TENANT_SUBDOMAIN_ALIASES.has(trimmed)) return trimmed;

  const fb = (
    fallback ??
    process.env.DEFAULT_TENANT_SUBDOMAIN ??
    DEFAULT_SUBDOMAIN
  ).trim();
  return fb || DEFAULT_SUBDOMAIN;
}

/** Resolve tenant from hostname + optional header/cookie override. */
export function resolveTenantFromHost(
  hostname: string,
  explicitSubdomain?: string | null,
): string {
  const host = hostname.split(':')[0].trim().toLowerCase();
  if (isDedicatedAppHost(host)) {
    return resolveTenantSubdomain(null);
  }
  if (explicitSubdomain?.trim()) {
    return resolveTenantSubdomain(explicitSubdomain);
  }
  return resolveTenantSubdomain(extractSubdomainFromHost(host));
}

export function extractSubdomainFromHost(
  hostname: string,
  baseDomain?: string | null,
): string | null {
  const host = hostname.split(':')[0].trim().toLowerCase();
  const base = (
    baseDomain ??
    process.env.SAAS_BASE_DOMAIN ??
    'localhost'
  ).trim();

  if (!host || !base) return null;

  if (base === 'localhost') {
    if (host.endsWith('.localhost')) {
      const sub = host.replace('.localhost', '');
      return sub && !sub.includes('.') ? sub : null;
    }
    return null;
  }

  if (host === base) return null;

  if (host.endsWith(`.${base}`)) {
    const sub = host.slice(0, -(base.length + 1));
    return sub && !sub.includes('.') ? sub : null;
  }

  return null;
}
