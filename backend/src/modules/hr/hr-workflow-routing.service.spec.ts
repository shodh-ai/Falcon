import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';

describe('HrWorkflowRoutingService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000001';
  const approverId = '30000000-0000-4000-8000-000000000001';

  function createService(
    queryResult: unknown[],
    fallbackManager: string | null,
    fallbackHr: string | null,
  ) {
    const dataSource = {
      query: jest.fn().mockResolvedValue(queryResult),
    } as unknown as DataSource;
    const workflowBuilder = {
      resolveFallbackManager: jest.fn().mockResolvedValue(fallbackManager),
      resolveFallbackHrApprover: jest.fn().mockResolvedValue(fallbackHr),
      resolveNextApprover: jest.fn(),
      assertWorkflowHasHrTerminal: jest.fn(),
      assertCurrentStepIsFinalHr: jest.fn(),
    } as unknown as HrWorkflowBuilderService;
    return new HrWorkflowRoutingService(dataSource, workflowBuilder);
  }

  it('uses a real approver rather than auto-approving when no workflow exists', async () => {
    const service = createService([], approverId, 'hr-approver');

    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).resolves.toEqual({
      workflow_id: null,
      step_order: 1,
      approver_user_id: approverId,
      approver_type: 'REPORTING_MANAGER',
      is_final: false,
    });
  });

  it('fails clearly instead of creating an unassigned pending request', async () => {
    const service = createService([], approverId, null);

    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('starts directly at HR when no reporting manager exists', async () => {
    const service = createService([], null, approverId);
    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).resolves.toEqual({
      workflow_id: null,
      step_order: 2,
      approver_user_id: approverId,
      approver_type: 'HR_ADMIN',
      is_final: false,
    });
  });

  it('routes fallback manager approval to independent HR, not directly to final', async () => {
    const service = createService([], approverId, 'hr-approver');
    await expect(
      service.advanceAfterApproval(
        tenantId, 1, 'LEAVE', requesterId, 1, null, approverId,
      ),
    ).resolves.toEqual({
      workflow_id: null,
      step_order: 2,
      approver_user_id: 'hr-approver',
      approver_type: 'HR_ADMIN',
      is_final: false,
    });
    await expect(
      service.advanceAfterApproval(
        tenantId, 1, 'LEAVE', requesterId, 2, null, 'hr-approver',
      ),
    ).resolves.toMatchObject({ is_final: true });
  });

  it('advances a request against its pinned workflow even after active configuration changes', async () => {
    const service = createService([], null, null);
    const builder = (service as unknown as {
      workflowBuilder: { resolveNextApprover: jest.Mock };
    }).workflowBuilder;
    builder.resolveNextApprover.mockResolvedValue({
      step_order: 2,
      approver_user_id: approverId,
      approver_type: 'HR_ADMIN',
    });
    await expect(
      service.advanceAfterApproval(
        tenantId, 1, 'LEAVE', requesterId, 1, 'original-workflow', 'manager',
      ),
    ).resolves.toMatchObject({
      workflow_id: 'original-workflow',
      step_order: 2,
      approver_user_id: approverId,
    });
    expect(builder.resolveNextApprover).toHaveBeenCalledWith(
      tenantId, 1, 'LEAVE', requesterId, 1, 'original-workflow', 'manager',
    );
  });

  it('does not finalize an in-flight request when the pinned workflow lacks a final HR step', async () => {
    const service = createService([], null, null);
    const builder = (service as unknown as {
      workflowBuilder: {
        resolveNextApprover: jest.Mock;
        assertCurrentStepIsFinalHr: jest.Mock;
      };
    }).workflowBuilder;
    builder.resolveNextApprover.mockResolvedValue(null);
    builder.assertCurrentStepIsFinalHr.mockRejectedValue(
      new BadRequestException('An independent final HR approval step is required before completion'),
    );
    await expect(
      service.advanceAfterApproval(
        tenantId, 1, 'LEAVE', requesterId, 1, 'custom-workflow', approverId,
      ),
    ).rejects.toThrow('An independent final HR approval step is required');
    expect(builder.assertCurrentStepIsFinalHr).toHaveBeenCalledWith(
      tenantId, 1, 'LEAVE', 'custom-workflow', 1,
    );
  });

  it('rejects entry into a legacy active workflow lacking terminal HR review', async () => {
    const service = createService([{ workflow_id: 'unsafe-workflow' }], null, null);
    const builder = (service as unknown as {
      workflowBuilder: {
        resolveNextApprover: jest.Mock;
        assertWorkflowHasHrTerminal: jest.Mock;
      };
    }).workflowBuilder;
    builder.assertWorkflowHasHrTerminal.mockRejectedValue(
      new BadRequestException('An independent final HR approval step is required before submission'),
    );
    await expect(service.initializeRequest(
      tenantId, 1, 'LEAVE', requesterId,
    )).rejects.toThrow('An independent final HR approval step is required');
    expect(builder.resolveNextApprover).not.toHaveBeenCalled();
  });

  it('holds the selected workflow through request persistence in the same transaction', async () => {
    const events: string[] = [];
    let releaseSave!: () => void;
    const saveGate = new Promise<void>((resolve) => { releaseSave = resolve; });
    const manager = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        events.push('locked');
        expect(sql).toContain('FOR SHARE');
        return [{ workflow_id: 'workflow-1' }];
      }),
    };
    const dataSource = {
      query: jest.fn(),
      transaction: jest.fn(async (callback) => {
        events.push('begin');
        const result = await callback(manager);
        events.push('commit');
        return result;
      }),
    } as unknown as DataSource;
    const builder = {
      assertWorkflowHasHrTerminal: jest.fn().mockResolvedValue(undefined),
      resolveNextApprover: jest.fn().mockResolvedValue({
        step_order: 1, approver_user_id: approverId,
        approver_type: 'REPORTING_MANAGER',
      }),
    } as unknown as HrWorkflowBuilderService;
    const service = new HrWorkflowRoutingService(dataSource, builder);
    const pending = service.withInitializedRequest(
      tenantId, 1, 'LEAVE', requesterId,
      async (routing, transactionManager) => {
        expect(transactionManager).toBe(manager);
        expect(routing.workflow_id).toBe('workflow-1');
        events.push('save-start');
        await saveGate;
        events.push('save-finished');
        return 'saved-request';
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['begin', 'locked', 'save-start']);
    releaseSave();
    await expect(pending).resolves.toBe('saved-request');
    expect(events).toEqual(['begin', 'locked', 'save-start', 'save-finished', 'commit']);
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(builder.assertWorkflowHasHrTerminal).toHaveBeenCalledWith(
      tenantId, 1, 'LEAVE', 'workflow-1', manager,
    );
    expect(builder.resolveNextApprover).toHaveBeenCalledWith(
      tenantId, 1, 'LEAVE', requesterId, 0, 'workflow-1', undefined, manager,
    );
  });

  it('serializes an admin workflow edit behind an in-flight request save', async () => {
    const events: string[] = [];
    let finishSave!: () => void;
    let finishRequestCommit!: () => void;
    const saveGate = new Promise<void>((resolve) => { finishSave = resolve; });
    const requestCommitGate = new Promise<void>((resolve) => { finishRequestCommit = resolve; });
    let transactionNumber = 0;
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ workflow_id: 'workflow-1', action_type: 'LEAVE' }]),
      transaction: jest.fn(async (callback) => {
        const isRequest = ++transactionNumber === 1;
        const manager = {
          query: jest.fn(async (sql: string) => {
            if (sql.includes('FOR SHARE')) {
              events.push('request-lock');
              return [{ workflow_id: 'workflow-1' }];
            }
            if (sql.includes('FOR UPDATE')) {
              events.push('admin-waits');
              await requestCommitGate;
              events.push('admin-lock');
              return [{ workflow_id: 'workflow-1', action_type: 'LEAVE' }];
            }
            if (sql.includes('UPDATE hr_approval_workflows')) {
              events.push('admin-update');
            }
            return [];
          }),
        };
        const result = await callback(manager);
        if (isRequest) {
          events.push('request-commit');
          finishRequestCommit();
        }
        return result;
      }),
    } as unknown as DataSource;
    const routeBuilder = {
      assertWorkflowHasHrTerminal: jest.fn().mockResolvedValue(undefined),
      resolveNextApprover: jest.fn().mockResolvedValue({
        step_order: 1, approver_user_id: approverId,
        approver_type: 'REPORTING_MANAGER',
      }),
    } as unknown as HrWorkflowBuilderService;
    const routing = new HrWorkflowRoutingService(dataSource, routeBuilder);
    const adminBuilder = new HrWorkflowBuilderService(dataSource, {} as never);

    const submission = routing.withInitializedRequest(
      tenantId, 1, 'LEAVE', requesterId,
      async () => {
        await saveGate;
        events.push('request-save');
        return 'saved';
      },
    );
    await new Promise((resolve) => setImmediate(resolve));
    const adminEdit = adminBuilder.updateWorkflow(tenantId, 1, 'workflow-1', {
      workflow_name: 'Revised',
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(events).toEqual(['request-lock', 'admin-waits']);
    finishSave();
    await submission;
    await adminEdit;
    expect(events).toEqual([
      'request-lock', 'admin-waits', 'request-save',
      'request-commit', 'admin-lock', 'admin-update',
    ]);
  });
});
