import { afterEach, describe, expect, it } from 'vitest';
import {
  resolveTenantFromHost,
  resolveTenantSubdomain,
} from '../resolve-tenant-subdomain';
import {
  getSubdomainFromClient,
  rememberTenantSubdomain,
} from '../tenant';

describe('shared-host tenant selection', () => {
  const previousHosts = process.env.NEXT_PUBLIC_DEDICATED_APP_HOSTS;

  afterEach(() => {
    document.cookie = 'falcon_tenant_subdomain=; Path=/; Max-Age=0';
    if (previousHosts === undefined) {
      delete process.env.NEXT_PUBLIC_DEDICATED_APP_HOSTS;
    } else {
      process.env.NEXT_PUBLIC_DEDICATED_APP_HOSTS = previousHosts;
    }
  });

  it('keeps the default tenant on the shared Falcon host', () => {
    process.env.NEXT_PUBLIC_DEDICATED_APP_HOSTS = 'falcon.jataka.io';
    expect(resolveTenantFromHost('falcon.jataka.io')).toBe('sgvu');
  });

  it('allows an explicit remembered tenant on the shared Falcon host', () => {
    process.env.NEXT_PUBLIC_DEDICATED_APP_HOSTS = 'falcon.jataka.io';
    expect(resolveTenantFromHost('falcon.jataka.io', 'gvmc')).toBe('gvmc');
  });

  it('does not treat the Falcon hostname alias as a tenant', () => {
    expect(resolveTenantSubdomain('falcon')).toBe('sgvu');
  });

  it('remembers the tenant returned by cross-tenant login', () => {
    rememberTenantSubdomain('GVMC');

    expect(document.cookie).toContain('falcon_tenant_subdomain=gvmc');
    expect(getSubdomainFromClient()).toBe('gvmc');
  });

  it('rejects an invalid tenant returned by login', () => {
    rememberTenantSubdomain('../gvmc');

    expect(document.cookie).not.toContain('falcon_tenant_subdomain');
  });
});
