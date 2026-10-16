import { ForbiddenException } from '@nestjs/common';

/** Authenticated requests must never fall back to another tenant's data. */
export function requireTenantId(tenantId?: string | null): string {
  const value = tenantId?.trim();
  if (!value) {
    throw new ForbiddenException('Tenant context required');
  }
  return value;
}
