import { isDepartmentInDeanScope } from '../../../backend/src/modules/academics/dean-scope.util';

describe('Dean scope util', () => {
  it('includes department in dean scope', () => {
    expect(isDepartmentInDeanScope(10, [10, 11, 12])).toBe(true);
  });

  it('excludes department outside scope (IDOR prevention)', () => {
    expect(isDepartmentInDeanScope(99, [10, 11])).toBe(false);
  });

  it('rejects null department id', () => {
    expect(isDepartmentInDeanScope(null, [10])).toBe(false);
  });
});

describe('Dean scope resolution (mock DB)', () => {
  it('aggregates school and HOD departments', async () => {
    const { resolveDeanScope } = await import('../../../backend/src/modules/academics/dean-scope.util');
    const db = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM schools s')) {
          return [{ school_id: 1, school_name: 'ISBM', school_code: 'ISBM' }];
        }
        if (sql.includes('iam_programs')) {
          return [{ dept_id: 10 }, { dept_id: 11 }];
        }
        if (sql.includes('hod_user_id')) {
          return [{ dept_id: 12 }];
        }
        if (sql.includes('FROM users WHERE')) {
          return [{ dept_id: 10 }];
        }
        return [];
      }),
    };
    const scope = await resolveDeanScope(db as never, 'dean-user-id');
    expect(scope.schoolIds).toEqual([1]);
    expect(scope.departmentIds.sort()).toEqual([10, 11, 12]);
  });
});
