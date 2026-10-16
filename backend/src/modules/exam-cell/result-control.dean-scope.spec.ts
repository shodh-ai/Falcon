import { NotFoundException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';

jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanDepartmentIds: jest.fn(),
}));

const mockedResolveDeanDepartmentIds = jest.mocked(resolveDeanDepartmentIds);

describe('ResultControlService Dean result approval scope', () => {
  const tenantId = 'tenant-a';
  const deanA = 'dean-a';
  const schoolASession = 'session-school-a';
  const schoolBSession = 'session-school-b';
  const schoolARequest = 'request-school-a';
  const schoolBRequest = 'request-school-b';

  let query: jest.Mock;
  let audit: { log: jest.Mock };
  let service: ResultControlService;

  beforeEach(() => {
    mockedResolveDeanDepartmentIds.mockReset();
    query = jest.fn();
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ResultControlService(
      { query } as never,
      { approvalRequired: jest.fn() } as never,
      audit as never,
    );
    mockedResolveDeanDepartmentIds.mockResolvedValue([101]);
  });

  function isScopeQuery(sql: string) {
    return sql.includes('faculty.dept_id = ANY($3::int[])');
  }

  function isDecisionUpdate(sql: string) {
    return sql.includes('UPDATE exam_result_dean_approval_requests');
  }

  it('allows Dean A to decide a pending request for School A', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT request_id, session_id, status')) {
        return [{ request_id: schoolARequest, session_id: schoolASession, status: 'PENDING' }];
      }
      if (isScopeQuery(sql)) return [{ session_id: schoolASession }];
      return [];
    });

    await expect(
      service.decideDeanResultApproval(
        tenantId,
        deanA,
        schoolARequest,
        'APPROVED',
        'Reviewed',
      ),
    ).resolves.toEqual({
      request_id: schoolARequest,
      session_id: schoolASession,
      status: 'APPROVED',
    });

    expect(mockedResolveDeanDepartmentIds).toHaveBeenCalledWith(
      expect.anything(),
      deanA,
    );
    expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      deanA,
      expect.objectContaining({ action: 'RESULT_DEAN_APPROVED' }),
    );
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'does not let Dean A %s a School B request or write an audit decision',
    async (decision) => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT request_id, session_id, status')) {
          return [{ request_id: schoolBRequest, session_id: schoolBSession, status: 'PENDING' }];
        }
        if (isScopeQuery(sql)) return [];
        return [];
      });

      await expect(
        service.decideDeanResultApproval(
          tenantId,
          deanA,
          schoolBRequest,
          decision,
          decision === 'REJECTED' ? 'Outside scope test' : undefined,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(false);
      expect(audit.log).not.toHaveBeenCalled();
    },
  );

  it('does not return School B approval history to Dean A', async () => {
    query.mockImplementation(async (sql: string) => {
      if (isScopeQuery(sql)) return [];
      if (sql.includes('FROM exam_result_dean_approval_history')) {
        return [{ action: 'REQUESTED' }];
      }
      return [];
    });

    await expect(
      service.getDeanResultApprovalHistory(tenantId, deanA, schoolBSession),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('FROM exam_result_dean_approval_history'),
      ),
    ).toBe(false);
  });

  it('returns School A approval history to Dean A', async () => {
    const history = [{ action: 'REQUESTED', session_id: schoolASession }];
    query.mockImplementation(async (sql: string) => {
      if (isScopeQuery(sql)) return [{ session_id: schoolASession }];
      if (sql.includes('FROM exam_result_dean_approval_history')) return history;
      return [];
    });

    await expect(
      service.getDeanResultApprovalHistory(tenantId, deanA, schoolASession),
    ).resolves.toEqual(history);
  });

  it('keeps Super Admin result approval decisions authorized tenant-wide', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT request_id, session_id, status')) {
        return [{ request_id: schoolBRequest, session_id: schoolBSession, status: 'PENDING' }];
      }
      return [];
    });

    await expect(
      service.decideDeanResultApproval(
        tenantId,
        'super-admin',
        schoolBRequest,
        'APPROVED',
        undefined,
        'SuperAdmin',
      ),
    ).resolves.toEqual({
      request_id: schoolBRequest,
      session_id: schoolBSession,
      status: 'APPROVED',
    });

    expect(mockedResolveDeanDepartmentIds).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(true);
  });
});
