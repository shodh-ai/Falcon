import type { DataSource } from 'typeorm';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import type { HrAccessControlService } from './hr-access-control.service';

describe('HrWorkflowBuilderService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000001';
  const hodId = '30000000-0000-4000-8000-000000000001';
  const hrId = '40000000-0000-4000-8000-000000000001';

  function createService(query: jest.Mock, transaction?: jest.Mock) {
    const dataSource = {
      query,
      transaction: transaction ?? jest.fn((callback) => callback({ query })),
    } as unknown as DataSource;
    const accessControl = {
      moduleForActionType: jest.fn(),
      resolveHrExecutiveApprover: jest.fn(),
      resolveHrAdminApprover: jest.fn(),
    } as unknown as HrAccessControlService;
    return new HrWorkflowBuilderService(dataSource, accessControl);
  }

  it('falls back from a missing reporting officer to the department HOD', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([
        {
          step_order: 1,
          approver_type: 'REPORTING_MANAGER',
          approver_ref: null,
        },
      ])
      .mockResolvedValueOnce([{ approver_user_id: hodId }]);
    const service = createService(query);

    await expect(
      service.resolveNextApprover(tenantId, 1, 'LEAVE', requesterId, 0),
    ).resolves.toEqual({
      step_order: 1,
      approver_user_id: hodId,
      approver_type: 'REPORTING_MANAGER',
    });
  });

  it('skips a self/unassigned HOD step and routes to the next HR step', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([
        { step_order: 1, approver_type: 'DEPT_HEAD', approver_ref: null },
        { step_order: 2, approver_type: 'ROLE', approver_ref: 'HR' },
      ])
      .mockResolvedValueOnce([{ approver_user_id: null }])
      .mockResolvedValueOnce([{ user_id: hrId }]);
    const service = createService(query);

    await expect(
      service.resolveNextApprover(tenantId, 1, 'LEAVE', requesterId, 0),
    ).resolves.toEqual({
      step_order: 2,
      approver_user_id: hrId,
      approver_type: 'ROLE',
    });
  });

  it('resolves an HR fallback when the requester has no manager or HOD', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ approver_user_id: null }])
      .mockResolvedValueOnce([{ user_id: hrId }]);
    const service = createService(query);

    await expect(
      service.resolveDefaultApprover(tenantId, requesterId),
    ).resolves.toBe(hrId);
    expect(query.mock.calls[1][0]).toContain("primary_role.role_name IN ('HRAdmin', 'SuperAdmin')");
  });

  it('fails closed when the mandatory final HR approver is missing', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([
        { step_order: 2, approver_type: 'HR_ADMIN', approver_ref: null },
      ]);
    const service = createService(query);

    await expect(
      service.resolveNextApprover(tenantId, 1, 'ON_DUTY', requesterId, 1),
    ).rejects.toThrow('An independent HR approver is not configured');
  });

  it('does not skip an unassigned ROLE HR final step', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([
        { step_order: 2, approver_type: 'ROLE', approver_ref: 'HR' },
      ])
      .mockResolvedValueOnce([]);
    const service = createService(query);
    await expect(
      service.resolveNextApprover(tenantId, 1, 'LEAVE', requesterId, 1),
    ).rejects.toThrow('An independent HR approver is not configured');
  });

  it('excludes the requester when finding an independent HR-admin approver', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([
        { step_order: 2, approver_type: 'HR_ADMIN', approver_ref: null },
      ]);
    const accessControl = {
      resolveHrAdminApprover: jest.fn().mockResolvedValue(hrId),
    };
    const service = new HrWorkflowBuilderService(
      { query } as never,
      accessControl as never,
    );
    await expect(
      service.resolveNextApprover(tenantId, 1, 'ON_DUTY', requesterId, 1),
    ).resolves.toEqual({
      step_order: 2,
      approver_user_id: hrId,
      approver_type: 'HR_ADMIN',
    });
    expect(accessControl.resolveHrAdminApprover).toHaveBeenCalledWith(
      tenantId,
      requesterId,
      undefined,
      undefined,
    );
  });

  it('selects a different HR approver when the HOD also has an HR role', async () => {
    const dualRoleHod = hodId;
    const query = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([{ step_order: 2, approver_type: 'ROLE', approver_ref: 'HR' }])
      .mockResolvedValueOnce([{ user_id: hrId }]);
    const service = createService(query);
    await expect(service.resolveNextApprover(
      tenantId, 1, 'LEAVE', requesterId, 1, 'workflow-1', dualRoleHod,
    )).resolves.toMatchObject({ approver_user_id: hrId });
    expect(query.mock.calls[2][0]).toContain('u.user_id <> $4');
    expect(query.mock.calls[2][1]).toEqual([
      tenantId, 'HR', requesterId, dualRoleHod,
    ]);
  });

  it('fails closed when the prior dual-role HOD is the only eligible HR approver', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1' }])
      .mockResolvedValueOnce([{ step_order: 2, approver_type: 'HR_ADMIN', approver_ref: null }]);
    const accessControl = {
      resolveHrAdminApprover: jest.fn().mockResolvedValue(null),
    };
    const service = new HrWorkflowBuilderService(
      { query } as never,
      accessControl as never,
    );
    await expect(service.resolveNextApprover(
      tenantId, 1, 'ON_DUTY', requesterId, 1, 'workflow-1', hodId,
    )).rejects.toThrow('An independent HR approver is not configured');
    expect(accessControl.resolveHrAdminApprover).toHaveBeenCalledWith(
      tenantId, requesterId, hodId, undefined,
    );
  });

  it('uses the pinned workflow even after a different workflow becomes active', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: 'original-workflow' }])
      .mockResolvedValueOnce([
        { step_order: 2, approver_type: 'ROLE', approver_ref: 'HR' },
      ])
      .mockResolvedValueOnce([{ user_id: hrId }]);
    const service = createService(query);
    await expect(
      service.resolveNextApprover(
        tenantId, 1, 'LEAVE', requesterId, 1, 'original-workflow',
      ),
    ).resolves.toMatchObject({ approver_user_id: hrId, step_order: 2 });
    expect(query.mock.calls[0][0]).toContain('WHERE workflow_id = $1');
    expect(query.mock.calls[0][0]).not.toContain('is_active = true');
    expect(query.mock.calls[0][1]).toEqual([
      'original-workflow', tenantId, 1, 'LEAVE',
    ]);
    expect(query.mock.calls[1][1]).toEqual(['original-workflow', 1]);
  });

  it('blocks editing steps while a request is pinned to that workflow', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'original-workflow', action_type: 'LEAVE' }])
      .mockResolvedValueOnce([{ leave_id: 'pending-leave' }]);
    const service = createService(query);
    await expect(
      service.updateWorkflow(tenantId, 1, 'original-workflow', {
        steps: [{ step_order: 1, approver_type: 'ROLE', approver_ref: 'HR' }],
      }),
    ).rejects.toThrow('This workflow has pending requests');
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][1]).toEqual([
      tenantId, 1, 'original-workflow',
    ]);
  });

  it('creates a workflow and all steps in one transaction', async () => {
    const transactionQuery = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'new-workflow' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const transaction = jest.fn((callback) => callback({ query: transactionQuery }));
    const query = jest.fn().mockResolvedValueOnce([{ workflow_id: 'new-workflow', steps: [] }]);
    const service = createService(query, transaction);
    await expect(service.createWorkflow(tenantId, 1, {
      action_type: 'LEAVE', workflow_name: 'Two-step review',
      steps: [
        { step_order: 1, approver_type: 'REPORTING_MANAGER' },
        { step_order: 2, approver_type: 'ROLE', approver_ref: 'HR' },
      ],
    })).resolves.toMatchObject({ workflow_id: 'new-workflow' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionQuery).toHaveBeenCalledTimes(3);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual([tenantId, 1, 'new-workflow']);
  });

  it('throws failed step creation from inside the transaction before publishing the workflow', async () => {
    const transactionQuery = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'new-workflow' }])
      .mockRejectedValueOnce(new Error('step insert failed'));
    const transaction = jest.fn((callback) => callback({ query: transactionQuery }));
    const query = jest.fn();
    const service = createService(query, transaction);
    await expect(service.createWorkflow(tenantId, 1, {
      action_type: 'LEAVE', workflow_name: 'Unsafe partial',
      steps: [{ step_order: 1, approver_type: 'ROLE', approver_ref: 'HR' }],
    })).rejects.toThrow('step insert failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps workflow metadata and replacement steps in one transaction on update failure', async () => {
    const transactionQuery = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1', action_type: 'LEAVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('replacement step failed'));
    const transaction = jest.fn((callback) => callback({ query: transactionQuery }));
    const query = jest.fn();
    const service = createService(query, transaction);
    await expect(service.updateWorkflow(tenantId, 1, 'workflow-1', {
      workflow_name: 'Revised',
      steps: [{ step_order: 1, approver_type: 'ROLE', approver_ref: 'HR' }],
    })).rejects.toThrow('replacement step failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(transactionQuery.mock.calls[1][0]).toContain('staff_leave_requests');
    expect(transactionQuery.mock.calls[3][0]).toContain('DELETE FROM hr_approval_workflow_steps');
    expect(query).not.toHaveBeenCalled();
  });

  it('keeps step and parent deletion in one transaction', async () => {
    const transactionQuery = jest.fn()
      .mockResolvedValueOnce([{ workflow_id: 'workflow-1', action_type: 'LEAVE' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('parent delete failed'));
    const transaction = jest.fn((callback) => callback({ query: transactionQuery }));
    const query = jest.fn();
    const service = createService(query, transaction);
    await expect(service.deleteWorkflow(tenantId, 1, 'workflow-1'))
      .rejects.toThrow('parent delete failed');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transactionQuery.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(transactionQuery.mock.calls[1][0]).toContain('staff_leave_requests');
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a newly configured leave workflow ending with a manager-only decision', async () => {
    const query = jest.fn();
    const service = createService(query);
    await expect(service.createWorkflow(tenantId, 1, {
      action_type: 'LEAVE', workflow_name: 'Unsafe',
      steps: [{ step_order: 1, approver_type: 'REPORTING_MANAGER' }],
    })).rejects.toThrow('require a final HR approval step');
    expect(query).not.toHaveBeenCalled();
  });

  it('accepts only the pinned terminal HR step as final sign-off', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { approver_type: 'HR_ADMIN', approver_ref: null },
    ]);
    const service = createService(query);
    await expect(service.assertCurrentStepIsFinalHr(
      tenantId, 1, 'ON_DUTY', 'pinned-workflow', 3,
    )).resolves.toBeUndefined();
    expect(query.mock.calls[0][0]).toContain('NOT EXISTS');
    expect(query.mock.calls[0][1]).toEqual([
      tenantId, 1, 'ON_DUTY', 'pinned-workflow', 3,
    ]);
    query.mockResolvedValueOnce([{ approver_type: 'REPORTING_MANAGER' }]);
    await expect(service.assertCurrentStepIsFinalHr(
      tenantId, 1, 'ON_DUTY', 'pinned-workflow', 3,
    )).rejects.toThrow('An independent final HR approval step is required');
  });

  it('fails at submission when an existing active workflow has no final HR gate', async () => {
    const query = jest.fn().mockResolvedValueOnce([
      { approver_type: 'REPORTING_MANAGER', approver_ref: null },
    ]);
    const service = createService(query);
    await expect(service.assertWorkflowHasHrTerminal(
      tenantId, 1, 'LEAVE', 'unsafe-workflow',
    )).rejects.toThrow('An independent final HR approval step is required');
    expect(query.mock.calls[0][1]).toEqual([
      tenantId, 1, 'LEAVE', 'unsafe-workflow',
    ]);
  });
});
