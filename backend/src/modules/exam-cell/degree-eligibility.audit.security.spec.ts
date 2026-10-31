import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';

type Row = Record<string, unknown>;
type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;

function createService(options?: {
  failLibrary?: boolean;
  failInsert?: boolean;
  financeResult?: unknown;
  financeFailure?: boolean;
  backlogRows?: Array<{ course_id: string | null; subject_id: string | null }>;
}) {
  const query = jest.fn<Promise<Row[]>, [string, unknown[]?]>(async (sql) => {
    if (sql.includes('FROM users WHERE user_id'))
      return [{ user_id: '11111111-1111-4111-8111-111111111111' }];
    if (sql.includes('FROM student_course_enrollments'))
      return [{ earned: 180 }];
    if (sql.includes('FROM grade_cards')) return [{ cgpa: 7.5 }];
    if (sql.includes('FROM student_backlog_history'))
      return (options?.backlogRows ?? []).map((row) => ({
        ...row,
        course_in_tenant: true,
      }));
    if (sql.includes('FROM lib_circulation')) {
      if (options?.failLibrary) throw new Error('library source unavailable');
      return [{ c: 0 }];
    }
    if (sql.includes('INSERT INTO degree_eligibility_audits')) {
      if (options?.failInsert) throw new Error('audit table unavailable');
      return [
        {
          audit_id: 'audit-1',
          credits_required: 160,
          cgpa_required: 5,
          final_status: 'PENDING',
        },
      ];
    }
    return [];
  });
  const finance = {
    getPendingDues: jest.fn(async () => {
      if (options?.financeFailure) throw new Error('finance unavailable');
      if (
        options &&
        Object.prototype.hasOwnProperty.call(options, 'financeResult')
      ) {
        return options.financeResult as never;
      }
      return [];
    }),
  };
  const db = {
    query,
    transaction: jest.fn(
      async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
    ),
  };
  const service = new ExamCellEnterpriseService(
    db as never,
    {} as never,
    finance as never,
    {} as never,
  );
  return { service, query, finance };
}

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const student = '11111111-1111-4111-8111-111111111111';

describe('degree eligibility audit security', () => {
  it('keeps a failed library lookup unavailable and cannot mark the student eligible', async () => {
    const { service } = createService({ failLibrary: true });

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.clearance_statuses).toMatchObject({
      library: 'UNAVAILABLE',
      hostel: 'UNAVAILABLE',
    });
    expect(result.library_clearance).toBe(false);
    expect(result.final_status).toBe('PENDING');
  });

  it('keeps hostel clearance unavailable because no authorized tenant-scoped source is established', async () => {
    const { service, query } = createService();

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.clearance_statuses).toMatchObject({ hostel: 'UNAVAILABLE' });
    expect(result.hostel_clearance).toBe(false);
    expect(result.final_status).not.toBe('ELIGIBLE');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('hostel_fee_demands'),
      ),
    ).toBe(false);
  });

  it('does not treat missing Finance data as a passing clearance', async () => {
    const { service } = createService({ financeResult: null });

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.clearance_statuses).toMatchObject({ finance: 'UNAVAILABLE' });
    expect(result.finance_clearance).toBe(false);
    expect(result.final_status).not.toBe('ELIGIBLE');
  });

  it('does not treat unrelated pending Finance demands as degree-blocking policy', async () => {
    const { service } = createService({
      financeResult: [{ fee_head: 'HOSTEL_MESS', status: 'PENDING' }],
    });

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.clearance_statuses.finance).toBe('UNAVAILABLE');
    expect(result.final_status).toBe('PENDING');
  });

  it('deduplicates repeated attempts for the same unresolved course backlog', async () => {
    const { service } = createService({
      backlogRows: [
        { course_id: 'course-a', subject_id: 'subject-a' },
        { course_id: 'course-a', subject_id: 'subject-a' },
      ],
    });

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.pending_backlogs).toBe(1);
    expect(result.clearance_statuses.backlogs).toBe('NOT_CLEARED');
    expect(result.final_status).toBe('NOT_ELIGIBLE');
  });

  it('keeps an unlinked unresolved backlog unavailable rather than treating it as zero', async () => {
    const { service } = createService({
      backlogRows: [{ course_id: null, subject_id: null }],
    });

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(result.pending_backlogs).toBeNull();
    expect(result.clearance_statuses.backlogs).toBe('UNAVAILABLE');
    expect(result.final_status).toBe('PENDING');
  });

  it('passes tenant scope to Finance and tenant-scopes supported source queries', async () => {
    const { service, query, finance } = createService();

    const result = await service.runDegreeEligibilityAudit(
      tenant,
      student,
      'actor',
    );

    expect(finance.getPendingDues).toHaveBeenCalledWith(student, tenant);
    const backlogCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM student_backlog_history'),
    );
    expect(backlogCall?.[0]).toContain('tenant_id = $2');
    expect(backlogCall?.[1]).toEqual([student, tenant]);
    const libraryCall = query.mock.calls.find(([sql]) =>
      String(sql).includes('FROM lib_circulation'),
    );
    expect(libraryCall?.[0]).toContain('l.tenant_id = $2');
    expect(libraryCall?.[0]).toContain('u.tenant_id = l.tenant_id');
    expect(libraryCall?.[1]).toEqual([student, tenant]);
    expect(result.clearance_statuses).toMatchObject({
      credits: 'UNAVAILABLE',
      cgpa: 'UNAVAILABLE',
      finance: 'UNAVAILABLE',
      backlogs: 'CLEARED',
      library: 'CLEARED',
    });
    expect(result.requirements_policy_status).toBe('UNCONFIRMED');
    expect(result.final_status).toBe('PENDING');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("status = 'PUBLISHED'"),
      ),
    ).toBe(true);
  });

  it('rejects another-tenant or missing students before reading or persisting an audit', async () => {
    const query = jest
      .fn<Promise<Row[]>, [string, unknown[]?]>()
      .mockResolvedValue([]);
    const finance = { getPendingDues: jest.fn() };
    const db = {
      query,
      transaction: jest.fn(
        async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
          work({ query }),
      ),
    };
    const service = new ExamCellEnterpriseService(
      db as never,
      {} as never,
      finance as never,
      {} as never,
    );

    await expect(
      service.runDegreeEligibilityAudit(tenant, student, 'actor'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([student, tenant]);
    expect(finance.getPendingDues).not.toHaveBeenCalled();
  });

  it('does not return success when the required audit insert fails', async () => {
    const { service } = createService({ failInsert: true });

    await expect(
      service.runDegreeEligibilityAudit(tenant, student, 'actor'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
