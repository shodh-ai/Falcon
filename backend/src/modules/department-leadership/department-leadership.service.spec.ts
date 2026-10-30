import { DataSource } from 'typeorm';
import { CampusScopeService } from '../../common/campus-scope/campus-scope.service';
import { DepartmentLeadershipService } from './department-leadership.service';

describe('flexible leadership tenant boundary', () => {
  it('does not change the global HOD when another active tenant uses the department', async () => {
    const statements: string[] = [];
    const manager = {
      query: jest.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM department_leadership_changes')) return [];
        if (sql.includes('SELECT * FROM department_leadership')) return [];
        if (sql.includes('SELECT o.kind,a.user_id')) return [];
        if (sql.includes('u.tenant_id<>$2')) return [{ exists: true }];
        if (sql.includes('pg_advisory_xact_lock')) return [];
        throw new Error(`Unexpected query: ${sql}`);
      }),
    };
    const db = {
      query: jest.fn(async () => [{ dept_id: 17 }]),
      transaction: jest.fn(async (_isolation: string, work: (m: typeof manager) => Promise<unknown>) => work(manager)),
    } as unknown as DataSource;
    const campus = {
      resolveCampusIds: jest.fn(async () => null),
    } as unknown as CampusScopeService;
    const service = new DepartmentLeadershipService(db, campus);

    await expect(service.configureFlexible(
      { tenant_id: 'tenant-a', user_id: 'super-admin', role: 'SuperAdmin' },
      17,
      { hod_user_id: null, principal_user_id: null, dean_user_id: null,
        higher_officer_id: 'higher-officer' },
      0,
      'change-1',
    )).rejects.toThrow('shared by another tenant');
    expect(statements.some((sql) => sql.includes('UPDATE departments SET hod_user_id'))).toBe(false);
    expect(statements.some((sql) => sql.includes('INSERT INTO department_leadership'))).toBe(false);
  });
});
