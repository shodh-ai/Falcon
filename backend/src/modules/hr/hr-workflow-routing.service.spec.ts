import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import type { HrWorkflowBuilderService } from './hr-workflow-builder.service';

describe('HrWorkflowRoutingService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000001';
  const managerId = '30000000-0000-4000-8000-000000000001';
  const hrId = '40000000-0000-4000-8000-000000000001';
  const workflowId = '50000000-0000-4000-8000-000000000001';
  const stages = [
    { step_order: 1, approver_type: 'REPORTING_MANAGER', approver_ref: null },
    { step_order: 2, approver_type: 'HR_EXECUTIVE', approver_ref: null },
  ];

  function createService(query: jest.Mock, resolveNextApprover = jest.fn()) {
    const dataSource = { query } as unknown as DataSource;
    const workflowBuilder = {
      resolveDefaultApprover: jest.fn().mockResolvedValue(managerId),
      resolveNextApprover,
    } as unknown as HrWorkflowBuilderService;
    return new HrWorkflowRoutingService(dataSource, workflowBuilder);
  }

  it('blocks submissions when a required two-stage workflow is missing', async () => {
    const service = createService(jest.fn().mockResolvedValue([]));

    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).rejects.toThrow('two-stage workflow');
  });

  it('requires a configured final HR stage before routing a request', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: workflowId }])
      .mockResolvedValueOnce([
        stages[0],
        { step_order: 2, approver_type: 'DEPT_HEAD', approver_ref: null },
      ]);
    const service = createService(query);

    await expect(
      service.initializeRequest(tenantId, 1, 'ON_DUTY', requesterId),
    ).rejects.toThrow('final HR approver');
  });

  it('routes the initial approval to stage one of the linked workflow', async () => {
    const resolveNextApprover = jest
      .fn()
      .mockResolvedValueOnce({
        step_order: 1,
        approver_user_id: managerId,
        approver_type: 'REPORTING_MANAGER',
        approver_ref: null,
      })
      .mockResolvedValueOnce({
        step_order: 2,
        approver_user_id: hrId,
        approver_type: 'HR_EXECUTIVE',
        approver_ref: null,
      });
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: workflowId }])
      .mockResolvedValueOnce(stages);
    const service = createService(query, resolveNextApprover);

    await expect(
      service.initializeRequest(tenantId, 1, 'REGULARIZATION', requesterId),
    ).resolves.toEqual({
      workflow_id: workflowId,
      step_order: 1,
      approver_user_id: managerId,
      approver_type: 'REPORTING_MANAGER',
      approver_ref: null,
      is_final: false,
    });
    expect(resolveNextApprover).toHaveBeenCalledWith(
      tenantId,
      1,
      'REGULARIZATION',
      requesterId,
      0,
      { workflowId, strict: true },
    );
    expect(resolveNextApprover).toHaveBeenLastCalledWith(
      tenantId,
      1,
      'REGULARIZATION',
      requesterId,
      1,
      { workflowId, strict: true, excludedApproverUserId: managerId },
    );
  });

  it('blocks submission when no distinct final HR approver is available', async () => {
    const resolveNextApprover = jest
      .fn()
      .mockResolvedValueOnce({
        step_order: 1,
        approver_user_id: managerId,
        approver_type: 'REPORTING_MANAGER',
        approver_ref: null,
      })
      .mockResolvedValueOnce(null);
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ workflow_id: workflowId }])
      .mockResolvedValueOnce(stages);
    const service = createService(query, resolveNextApprover);

    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).rejects.toThrow('distinct final HR approver');
  });

  it('moves first-level approval to the distinct final HR approver, not to approved', async () => {
    const resolveNextApprover = jest.fn().mockResolvedValue({
      step_order: 2,
      approver_user_id: hrId,
      approver_type: 'HR_EXECUTIVE',
      approver_ref: null,
    });
    const query = jest.fn().mockResolvedValue(stages);
    const service = createService(query, resolveNextApprover);

    await expect(
      service.advanceAfterApproval(
        tenantId,
        1,
        'ON_DUTY',
        requesterId,
        1,
        workflowId,
        managerId,
      ),
    ).resolves.toEqual({
      workflow_id: workflowId,
      step_order: 2,
      approver_user_id: hrId,
      approver_type: 'HR_EXECUTIVE',
      approver_ref: null,
      is_final: false,
    });
    expect(resolveNextApprover).toHaveBeenCalledWith(
      tenantId,
      1,
      'ON_DUTY',
      requesterId,
      1,
      { workflowId, strict: true, excludedApproverUserId: managerId },
    );
  });

  it('closes only after the configured final HR stage approves', async () => {
    const service = createService(jest.fn().mockResolvedValue(stages));

    await expect(
      service.advanceAfterApproval(
        tenantId,
        1,
        'LEAVE',
        requesterId,
        2,
        workflowId,
        hrId,
      ),
    ).resolves.toEqual({
      workflow_id: workflowId,
      step_order: 2,
      approver_user_id: null,
      approver_type: null,
      is_final: true,
    });
  });

  it('exposes only a correctly configured final stage to the final approval queue', async () => {
    const service = createService(jest.fn().mockResolvedValue(stages));

    await expect(
      service.isValidFinalHrStage(tenantId, 1, workflowId, 2),
    ).resolves.toBe(true);
    await expect(
      service.isValidFinalHrStage(tenantId, 1, workflowId, 1),
    ).resolves.toBe(false);
    await expect(
      service.isValidFinalHrStage(tenantId, 1, null, 2),
    ).resolves.toBe(false);
  });

  it('hides legacy or malformed workflows from the final approval queue', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([
        stages[0],
        { step_order: 2, approver_type: 'DEPT_HEAD', approver_ref: null },
      ]);
    const service = createService(query);

    await expect(
      service.isValidFinalHrStage(tenantId, 1, workflowId, 2),
    ).resolves.toBe(false);
  });

  it('does not accept legacy unlinked requests for approval', async () => {
    const service = createService(jest.fn());

    await expect(
      service.advanceAfterApproval(
        tenantId,
        1,
        'REGULARIZATION',
        requesterId,
        1,
        null,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
