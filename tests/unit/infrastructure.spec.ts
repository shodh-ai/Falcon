import { testEnv } from '../helpers/env';
import { buildUser, buildHodUser, buildDeanUser } from '../factories/user.factory';
import { buildTenant } from '../factories/tenant.factory';
import { TEST_USERS, TEST_PASSWORD } from '../helpers/test-users';

describe('Unit test infrastructure', () => {
  it('loads test environment from .env.test', () => {
    const env = testEnv();
    expect(env.nodeEnv).toBe('test');
    expect(env.db.database).toBeTruthy();
  });

  it('builds user factories with unique ids', () => {
    const a = buildUser({ role: 'Faculty' });
    const b = buildUser({ role: 'Faculty' });
    expect(a.user_id).not.toBe(b.user_id);
    expect(a.tenant_id).toBeTruthy();
  });

  it('builds role-specific factory helpers', () => {
    const hod = buildHodUser(10, { name: 'ME HOD' });
    expect(hod.role).toBe('HOD');
    expect(hod.dept_id).toBe(10);
    const dean = buildDeanUser();
    expect(dean.role).toBe('Dean');
  });

  it('loads tenant factory defaults', () => {
    const tenant = buildTenant();
    expect(tenant.subdomain).toBe('sgvu');
  });

  it('exposes fixture-backed workspace test users', () => {
    expect(TEST_USERS.faculty.email).toContain('@');
    expect(TEST_USERS.hod.role).toBe('HOD');
    expect(TEST_PASSWORD).toBeTruthy();
  });
});
