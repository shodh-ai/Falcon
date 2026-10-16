import { ForbiddenException } from '@nestjs/common';
import { resolveDeanScope } from '../academics/dean-scope.util';
import { UosGovernanceService } from './uos-governance.service';

jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanScope: jest.fn(),
}));

const mockedResolveDeanScope = jest.mocked(resolveDeanScope);

describe('UosGovernanceService Dean curriculum scope', () => {
  const tenantId = 'tenant-a';
  const deanA = 'dean-a';
  const schoolAProposal = 'proposal-school-a';
  const schoolBProposal = 'proposal-school-b';

  let query: jest.Mock;
  let service: UosGovernanceService;

  beforeEach(() => {
    query = jest.fn();
    mockedResolveDeanScope.mockReset();
    mockedResolveDeanScope.mockResolvedValue({
      schoolIds: [101],
      departmentIds: [1001],
      schools: [
        { school_id: 101, school_name: 'School A', school_code: 'SCHOOL_A' },
      ],
    });
    service = new UosGovernanceService(
      { query } as never,
      {} as never,
      {} as never,
    );
  });

  function isScopedProposalQuery(sql: string) {
    return (
      sql.includes('SELECT cp.proposal_id') &&
      sql.includes('p.school_id = ANY($3::int[])') &&
      sql.includes('p.dept_id = ANY($4::int[])')
    );
  }

  function isBosUpdate(sql: string) {
    return (
      sql.includes('UPDATE sis_curriculum_proposals') &&
      sql.includes('bos_signatures = $2::jsonb')
    );
  }

  function isFinalizeUpdate(sql: string) {
    return (
      sql.includes('UPDATE sis_curriculum_proposals') &&
      sql.includes("status = 'APPROVED'")
    );
  }

  function proposal(proposalId: string, status = 'PENDING_BOS') {
    return {
      proposal_id: proposalId,
      title: 'Curriculum revision',
      program_code: 'BTECH-CSE',
      status,
      bos_signatures: [],
    };
  }

  it('lists only proposals in Dean A school or department scope', async () => {
    const proposals = [proposal(schoolAProposal)];
    query.mockResolvedValue(proposals);

    await expect(
      service.listCurriculum(tenantId, deanA, 'Dean'),
    ).resolves.toEqual(proposals);

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('p.school_id = ANY($2::int[])');
    expect(sql).toContain('p.dept_id = ANY($3::int[])');
    expect(params).toEqual([tenantId, [101], [1001]]);
  });

  it('does not list School B proposals for Dean A', async () => {
    query.mockResolvedValue([]);

    await expect(
      service.listCurriculum(tenantId, deanA, 'Dean'),
    ).resolves.toEqual([]);

    expect(query.mock.calls[0][1]).toEqual([tenantId, [101], [1001]]);
  });

  it.each(['sign', 'finalize'] as const)(
    'does not let Dean A %s a School B proposal through a direct ID',
    async (action) => {
      query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT * FROM sis_curriculum_proposals')) {
          return [proposal(schoolBProposal)];
        }
        if (isScopedProposalQuery(sql)) return [];
        return [];
      });

      const call =
        action === 'sign'
          ? service.signCurriculumBos(
              tenantId,
              deanA,
              'Dean',
              schoolBProposal,
            )
          : service.finalizeCurriculum(
              tenantId,
              deanA,
              'Dean',
              schoolBProposal,
            );

      await expect(call).rejects.toBeInstanceOf(ForbiddenException);
      expect(query.mock.calls.some(([sql]) => isBosUpdate(sql))).toBe(false);
      expect(query.mock.calls.some(([sql]) => isFinalizeUpdate(sql))).toBe(
        false,
      );
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO accreditation_evidence_events'),
        ),
      ).toBe(false);
    },
  );

  it('fails closed when a proposal has no resolved program ownership', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM sis_curriculum_proposals')) {
        return [proposal(schoolBProposal)];
      }
      if (isScopedProposalQuery(sql)) return [];
      return [];
    });

    await expect(
      service.signCurriculumBos(tenantId, deanA, 'Dean', schoolBProposal),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query.mock.calls.some(([sql]) => isBosUpdate(sql))).toBe(false);
  });

  it('allows Dean A to sign an authorized School A proposal', async () => {
    const schoolA = proposal(schoolAProposal);
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT * FROM sis_curriculum_proposals')) return [schoolA];
      if (isScopedProposalQuery(sql)) return [{ proposal_id: schoolAProposal }];
      if (isBosUpdate(sql)) return [{ ...schoolA, bos_signatures: [{}] }];
      return [];
    });

    await expect(
      service.signCurriculumBos(tenantId, deanA, 'Dean', schoolAProposal),
    ).resolves.toEqual(expect.objectContaining({ proposal_id: schoolAProposal }));

    expect(query.mock.calls.some(([sql]) => isBosUpdate(sql))).toBe(true);
  });

  it.each(['SuperAdmin', 'CampusAdmin'] as const)(
    'keeps the authorized %s finalization workflow tenant-wide',
    async (roleName) => {
      const pendingDean = proposal(schoolBProposal, 'PENDING_DEAN');
      query.mockImplementation(async (sql: string) => {
        if (isFinalizeUpdate(sql)) return [pendingDean];
        return [];
      });

      await expect(
        service.finalizeCurriculum(
          tenantId,
          roleName.toLowerCase(),
          roleName,
          schoolBProposal,
        ),
      ).resolves.toEqual(pendingDean);

      expect(mockedResolveDeanScope).not.toHaveBeenCalled();
      expect(query.mock.calls.some(([sql]) => isFinalizeUpdate(sql))).toBe(
        true,
      );
    },
  );
});
