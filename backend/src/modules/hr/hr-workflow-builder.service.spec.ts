import type { DataSource } from 'typeorm';
import { HrWorkflowBuilderService } from './hr-workflow-builder.service';
import type { HrAccessControlService } from './hr-access-control.service';

describe('HrWorkflowBuilderService', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const requesterId = '20000000-0000-4000-8000-000000000001';
  const hodId = '30000000-0000-4000-8000-000000000001';
  const hrId = '40000000-0000-4000-8000-000000000001';

  function createService(query: jest.Mock) {
    const dataSource = { query } as unknown as DataSource;
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
  });
});
