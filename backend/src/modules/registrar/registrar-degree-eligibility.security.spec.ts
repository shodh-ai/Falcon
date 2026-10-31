import { BadRequestException, ConflictException } from '@nestjs/common';
import { RegistrarService } from './registrar.service';

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const auditId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const studentId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function createService(options?: {
  latestAuditId?: string;
  failHistory?: boolean;
}) {
  const audit = {
    audit_id: auditId,
    student_user_id: studentId,
    final_status: 'ELIGIBLE',
    registrar_decision: 'PENDING',
    requirements_policy_status: 'CONFIRMED',
    clearance_statuses: {
      credits: 'CLEARED',
      cgpa: 'CLEARED',
      backlogs: 'CLEARED',
      finance: 'CLEARED',
      library: 'CLEARED',
      hostel: 'CLEARED',
    },
  };
  const query = jest.fn(async (sql: string) => {
    if (
      sql.includes('FROM degree_eligibility_audits') &&
      sql.includes('audit_id = $2')
    )
      return [audit];
    if (sql.includes('FROM users WHERE tenant_id'))
      return [{ user_id: studentId }];
    if (sql.includes('SELECT audit_id, checked_at'))
      return [{ audit_id: options?.latestAuditId ?? auditId }];
    if (sql.includes('UPDATE degree_eligibility_audits'))
      return [{ ...audit, registrar_decision: 'APPROVED' }];
    if (
      sql.includes('INSERT INTO registrar_degree_approval_history') &&
      options?.failHistory
    )
      throw new Error('history write failed');
    return [];
  });
  const db = {
    query,
    transaction: jest.fn(
      async (work: (manager: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
    ),
  };
  const enterpriseAudit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new RegistrarService(
    db as never,
    {} as never,
    {} as never,
    enterpriseAudit as never,
  );
  return { service, query, db, enterpriseAudit };
}

describe('Registrar degree eligibility approval guard', () => {
  it('blocks legacy ELIGIBLE audits whose policy or clearance status is unverified', async () => {
    const { service, query } = createService();
    query.mockImplementation(async (sql: string) => {
      if (
        sql.includes('FROM degree_eligibility_audits') &&
        sql.includes('audit_id = $2')
      ) {
        return [
          {
            audit_id: auditId,
            student_user_id: studentId,
            final_status: 'ELIGIBLE',
            registrar_decision: 'PENDING',
            requirements_policy_status: 'UNCONFIRMED',
            clearance_statuses: {},
          },
        ];
      }
      if (sql.includes('FROM users WHERE tenant_id'))
        return [{ user_id: studentId }];
      if (sql.includes('SELECT audit_id, checked_at'))
        return [{ audit_id: auditId }];
      return [];
    });

    await expect(
      service.decideDegreeEligibility(
        tenant,
        'actor-1',
        auditId,
        'APPROVED',
        'Reviewed',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE degree_eligibility_audits'),
      ),
    ).toBe(false);
  });

  it('blocks a Registrar decision on an older audit after a newer audit has been persisted', async () => {
    const { service, query } = createService({ latestAuditId: 'newer-audit' });

    await expect(
      service.decideDegreeEligibility(
        tenant,
        'actor-1',
        auditId,
        'APPROVED',
        'Reviewed',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE degree_eligibility_audits'),
      ),
    ).toBe(false);
  });

  it('writes approval, approval history and the required audit event in the transaction', async () => {
    const { service, query, enterpriseAudit, db } = createService();

    const result = await service.decideDegreeEligibility(
      tenant,
      'actor-1',
      auditId,
      'APPROVED',
      'Reviewed against the current persisted audit',
    );

    expect(result.registrar_decision).toBe('APPROVED');
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes("registrar_decision = 'PENDING'"),
      ),
    ).toBe(true);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO registrar_degree_approval_history'),
      ),
    ).toBe(true);
    expect(enterpriseAudit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DEGREE_ELIGIBILITY_APPROVED' }),
      expect.any(Object),
    );
  });

  it('does not report success when approval history persistence fails', async () => {
    const { service, query } = createService({ failHistory: true });

    await expect(
      service.decideDegreeEligibility(
        tenant,
        'actor-1',
        auditId,
        'APPROVED',
        'Reviewed',
      ),
    ).rejects.toThrow('history write failed');
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('UPDATE degree_eligibility_audits'),
      ),
    ).toBe(true);
  });

  it('issues a degree request once and makes same-request retries idempotent', async () => {
    let requestStatus = 'SIGNED';
    const currentAudit = {
      audit_id: auditId,
      student_user_id: studentId,
      final_status: 'ELIGIBLE',
      registrar_decision: 'APPROVED',
      requirements_policy_status: 'CONFIRMED',
      clearance_statuses: {
        credits: 'CLEARED',
        cgpa: 'CLEARED',
        backlogs: 'CLEARED',
        finance: 'CLEARED',
        library: 'CLEARED',
        hostel: 'CLEARED',
      },
    };
    const request = {
      request_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      student_user_id: studentId,
      certificate_type: 'DEGREE',
      status: requestStatus,
    };
    const dbQuery = jest.fn(async () => [
      { ...request, status: requestStatus },
    ]);
    const managerQuery = jest.fn(async (sql: string) => {
      if (sql.includes('FROM registrar_certificate_requests'))
        return [{ ...request, status: requestStatus }];
      if (sql.includes('FROM users WHERE tenant_id'))
        return [{ user_id: studentId }];
      if (sql.includes('FROM degree_eligibility_audits')) return [currentAudit];
      if (sql.includes("SET status = 'ISSUED'")) {
        requestStatus = 'ISSUED';
        return [
          { ...request, status: requestStatus, verification_code: 'CODE' },
        ];
      }
      return [];
    });
    const db = {
      query: dbQuery,
      transaction: jest.fn(
        async (
          work: (manager: { query: typeof managerQuery }) => Promise<unknown>,
        ) => work({ query: managerQuery }),
      ),
    };
    const enterpriseAudit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new RegistrarService(
      db as never,
      {} as never,
      {} as never,
      enterpriseAudit as never,
    );
    const id = request.request_id;

    const first = await service.transitionCertificate(
      tenant,
      'actor-1',
      id,
      'ISSUE',
    );
    const second = await service.transitionCertificate(
      tenant,
      'actor-1',
      id,
      'ISSUE',
    );

    expect(first.status).toBe('ISSUED');
    expect(second.status).toBe('ISSUED');
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(
      managerQuery.mock.calls.filter(([sql]) =>
        String(sql).includes("SET status = 'ISSUED'"),
      ).length,
    ).toBe(1);
    expect(enterpriseAudit.log).toHaveBeenCalledTimes(1);
  });
});
