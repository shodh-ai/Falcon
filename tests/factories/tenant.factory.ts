import tenantFixture from '../fixtures/tenants.json';

export type TestTenant = {
  tenant_id: string;
  subdomain: string;
  name: string;
};

export function buildTenant(overrides: Partial<TestTenant> = {}): TestTenant {
  return {
    ...tenantFixture.default,
    ...overrides,
  };
}
