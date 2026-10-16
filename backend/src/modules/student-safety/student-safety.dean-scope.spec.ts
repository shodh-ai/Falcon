import { ForbiddenException } from '@nestjs/common';
import { resolveDeanScope } from '../academics/dean-scope.util';
import { StudentSafetyService } from './student-safety.service';

jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanScope: jest.fn(),
}));

const mockedResolveDeanScope = jest.mocked(resolveDeanScope);

describe('StudentSafetyService Dean concern scope', () => {
  const tenantId = 'tenant-a';
  const deanA = 'dean-a';
  const schoolAConcern = 'concern-school-a';
  const schoolBConcern = 'concern-school-b';

  let query: jest.Mock;
  let notify: { approvalRequired: jest.Mock };
  let service: StudentSafetyService;

  beforeEach(() => {
    query = jest.fn();
    notify = { approvalRequired: jest.fn() };
    mockedResolveDeanScope.mockReset();
    mockedResolveDeanScope.mockResolvedValue({
      schoolIds: [101],
      departmentIds: [1001],
      schools: [
        { school_id: 101, school_name: 'School A', school_code: 'SCHOOL_A' },
      ],
    });
    service = new StudentSafetyService({ query } as never, notify as never);
  });

  function isDeanConcernScopeQuery(sql: string) {
    return (
      sql.includes('s.school_id = ANY($3::int[])') &&
      sql.includes('reporter.dept_id = ANY($4::int[])')
    );
  }

  function isConcernUpdate(sql: string) {
    return (
      sql.includes('UPDATE student_safety_concerns') &&
      sql.includes('reviewer_user_id = $3')
    );
  }

  function concern(concernId: string) {
    return {
      concern_id: concernId,
      routed_to_roles: ['Dean'],
      status: 'SUBMITTED',
      reporter_user_id: 'reporter-a',
      accused_user_id: 'accused-a',
      accused_type: 'STUDENT',
      concern_type: 'RAGGING',
      accused_notified_at: null,
    };
  }

  it('lists only concerns in Dean A school and department scope', async () => {
    const concerns = [concern(schoolAConcern)];
    query.mockResolvedValue(concerns);

    await expect(
      service.listForRole(tenantId, 'Dean', deanA),
    ).resolves.toEqual(concerns);

    expect(mockedResolveDeanScope).toHaveBeenCalledWith(
      expect.anything(),
      deanA,
    );
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("'Dean' = ANY(c.routed_to_roles)");
    expect(sql).toContain('s.school_id = ANY($2::int[])');
    expect(sql).toContain('reporter.dept_id = ANY($3::int[])');
    expect(params).toEqual([tenantId, [101], [1001]]);
  });

  it('does not list School B concerns for Dean A', async () => {
    query.mockResolvedValue([]);

    await expect(
      service.listForRole(tenantId, 'Dean', deanA),
    ).resolves.toEqual([]);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('s.school_id = ANY($2::int[])');
    expect(params).toEqual([tenantId, [101], [1001]]);
  });

  it('does not update a School B concern when Dean A supplies its direct ID', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM student_safety_concerns')) {
        return [concern(schoolBConcern)];
      }
      if (isDeanConcernScopeQuery(sql)) return [];
      return [];
    });

    await expect(
      service.updateConcern(tenantId, deanA, 'Dean', schoolBConcern, {
        status: 'UNDER_REVIEW',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query.mock.calls.some(([sql]) => isConcernUpdate(sql))).toBe(false);
    expect(notify.approvalRequired).not.toHaveBeenCalled();
  });

  it('fails closed for a concern without resolvable reporter ownership', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM student_safety_concerns')) {
        return [concern(schoolBConcern)];
      }
      if (isDeanConcernScopeQuery(sql)) return [];
      return [];
    });

    await expect(
      service.updateConcern(tenantId, deanA, 'Dean', schoolBConcern, {
        status: 'UNDER_REVIEW',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query.mock.calls.some(([sql]) => isConcernUpdate(sql))).toBe(false);
  });

  it('allows Dean A to update an authorized School A concern', async () => {
    const schoolA = concern(schoolAConcern);
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM student_safety_concerns')) return [schoolA];
      if (isDeanConcernScopeQuery(sql)) return [{ concern_id: schoolAConcern }];
      return [];
    });

    await expect(
      service.updateConcern(tenantId, deanA, 'Dean', schoolAConcern, {
        status: 'UNDER_REVIEW',
      }),
    ).resolves.toEqual({ status: 'UNDER_REVIEW' });

    expect(query.mock.calls.some(([sql]) => isConcernUpdate(sql))).toBe(true);
    expect(notify.approvalRequired).toHaveBeenCalled();
  });

  it('keeps the explicitly authorized SuperAdmin safety escalation path tenant-wide', async () => {
    const concernB = concern(schoolBConcern);
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM student_safety_concerns')) return [concernB];
      return [];
    });

    await expect(
      service.updateConcern(tenantId, 'super-admin', 'SuperAdmin', schoolBConcern, {
        status: 'ESCALATED',
      }),
    ).resolves.toEqual({ status: 'ESCALATED' });

    expect(mockedResolveDeanScope).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => isConcernUpdate(sql))).toBe(true);
  });
});
