import { HrWorkforceService } from './hr-workforce.service';

describe('HR final review queue and approval routing', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const approverId = '20000000-0000-4000-8000-000000000002';
  const nextApproverId = '30000000-0000-4000-8000-000000000003';

  function makeService(options: {
    query?: jest.Mock;
    findOne?: jest.Mock;
    save?: jest.Mock;
    advanceAfterApproval?: jest.Mock;
  } = {}) {
    const query = options.query ?? jest.fn().mockResolvedValue([]);
    const findOne = options.findOne ?? jest.fn().mockResolvedValue(null);
    const save = options.save ?? jest.fn().mockImplementation(async (row) => row);
    const advanceAfterApproval = options.advanceAfterApproval ?? jest.fn();
    const requests = { findOne, save };
    const users = { manager: { query, connection: { query } }, findOne };
    const hrWorkflow = {
      assertActorIsCurrentApprover: jest.fn(),
      advanceAfterApproval,
    };
    const accessControl = { assertWorkflowApproverPower: jest.fn() };
    const service = new HrWorkforceService(
      {} as never, {} as never, requests as never, {} as never,
      {} as never, users as never, {} as never, {} as never,
      { notifyApprover: jest.fn() } as never, {} as never,
      hrWorkflow as never, accessControl as never,
    );
    return { service, query, findOne, save, hrWorkflow };
  }

  it('lists only assigned pending requests of the requested type in the entity', async () => {
    const { service, query } = makeService();
    await service.listHrReviewPending(tenantId, 7, approverId, 'REGULARIZATION');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('r.tenant_id = $1 AND p.entity_id = $2');
    expect(sql).toContain('r.current_approver_user_id = $3');
    expect(sql).toContain('r.request_type = $4');
    expect(sql).toContain("r.status IN ('PENDING', 'HOD_APPROVED')");
    expect(sql).toContain('hr_step.workflow_id = r.workflow_id');
    expect(sql).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
    expect(sql).toContain('later_step.step_order > r.current_step_order');
    expect(sql).toContain('da.first_in_time AS recorded_check_in');
    expect(sql).toContain('r.missed_punch_type');
    expect(sql).toContain('r.start_time, r.end_time');
    expect(sql).toContain('r.applied_at');
    expect(params).toEqual([tenantId, 7, approverId, 'REGULARIZATION']);
  });

  it('rejects legacy approval for an unassigned or out-of-entity request', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const { service, save } = makeService({ query });
    await expect(
      service.actOnScopedTeamRequest(
        approverId, tenantId, 7, 'leave-id', 'APPROVE', ['HR'],
      ),
    ).rejects.toThrow('Request is not pending your approval in this entity');
    expect(query.mock.calls[0][0]).toContain('p.entity_id = $2');
    expect(query.mock.calls[0][0]).toContain('r.current_approver_user_id = $4');
    expect(query.mock.calls[0][1]).toEqual([tenantId, 7, 'leave-id', approverId]);
    expect(save).not.toHaveBeenCalled();
  });

  it('routes legacy approval through the workflow service rather than bypassing side effects', async () => {
    const query = jest.fn().mockResolvedValue([{ leave_id: 'leave-id' }]);
    const { service } = makeService({ query });
    const workflowAction = jest
      .spyOn(service, 'actOnTeamRequest')
      .mockResolvedValue({ status: 'HR_APPROVED' } as never);
    await expect(
      service.actOnScopedTeamRequest(
        approverId, tenantId, 7, 'leave-id', 'APPROVE', ['HR'],
      ),
    ).resolves.toEqual({ status: 'HR_APPROVED' });
    expect(workflowAction).toHaveBeenCalledWith(
      approverId, tenantId, 'leave-id', 'APPROVE', undefined, { roles: ['HR'] },
    );
  });

  it('moves a HoD-approved leave to the HR step without finalizing it early', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'PENDING',
      workflow_id: 'workflow-id', current_step_order: 1,
      current_approver_user_id: approverId, entity_id: 7,
      start_date: '2026-10-14', end_date: '2026-10-14',
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HOD' }])
      .mockResolvedValueOnce([{ approver_type: 'REPORTING_MANAGER' }])
      .mockResolvedValueOnce([{ approver_type: 'REPORTING_MANAGER' }]);
    const findOne = jest.fn()
      .mockResolvedValueOnce(row)
      .mockResolvedValueOnce(null);
    const advanceAfterApproval = jest.fn().mockResolvedValue({
      is_final: false, step_order: 2, approver_user_id: nextApproverId,
    });
    const { service, save } = makeService({ query, findOne, advanceAfterApproval });

    const result = await service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined, { roles: ['HOD'] },
    );
    expect(result.status).toBe('HOD_APPROVED');
    expect(result.current_step_order).toBe(2);
    expect(result.current_approver_user_id).toBe(nextApproverId);
    expect(save).toHaveBeenCalledTimes(1);
  });
});
