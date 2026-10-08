import { BadRequestException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HrWorkflowRoutingService } from './hr-workflow-routing.service';
import type { HrWorkflowBuilderService } from './hr-workflow-builder.service';

describe('HrWorkflowRoutingService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000001';
  const approverId = '30000000-0000-4000-8000-000000000001';

  function createService(
    queryResult: unknown[],
    fallbackApprover: string | null,
  ) {
    const dataSource = {
      query: jest.fn().mockResolvedValue(queryResult),
    } as unknown as DataSource;
    const workflowBuilder = {
      resolveDefaultApprover: jest.fn().mockResolvedValue(fallbackApprover),
      resolveNextApprover: jest.fn(),
    } as unknown as HrWorkflowBuilderService;
    return new HrWorkflowRoutingService(dataSource, workflowBuilder);
  }

  it('uses a real approver rather than auto-approving when no workflow exists', async () => {
    const service = createService([], approverId);

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
    const service = createService([], null);

    await expect(
      service.initializeRequest(tenantId, 1, 'LEAVE', requesterId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
