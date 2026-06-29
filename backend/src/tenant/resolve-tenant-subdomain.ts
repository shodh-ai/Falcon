const DEFAULT_SUBDOMAIN = 'sgvu';

export function resolveTenantSubdomain(
  value?: string | null,
  fallback?: string | null,
): string {
  const trimmed = (value ?? '').trim();
  if (trimmed) return trimmed.toLowerCase();

  const fb = (fallback ?? process.env.DEFAULT_TENANT_SUBDOMAIN ?? DEFAULT_SUBDOMAIN).trim();
  return fb || DEFAULT_SUBDOMAIN;
}

export function extractSubdomainFromHost(
  hostname: string,
  baseDomain?: string | null,
): string | null {
  const host = hostname.split(':')[0].trim().toLowerCase();
  const base = (baseDomain ?? process.env.SAAS_BASE_DOMAIN ?? 'localhost').trim();

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
