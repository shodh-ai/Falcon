import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';

function setup(rows: Array<Record<string, unknown>> = []) {
  const query = jest
    .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
    .mockResolvedValue(rows);
  const manager = { query };
  const transaction = jest.fn(
    async (work: (tx: typeof manager) => Promise<unknown>) => work(manager),
  );
  const log = jest.fn().mockResolvedValue(undefined);
  const service = new ExamCellEnterpriseService(
    { query, transaction } as never,
    {} as never,
    {} as never,
    { log } as never,
  );
  return { service, query, manager, transaction, log };
}

describe('Hall ticket approval updates', () => {
  it('locks and advances exactly one stage with the mutation and audit in one transaction', async () => {
    const row = { approval_id: 'approval', stage: 'FINANCE' };
    const { service, query, manager, transaction, log } = setup();
    query
      .mockResolvedValueOnce([
        { approval_id: 'approval', stage: 'ELIGIBILITY' },
      ])
      .mockResolvedValueOnce([row]);
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        'APPROVE',
      ),
    ).resolves.toEqual(row);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      'tenant_id = $1 AND approval_id = $2 FOR UPDATE',
    );
    const [sql, values] = query.mock.calls[1];
    expect(sql).toContain('WITH updated AS');
    expect(sql).toContain("CASE WHEN $3::varchar = 'APPROVED'");
    expect(values).toEqual(['tenant', 'approval', 'FINANCE', 'actor']);
    expect(log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({
        old_value: { stage: 'ELIGIBILITY' },
        new_value: { stage: 'FINANCE' },
      }),
      manager,
    );
  });

  it.each(['APPROVED', 'COE', 'REGISTRATION', 'unknown', ''])(
    'rejects an arbitrary explicit transition to %s',
    async (stage) => {
      const { service, query, log } = setup([
        { approval_id: 'approval', stage: 'REGISTRATION' },
      ]);
      await expect(
        service.advanceHallTicketApproval(
          'tenant',
          'approval',
          'actor',
          'APPROVE',
          stage,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['REJECTED', 'APPROVE'],
    ['APPROVED', 'REJECT'],
  ])('does not reverse terminal stage %s', async (stage, action) => {
    const { service, query, log } = setup([{ approval_id: 'approval', stage }]);
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        action as 'APPROVE' | 'REJECT',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(log).not.toHaveBeenCalled();
  });

  it.each([
    ['APPROVED', 'APPROVE'],
    ['REJECTED', 'REJECT'],
  ])(
    'allows an idempotent retry of %s without another mutation or audit',
    async (stage, action) => {
      const row = { approval_id: 'approval', stage };
      const { service, query, log } = setup([row]);
      await expect(
        service.advanceHallTicketApproval(
          'tenant',
          'approval',
          'actor',
          action as 'APPROVE' | 'REJECT',
        ),
      ).resolves.toEqual(row);
      expect(query).toHaveBeenCalledTimes(1);
      expect(log).not.toHaveBeenCalled();
    },
  );

  it('does not treat an explicitly empty terminal target as a successful retry', async () => {
    const { service } = setup([{ approval_id: 'approval', stage: 'APPROVED' }]);
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        'APPROVE',
        '',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown actions and reports a missing tenant-scoped record', async () => {
    const { service, query } = setup();
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        'invalid' as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        'APPROVE',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('propagates audit failures so the mutation transaction cannot commit unaudited', async () => {
    const { service, query, log } = setup();
    query
      .mockResolvedValueOnce([{ stage: 'COE' }])
      .mockResolvedValueOnce([{ stage: 'APPROVED' }]);
    log.mockRejectedValueOnce(new Error('audit failed'));
    await expect(
      service.advanceHallTicketApproval(
        'tenant',
        'approval',
        'actor',
        'APPROVE',
      ),
    ).rejects.toThrow('audit failed');
  });

  it('bulk advances only the immediately preceding stage and counts actual returned rows', async () => {
    const { service, query, log, manager } = setup([
      { approval_id: 'approval' },
    ]);
    await expect(
      service.bulkApproveHallTickets('tenant', 'actor', {
        semester: 6,
        batch_label: 'Synthetic fixture',
        target_stage: 'COE',
      }),
    ).resolves.toEqual({ approved: 1 });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain('SELECT * FROM updated');
    expect(sql).toContain('AND stage = $6::varchar');
    expect(sql).not.toContain('stage NOT IN');
    expect(values).toEqual([
      'tenant',
      6,
      'Synthetic fixture',
      'COE',
      'actor',
      'EXAM_OFFICE',
    ]);
    expect(log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({
        new_value: {
          count: 1,
          target_stage: 'COE',
          previous_stage: 'EXAM_OFFICE',
        },
      }),
      manager,
    );
  });

  it.each(['REJECTED', 'REGISTRATION', 'unknown'])(
    'does not bulk transition to %s',
    async (stage) => {
      const { service, query } = setup();
      await expect(
        service.bulkApproveHallTickets('tenant', 'actor', {
          semester: 6,
          batch_label: 'Synthetic fixture',
          target_stage: stage,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('preserves existing approval stages and avoids changing timestamps on a no-op eligibility sync', async () => {
    const { service, query, log, manager } = setup();
    jest.spyOn(service, 'eligibilityDashboard').mockResolvedValue({
      semester: 6,
      items: [
        {
          student_user_id: 'synthetic',
          category: 'ELIGIBLE',
          block_reasons: [],
          fee_clear: true,
        },
      ],
    } as never);
    await expect(
      service.syncHallTicketApprovals(
        'tenant',
        6,
        'Synthetic fixture',
        'actor',
      ),
    ).resolves.toEqual({ synced: 1, total: 1, updated: 0 });
    const [sql, values] = query.mock.calls[1];
    const conflictUpdate = sql.split('DO UPDATE SET')[1];
    expect(conflictUpdate).not.toMatch(/stage\s*=/);
    expect(conflictUpdate).toContain('IS DISTINCT FROM');
    expect(values).toEqual([
      'tenant',
      'synthetic',
      6,
      'Synthetic fixture',
      'ELIGIBILITY',
      '[]',
      'APPROVED',
      'APPROVED',
    ]);
    expect(query.mock.calls[0][0]).toContain('pg_advisory_xact_lock');
    expect(log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({ action: 'HALL_TICKET_QUEUE_SYNCED' }),
      manager,
    );
  });

  it('reports sync database failures instead of fabricated zero-row success', async () => {
    const { service, query, log } = setup();
    jest.spyOn(service, 'eligibilityDashboard').mockResolvedValue({
      items: [
        {
          student_user_id: 'synthetic',
          category: 'ELIGIBLE',
          block_reasons: [],
          fee_clear: true,
        },
      ],
    } as never);
    query
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('database unavailable'));
    await expect(
      service.syncHallTicketApprovals(
        'tenant',
        6,
        'Synthetic fixture',
        'actor',
      ),
    ).rejects.toThrow('database unavailable');
    expect(log).not.toHaveBeenCalled();
  });
});
