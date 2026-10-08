import {
  resolveTenantFromHost,
  resolveTenantSubdomain,
} from './resolve-tenant-subdomain';

describe('tenant subdomain resolution', () => {
  const previousDefault = process.env.DEFAULT_TENANT_SUBDOMAIN;
  const previousDedicated = process.env.DEDICATED_APP_HOSTS;

  beforeEach(() => {
    process.env.DEFAULT_TENANT_SUBDOMAIN = 'sgvu';
    process.env.DEDICATED_APP_HOSTS =
      'falcon.jataka.io,apifalcon.jataka.io';
  });

  afterAll(() => {
    if (previousDefault === undefined) {
      delete process.env.DEFAULT_TENANT_SUBDOMAIN;
    } else {
      process.env.DEFAULT_TENANT_SUBDOMAIN = previousDefault;
    }
    if (previousDedicated === undefined) {
      delete process.env.DEDICATED_APP_HOSTS;
    } else {
      process.env.DEDICATED_APP_HOSTS = previousDedicated;
    }
  });

  it('uses an explicit tenant on the shared API host', () => {
    expect(resolveTenantFromHost('apifalcon.jataka.io', 'gvmc')).toBe(
      'gvmc',
    );
  });

  it('uses the default tenant on the shared API host without an override', () => {
    expect(resolveTenantFromHost('apifalcon.jataka.io')).toBe('sgvu');
  });

  it('does not allow a shared-host alias to replace the default tenant', () => {
    expect(resolveTenantSubdomain('apifalcon')).toBe('sgvu');
  });
});
