import { NotFoundException } from '@nestjs/common';
import { ResultControlService } from './result-control.service';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';
import { parseGradeBands } from './grading-engine';
import {
  resultApprovalState,
  type ResultApprovalMark,
  type ResultApprovalSession,
} from './result-approval-state';

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
  let globalQuery: jest.Mock;
  let manager: { query: jest.Mock };
  let transaction: jest.Mock;
  let audit: { log: jest.Mock };
  let service: ResultControlService;

  beforeEach(() => {
    mockedResolveDeanDepartmentIds.mockReset();
    query = jest.fn();
    globalQuery = jest.fn((sql: string, params?: unknown[]) =>
      query(sql, params),
    );
    manager = { query };
    transaction = jest.fn(
      async (callback: (executor: typeof manager) => Promise<unknown>) =>
        callback(manager),
    );
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new ResultControlService(
      { query: globalQuery, transaction } as never,
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

  function mockPendingRequest(
    requestId: string,
    sessionId: string,
    allowScope = true,
  ) {
    const session: ResultApprovalSession = {
      session_id: sessionId,
      tenant_id: tenantId,
      course_id: 'course-a',
      course_name: 'Algorithms',
      exam_type: 'END_TERM',
      semester: 4,
      grading_policy_id: null,
      pass_marks: 40,
      max_marks: 100,
      declared_at: null,
      entry_status: 'LOCKED',
      marks_locked: true,
      marks_locked_at: '2026-10-21T08:00:00.123456Z',
    };
    const marks: ResultApprovalMark[] = [
      {
        mark_id: 'mark-a',
        student_user_id: 'student-a',
        marks_obtained: 80,
        max_marks: 100,
        status: 'PENDING_COE',
        updated_at: '2026-10-21T07:00:00.123456Z',
        revision: '1001',
      },
    ];
    const state = resultApprovalState(session, marks, {
      rules: null,
      bands: parseGradeBands(null),
    });
    query.mockImplementation(async (sql: string) => {
      if (isScopeQuery(sql))
        return allowScope ? [{ session_id: sessionId }] : [];
      if (sql.includes('FROM exam_result_sessions')) return [session];
      if (sql.includes('FROM exam_result_dean_approval_requests')) {
        return [
          {
            request_id: requestId,
            session_id: sessionId,
            tenant_id: tenantId,
            status: 'PENDING',
            request_summary: { result_state: state },
          },
        ];
      }
      if (sql.includes('FROM academic_marks')) return marks;
      if (sql.includes('FROM student_course_enrollments'))
        return [
          { enrollment_id: 'enrollment-a', student_user_id: 'student-a' },
        ];
      if (sql.includes('FROM exam_audit_logs')) {
        return [
          {
            action: 'RESULT_COE_AUDIT_PASSED',
            new_value: { result_state: state },
          },
        ];
      }
      if (isDecisionUpdate(sql)) return [{ request_id: requestId }];
      return [];
    });
  }

  it('allows Dean A to decide a pending request for School A', async () => {
    mockPendingRequest(schoolARequest, schoolASession);

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

    expect(mockedResolveDeanDepartmentIds).toHaveBeenCalledWith(manager, deanA);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(globalQuery).not.toHaveBeenCalled();
    expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(true);
    expect(audit.log).toHaveBeenCalledWith(
      tenantId,
      deanA,
      expect.objectContaining({ action: 'RESULT_DEAN_APPROVED' }),
      manager,
    );
  });

  it.each(['APPROVED', 'REJECTED'] as const)(
    'does not let Dean A %s a School B request or write an audit decision',
    async (decision) => {
      mockPendingRequest(schoolBRequest, schoolBSession, false);

      await expect(
        service.decideDeanResultApproval(
          tenantId,
          deanA,
          schoolBRequest,
          decision,
          decision === 'REJECTED' ? 'Outside scope test' : undefined,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(query.mock.calls.some(([sql]) => isDecisionUpdate(sql))).toBe(
        false,
      );
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
      if (sql.includes('FROM exam_result_dean_approval_history'))
        return history;
      return [];
    });

    await expect(
      service.getDeanResultApprovalHistory(tenantId, deanA, schoolASession),
    ).resolves.toEqual(history);
  });

  it('keeps Super Admin result approval decisions authorized tenant-wide', async () => {
    mockPendingRequest(schoolBRequest, schoolBSession);

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
