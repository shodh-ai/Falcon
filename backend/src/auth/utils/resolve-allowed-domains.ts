import type { Tenant } from '../../entities/tenant.entity';

/**
 * Merges tenant JSONB settings with env fallbacks.
 * SGVU uses both mygyanvihar.com (Google Workspace) and mygyanvihar.org.
 */
export function resolveAllowedEmailDomains(
  tenant: Tenant,
  envDomain?: string,
): string[] {
  const fromSettings = tenant.settings?.allowed_email_domains;
  const settingsList = Array.isArray(fromSettings)
    ? fromSettings.map((d) => String(d).toLowerCase())
    : [];

  const domains = new Set<string>(settingsList);
  if (envDomain) {
    domains.add(envDomain.toLowerCase());
  }

  const extras = process.env.ALLOWED_EMAIL_DOMAINS;
  if (extras) {
    for (const d of extras.split(',')) {
      const trimmed = d.trim().toLowerCase();
      if (trimmed) domains.add(trimmed);
    }
  }

  return [...domains];
}
