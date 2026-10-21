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
    transaction?: jest.Mock;
  } = {}) {
    const query = options.query ?? jest.fn().mockResolvedValue([]);
    const transaction = options.transaction ?? jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
      callback({ query }),
    );
    const findOne = options.findOne ?? jest.fn().mockResolvedValue(null);
    const save = options.save ?? jest.fn().mockImplementation(async (row) => row);
    const advanceAfterApproval = options.advanceAfterApproval ?? jest.fn();
    const requests = { findOne, save };
    const users = { manager: { query, connection: { query, transaction } }, findOne };
    const hrWorkflow = {
      assertActorIsCurrentApprover: jest.fn(),
      advanceAfterApproval,
    };
    const accessControl = {
      assertWorkflowApproverPower: jest.fn(),
      departmentScopeClause: jest.fn().mockResolvedValue({ clause: '', params: [] }),
    };
    const service = new HrWorkforceService(
      {} as never, {} as never, requests as never, {} as never,
      {} as never, users as never, {} as never, {} as never,
      { notifyApprover: jest.fn() } as never, {} as never,
      hrWorkflow as never, accessControl as never,
    );
    return { service, query, transaction, findOne, save, hrWorkflow, accessControl };
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

  it('includes on-duty final sign-offs with leave, without mixing regularizations', async () => {
    const { service, query } = makeService();
    await service.listHrReviewPending(tenantId, 7, approverId, 'LEAVE');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain("(r.request_type = $4 OR ($4 = 'LEAVE' AND r.request_type = 'ON_DUTY'))");
    expect(sql).toContain('r.current_approver_user_id = $3');
    expect(sql).toContain('p.entity_id = $2');
    expect(params).toEqual([tenantId, 7, approverId, 'LEAVE']);
  });

  it('keeps final HR review out of the manager inbox even for a dual-role approver', async () => {
    const { service, query } = makeService();
    await service.listPendingInbox(approverId, tenantId, ['HOD', 'HRAdmin']);
    const [sql] = query.mock.calls[0];
    expect(sql).toContain('AND NOT (r.request_type IN');
    expect(sql).toContain("hr_step.approver_type IN ('HR_ADMIN', 'HR_EXECUTIVE')");
    expect(sql).toContain('r.current_approver_user_id = $2');
  });

  it('requires an explicit reason before any admin override, including final review', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      request_type: 'LEAVE', status: 'HOD_APPROVED', workflow_id: 'workflow-id',
      current_step_order: 2, current_approver_user_id: approverId,
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HRAdmin' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }]);
    const { service, transaction } = makeService({
      query,
      findOne: jest.fn().mockResolvedValue(row),
    });
    await expect(service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined,
      { adminOverride: true, roles: ['HRAdmin'] },
    )).rejects.toThrow('override reason');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('includes first-level regularizations read-only only when explicitly requested', async () => {
    const { service, query } = makeService();
    await service.listHrReviewPending(tenantId, 7, approverId, 'REGULARIZATION', true);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('supervisory visibility');
    expect(sql).toContain('AS can_review');
    expect(sql).toContain("THEN 'FINAL_HR' ELSE 'FIRST_LEVEL'");
    expect(sql).toContain('access.department_scope');
    expect(params).toEqual([tenantId, 7, approverId, 'REGULARIZATION']);
    query.mockClear();
    await service.listHrReviewPending(tenantId, 7, approverId, 'LEAVE', true);
    expect(query.mock.calls[0][0]).not.toContain('supervisory visibility');
  });

  it('denies self approval even when the caller is an HR override administrator', async () => {
    const { service, query } = makeService({ findOne: jest.fn().mockResolvedValue({
      staff_user_id: approverId, tenant_id: tenantId, leave_id: 'self',
    }) });
    await expect(service.actOnTeamRequest(approverId, tenantId, 'self', 'APPROVE', 'Test override reason', { adminOverride: true }))
      .rejects.toThrow('your own request');
    expect(query).not.toHaveBeenCalled();
  });

  it.each(['APPROVE', 'REJECT'] as const)('allows an independent final HR override %s with a scoped, audited reason', async (action) => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', status: 'HOD_APPROVED', workflow_id: 'workflow-id',
      current_step_order: 2, current_approver_user_id: nextApproverId, entity_id: 7,
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM user_roles ur JOIN roles')) return [{ role_name: 'HRAdmin' }];
      if (sql.includes('SELECT r.leave_id FROM staff_leave_requests')) return [{ leave_id: 'leave-id' }];
      if (sql.includes('SELECT actor_user_id FROM hr_staff_request_decisions')) return [{ actor_user_id: nextApproverId }];
      if (sql.includes('SELECT approver_type')) return [{ approver_type: 'HR_ADMIN' }];
      if (sql.includes('UPDATE staff_leave_requests')) return [{ ...row, status: action === 'APPROVE' ? 'HR_APPROVED' : 'REJECTED' }];
      return [];
    });
    const { service } = makeService({ query, findOne: jest.fn().mockResolvedValue(row), advanceAfterApproval: jest.fn().mockResolvedValue({ is_final: true }) });
    jest.spyOn(service as unknown as { applyApprovalSideEffects: () => Promise<void> }, 'applyApprovalSideEffects').mockResolvedValue(undefined);
    jest.spyOn(service as unknown as { recalculateApprovedAttendance: () => Promise<void> }, 'recalculateApprovedAttendance').mockResolvedValue(undefined);
    jest.spyOn(service as unknown as { notifyEmployeeDecision: () => Promise<void> }, 'notifyEmployeeDecision').mockResolvedValue(undefined);
    const result = await service.actOnTeamRequest(approverId, tenantId, row.leave_id, action, 'Assigned reviewer is unavailable', { adminOverride: true });
    expect(result.status).toBe(action === 'APPROVE' ? 'HR_APPROVED' : 'REJECTED');
    const audit = query.mock.calls.find(([sql]) => sql.includes('INSERT INTO hr_override_logs'));
    expect(audit).toBeDefined();
    expect((query.mock.calls as unknown as Array<[string, string[]]>).find(([sql]) => sql.includes('INSERT INTO hr_override_logs'))?.[1]).toEqual(expect.arrayContaining([approverId, 'leave-id', '2', 'Assigned reviewer is unavailable']));
  });

  it('never bypasses maker-checker separation when the final override actor already approved', async () => {
    const row = { leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id', staff: {}, request_type: 'LEAVE',
      status: 'HOD_APPROVED', workflow_id: 'workflow-id', current_step_order: 2, current_approver_user_id: approverId, entity_id: 7 };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM user_roles ur JOIN roles')) return [{ role_name: 'HRAdmin' }];
      if (sql.includes('SELECT r.leave_id FROM staff_leave_requests')) return [{ leave_id: 'leave-id' }];
      if (sql.includes('SELECT actor_user_id FROM hr_staff_request_decisions')) return [{ actor_user_id: approverId }];
      if (sql.includes('SELECT approver_type')) return [{ approver_type: 'HR_ADMIN' }];
      return [];
    });
    const { service } = makeService({ query, findOne: jest.fn().mockResolvedValue(row), advanceAfterApproval: jest.fn().mockResolvedValue({ is_final: true }) });
    await expect(service.actOnTeamRequest(approverId, tenantId, row.leave_id, 'APPROVE', 'Assigned reviewer is unavailable', { adminOverride: true }))
      .rejects.toThrow('previous approver');
    expect(query.mock.calls.some(([sql]) => sql.includes('UPDATE staff_leave_requests'))).toBe(false);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO hr_override_logs'))).toBe(false);
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

  it('checks current DB roles rather than stale token roles at the HR step', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'HOD_APPROVED',
      workflow_id: 'workflow-id', current_step_order: 2,
      current_approver_user_id: approverId, entity_id: 7,
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HOD' }])
      .mockResolvedValueOnce([{ approver_type: 'ROLE', approver_ref: 'HR' }]);
    const { service, accessControl, transaction } = makeService({
      query, findOne: jest.fn().mockResolvedValue(row),
    });
    accessControl.assertWorkflowApproverPower.mockRejectedValue(
      new Error('Current HR role is required'),
    );
    await expect(service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined,
      { roles: ['HR'] }, // stale JWT claim
    )).rejects.toThrow('Current HR role is required');
    expect(accessControl.assertWorkflowApproverPower).toHaveBeenCalledWith(
      tenantId, approverId, ['HOD'], 'ROLE:HR', 'LEAVE',
    );
    expect(transaction).not.toHaveBeenCalled();
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
      .mockResolvedValueOnce([{ approver_type: 'REPORTING_MANAGER' }])
      .mockImplementationOnce(async (_sql: string, _params: unknown[]) => [{
        ...row,
        status: 'HOD_APPROVED',
        current_step_order: 2,
        current_approver_user_id: nextApproverId,
      }]);
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
    expect(save).not.toHaveBeenCalled();
    const [updateSql, updateParams] = query.mock.calls[3];
    expect(updateSql).toContain('UPDATE staff_leave_requests');
    expect(updateSql).toContain('current_approver_user_id IS NOT DISTINCT FROM $9::uuid');
    expect(updateParams).toEqual([
      'HOD_APPROVED', 2, nextApproverId, null,
      tenantId, 'leave-id', 'PENDING', 1, approverId,
    ]);
  });

  it('does not run approval side effects when another reviewer wins the final-decision race', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'HOD_APPROVED',
      workflow_id: 'workflow-id', current_step_order: 2,
      current_approver_user_id: approverId, entity_id: 7,
      start_date: '2026-10-14', end_date: '2026-10-14',
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HR' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }])
      .mockResolvedValueOnce([{ actor_user_id: nextApproverId }])
      .mockResolvedValueOnce([]);
    const findOne = jest.fn().mockResolvedValue(row);
    const advanceAfterApproval = jest.fn().mockResolvedValue({ is_final: true });
    const { service } = makeService({ query, findOne, advanceAfterApproval });
    const sideEffects = jest.spyOn(
      service as unknown as { applyApprovalSideEffects: (request: unknown) => Promise<void> },
      'applyApprovalSideEffects',
    ).mockResolvedValue(undefined);

    await expect(service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined, { roles: ['HR'] },
    )).rejects.toThrow('Request changed while approval was in progress');
    expect(sideEffects).not.toHaveBeenCalled();
    expect(query.mock.calls[4][0]).toContain('current_approver_user_id IS NOT DISTINCT FROM');
  });

  it('keeps final approval and leave-balance deduction inside one transaction', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'HOD_APPROVED',
      workflow_id: 'workflow-id', current_step_order: 2,
      current_approver_user_id: approverId, entity_id: 7,
      start_date: '2026-10-14', end_date: '2026-10-14',
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HR' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }]);
    const transactionalQuery = jest.fn()
      .mockResolvedValueOnce([{ actor_user_id: nextApproverId }])
      .mockResolvedValueOnce([{ ...row, status: 'HR_APPROVED' }])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Balance update failed'));
    const transaction = jest.fn(async (callback: (manager: unknown) => Promise<unknown>) =>
      callback({ query: transactionalQuery }),
    );
    const { service } = makeService({
      query, findOne: jest.fn().mockResolvedValue(row), transaction,
      advanceAfterApproval: jest.fn().mockResolvedValue({ is_final: true }),
    });
    await expect(service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined, { roles: ['HR'] },
    )).rejects.toThrow('Balance update failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionalQuery.mock.calls[1][0]).toContain('UPDATE staff_leave_requests');
    expect(transactionalQuery.mock.calls[2][0]).toContain('INSERT INTO hr_staff_request_decisions');
    expect(transactionalQuery.mock.calls[3][0]).toContain('UPDATE hr_leave_balances');
  });

  it('blocks final sign-off when a legacy HOD decision has no verifiable actor history', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'HOD_APPROVED',
      workflow_id: 'workflow-id', current_step_order: 2,
      current_approver_user_id: approverId, entity_id: 7,
    };
    const query = jest.fn()
      .mockResolvedValueOnce([{ role_name: 'HR' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }])
      .mockResolvedValueOnce([{ approver_type: 'HR_ADMIN' }])
      .mockResolvedValueOnce([]);
    const { service } = makeService({
      query, findOne: jest.fn().mockResolvedValue(row),
      advanceAfterApproval: jest.fn().mockResolvedValue({ is_final: true }),
    });
    await expect(service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', undefined, { roles: ['HR'] },
    )).rejects.toThrow('Prior approval actor is unverified');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('UPDATE staff_leave_requests'))).toBe(false);
  });

  it('routes an override using its actual actor rather than the bypassed HOD', async () => {
    const row = {
      leave_id: 'leave-id', tenant_id: tenantId, staff_user_id: 'staff-id',
      staff: { user_id: 'staff-id', name: 'Employee', tenant_id: tenantId },
      request_type: 'LEAVE', leave_type: 'CL', status: 'PENDING',
      workflow_id: 'workflow-id', current_step_order: 1,
      current_approver_user_id: nextApproverId, entity_id: 7,
    };
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('FROM user_roles ur JOIN roles')) return [{ role_name: 'HRAdmin' }];
      if (sql.includes('SELECT r.role_name FROM users u')) return [{ role_name: 'HOD' }];
      if (sql.includes('SELECT employee_id FROM hr_employee_profiles')) return [{ employee_id: 'EMP-1' }];
      if (sql.includes('SELECT approver_type')) return [{ approver_type: 'REPORTING_MANAGER' }];
      if (sql.includes('SELECT r.leave_id FROM staff_leave_requests')) return [{ leave_id: 'leave-id' }];
      if (sql.includes('UPDATE staff_leave_requests')) return [{ ...row, status: 'HOD_APPROVED' }];
      return [];
    });
    const advanceAfterApproval = jest.fn().mockResolvedValue({
      is_final: false, step_order: 2, approver_user_id: 'independent-hr',
    });
    const { service } = makeService({
      query, findOne: jest.fn().mockResolvedValue(row), advanceAfterApproval,
    });
    jest.spyOn(
      service as unknown as { notifyWorkflowApprover: (...args: unknown[]) => Promise<void> },
      'notifyWorkflowApprover',
    ).mockResolvedValue(undefined);
    await service.actOnTeamRequest(
      approverId, tenantId, row.leave_id, 'APPROVE', 'Manager is unavailable; HR intervened',
      { adminOverride: true, roles: ['HRAdmin'] },
    );
    expect(advanceAfterApproval).toHaveBeenCalledWith(
      tenantId, 7, 'LEAVE', 'staff-id', 1, 'workflow-id', approverId,
    );
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO hr_staff_request_decisions'))).toBe(true);
  });
});
