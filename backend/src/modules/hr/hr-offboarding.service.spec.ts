import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HrChecklistService } from './hr-checklist.service';
import { HrEssService } from './hr-ess.service';

describe('HR offboarding scope and queue parity', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const resignationId = '20000000-0000-4000-8000-000000000002';
  const actorId = '30000000-0000-4000-8000-000000000003';

  function makeEss(query: jest.Mock) {
    const notify = { leaveApproved: jest.fn() };
    const service = new HrEssService(
      { query } as never,
      notify as never,
      {} as never,
    );
    return { service, notify };
  }

  it('filters the pending FNF list by the same status and exit predicate as dashboard', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service } = makeEss(query);
    await service.listResignations(tenantId, 7, 'fnf');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("r.status = 'FNF_PENDING'");
    expect(sql).toContain(
      "r.exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'",
    );
    expect(sql).toContain('r.tenant_id = $1 AND r.entity_id = $2');
    expect(sql).toContain('p.tenant_id = r.tenant_id');
    expect(params).toEqual([tenantId, 7]);
  });

  it('returns status summaries from scoped records and the shared FNF predicate', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        awaiting_hr_action: '4',
        fnf_to_initiate: '2',
        pending_fnf_clearances: '3',
        completed_exits: '1',
      },
    ]);
    const { service } = makeEss(query);
    await expect(service.getOffboardingSummary(tenantId, 7)).resolves.toEqual({
      awaiting_hr_action: 4,
      fnf_to_initiate: 2,
      pending_fnf_clearances: 3,
      completed_exits: 1,
    });
    expect(query.mock.calls[0][0]).toContain("r.status = 'FNF_PENDING'");
    expect(query.mock.calls[0][0]).toContain(
      "r.status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING', 'FNF_PENDING')",
    );
    expect(query.mock.calls[0][0]).toContain(
      "r.status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING')",
    );
    expect(query.mock.calls[0][0]).toContain(
      'r.tenant_id = $1 AND r.entity_id = $2',
    );
    expect(query.mock.calls[0][1]).toEqual([tenantId, 7]);
  });

  it('does not process a resignation outside the tenant/entity or wrong state', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service, notify } = makeEss(query);
    await expect(
      service.hrProcessResignation(
        resignationId,
        tenantId,
        7,
        actorId,
        'SERVE_NOTICE',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_id = $4 AND entity_id = $5');
    expect(sql).toContain(
      "status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING')",
    );
    expect(params).toEqual([
      resignationId,
      'SERVE_NOTICE',
      actorId,
      tenantId,
      7,
    ]);
    expect(notify.leaveApproved).not.toHaveBeenCalled();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('moves an HR-processing case into the FNF queue with one scoped write', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        resignation_id: resignationId,
        tenant_id: tenantId,
        user_id: actorId,
        last_working_day: '2026-11-30',
        fnf_ledger_ref: 'FNF-20000000',
        status: 'FNF_PENDING',
      },
    ]);
    const { service, notify } = makeEss(query);
    const result = await service.hrProcessResignation(
      resignationId,
      tenantId,
      7,
      actorId,
      'SERVE_NOTICE',
    );
    expect(result.status).toBe('FNF_PENDING');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain(
      "status IN ('PENDING_HR', 'HOD_CLEARED', 'HR_PROCESSING')",
    );
    expect(notify.leaveApproved).toHaveBeenCalledTimes(1);
  });

  it('requires HOD scope and pending HOD status for clearance', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service } = makeEss(query);
    await expect(
      service.hodClearResignation(resignationId, tenantId, 7, actorId, true),
    ).rejects.toBeInstanceOf(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("r.status = 'PENDING_HOD'");
    expect(sql).toContain('r.tenant_id = $4 AND r.entity_id = $5');
    expect(sql).toContain('employee.reporting_officer_id = $3');
    expect(params).toEqual([
      resignationId,
      'PENDING_HR',
      actorId,
      tenantId,
      7,
      false,
    ]);
  });

  it('rejects invalid separation modes before a write', async () => {
    const query = jest.fn();
    const { service } = makeEss(query);
    await expect(
      service.hrProcessResignation(
        resignationId,
        tenantId,
        7,
        actorId,
        'UNEXPECTED' as never,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('guards exit-status changes by tenant/entity, state and allowed value', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new HrChecklistService({ query } as never);
    await expect(
      service.updateExitStatus(resignationId, tenantId, 7, 'ANYTHING'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();

    await expect(
      service.updateExitStatus(resignationId, tenantId, 7, 'OFFBOARDED'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('tenant_id = $4 AND entity_id = $5');
    expect(sql).toContain("exit_status, 'PENDING_CLEARANCE') <> 'OFFBOARDED'");
    expect(sql).toContain("status IN ('FNF_PENDING', 'FNF_COMPLETED')");
    expect(params).toEqual([resignationId, 'OFFBOARDED', null, tenantId, 7]);
  });
});
