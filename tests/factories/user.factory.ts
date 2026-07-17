import { randomUUID } from 'crypto';
import tenantFixture from '../fixtures/tenants.json';

export type TestUserRecord = {
  user_id: string;
  tenant_id: string;
  name: string;
  official_email: string;
  role: string;
  dept_id: number | null;
  password: string;
};

export function buildUser(overrides: Partial<TestUserRecord> = {}): TestUserRecord {
  const id = randomUUID();
  return {
    user_id: id,
    tenant_id: tenantFixture.default.tenant_id,
    name: overrides.name ?? `Test User ${id.slice(0, 8)}`,
    official_email: overrides.official_email ?? `test.${id.slice(0, 8)}@mygyanvihar.com`,
    role: overrides.role ?? 'Faculty',
    dept_id: overrides.dept_id ?? null,
    password: overrides.password ?? 'password123',
    ...overrides,
  };
}

export function buildFacultyUser(overrides: Partial<TestUserRecord> = {}) {
  return buildUser({ role: 'Faculty', ...overrides });
}

export function buildHodUser(deptId: number, overrides: Partial<TestUserRecord> = {}) {
  return buildUser({ role: 'HOD', dept_id: deptId, ...overrides });
}

export function buildDeanUser(overrides: Partial<TestUserRecord> = {}) {
  return buildUser({ role: 'Dean', ...overrides });
}

export function buildExamCellUser(
  role: 'examcell' | 'examadmin' | 'examoperator' = 'examcell',
  overrides: Partial<TestUserRecord> = {},
) {
  return buildUser({ role, ...overrides });
}
