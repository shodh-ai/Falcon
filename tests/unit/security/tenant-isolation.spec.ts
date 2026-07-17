import {
  extractSubdomainFromHost,
  resolveTenantSubdomain,
} from '../../../backend/src/tenant/resolve-tenant-subdomain';

describe('Tenant subdomain resolution', () => {
  it('uses explicit subdomain value', () => {
    expect(resolveTenantSubdomain('SGVU')).toBe('sgvu');
  });

  it('falls back to default tenant', () => {
    expect(resolveTenantSubdomain('', 'sgvu')).toBe('sgvu');
  });

  it('extracts subdomain from saas host', () => {
    expect(extractSubdomainFromHost('sgvu.mygyanvihar.com', 'mygyanvihar.com')).toBe('sgvu');
  });

  it('returns null for apex domain', () => {
    expect(extractSubdomainFromHost('mygyanvihar.com', 'mygyanvihar.com')).toBeNull();
  });

  it('extracts subdomain from localhost dev host', () => {
    expect(extractSubdomainFromHost('sgvu.localhost', 'localhost')).toBe('sgvu');
  });
});

describe('Multi-tenant isolation helpers', () => {
  it('prevents cross-tenant subdomain bleed in resolver', () => {
    const tenantA = resolveTenantSubdomain('school-a');
    const tenantB = resolveTenantSubdomain('school-b');
    expect(tenantA).not.toBe(tenantB);
  });
});
