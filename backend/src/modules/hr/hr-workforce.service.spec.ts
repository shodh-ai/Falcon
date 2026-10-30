import { BadRequestException } from '@nestjs/common';
import type { EntityManager, Repository } from 'typeorm';
import { HrDailyAttendance } from '../../entities/hr-daily-attendance.entity';
import { HrHoliday } from '../../entities/hr-holiday.entity';
import { LeaveBalance } from '../../entities/leave-balance.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { HrWorkforceService } from './hr-workforce.service';
import type { HrAccessControlService } from './hr-access-control.service';
import type { HrWorkflowRoutingService } from './hr-workflow-routing.service';

describe('HrWorkforceService approval transitions', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const actorId = '20000000-0000-4000-8000-000000000001';
  const staffId = '30000000-0000-4000-8000-000000000001';
  const hrApproverId = '40000000-0000-4000-8000-000000000001';
  const workflowId = '50000000-0000-4000-8000-000000000001';

  function createService(overrides?: {
    row?: Partial<StaffLeaveRequest>;
    auditWrite?: jest.Mock;
    nextStage?: {
      workflow_id: string;
      step_order: number;
      approver_user_id: string;
      approver_type: string;
      approver_ref?: string | null;
      is_final: boolean;
    };
  }) {
    const row = {
      leave_id: '60000000-0000-4000-8000-000000000001',
      tenant_id: tenantId,
      staff_user_id: staffId,
      request_type: 'ON_DUTY',
      leave_type: 'OD',
      start_date: '2026-10-30',
      end_date: '2026-10-30',
      status: 'PENDING',
      entity_id: 1,
      workflow_id: workflowId,
      current_step_order: 1,
      current_approver_user_id: actorId,
      ...overrides?.row,
    } as StaffLeaveRequest;
    const savedRows: StaffLeaveRequest[] = [];
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(row),
      save: jest.fn((value: StaffLeaveRequest) => {
        savedRows.push({ ...value });
        return value;
      }),
    };
    const auditWrite = overrides?.auditWrite ?? jest.fn().mockResolvedValue([]);
    const transactionManager = {
      getRepository: jest.fn().mockReturnValue(requestRepository),
      query: auditWrite,
    };
    const connection = {
      transaction: jest.fn(
        (callback: (manager: EntityManager) => Promise<unknown>) =>
          callback(transactionManager as unknown as EntityManager),
      ),
      query: jest.fn().mockResolvedValue([]),
    };
    const users = {
      manager: {
        connection,
        query: jest.fn((sql: string) => {
          if (sql.includes('SELECT r.role_name')) return [{ role_name: 'HOD' }];
          if (sql.includes('SELECT steps.approver_type')) {
            return [{ approver_type: 'REPORTING_MANAGER', approver_ref: null }];
          }
          return [];
        }),
      },
      findOne: jest.fn(({ where }: { where: { user_id: string } }) =>
        where.user_id === staffId
          ? { user_id: staffId, tenant_id: tenantId, name: 'Employee' }
          : null,
      ),
    };
    const workflow = {
      assertActorIsCurrentApprover: jest.fn(),
      advanceAfterApproval: jest.fn().mockResolvedValue(
        overrides?.nextStage ?? {
          workflow_id: workflowId,
          step_order: 2,
          approver_user_id: hrApproverId,
          approver_type: 'HR_EXECUTIVE',
          approver_ref: null,
          is_final: false,
        },
      ),
    };
    const accessControl = { assertWorkflowApproverPower: jest.fn() };
    const service = new HrWorkforceService(
      {} as Repository<HrHoliday>,
      {} as Repository<HrDailyAttendance>,
      {} as Repository<StaffLeaveRequest>,
      {} as Repository<LeaveBalance>,
      {} as Repository<StaffAttendance>,
      users as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workflow as unknown as HrWorkflowRoutingService,
      accessControl as unknown as HrAccessControlService,
    );
    return {
      service,
      row,
      requestRepository,
      connection,
      users,
      workflow,
      savedRows,
      auditWrite,
    };
  }

  it('moves an approved first stage to the pending HR stage without closing the request', async () => {
    const test = createService();

    const result = await test.service.actOnTeamRequest(
      actorId,
      tenantId,
      test.row.leave_id,
      'APPROVE',
      undefined,
      { roles: ['HOD'] },
    );

    expect(test.connection.transaction).toHaveBeenCalledTimes(1);
    expect(test.requestRepository.findOne).toHaveBeenCalledWith({
      where: { leave_id: test.row.leave_id, tenant_id: tenantId },
      lock: { mode: 'pessimistic_write' },
    });
    expect(result.status).toBe('HOD_APPROVED');
    expect(result.current_step_order).toBe(2);
    expect(result.current_approver_user_id).toBe(hrApproverId);
    expect(test.savedRows).toHaveLength(1);
  });

  it('rejects inconsistent stage and status instead of skipping approval', async () => {
    const test = createService({
      row: { status: 'PENDING', current_step_order: 2 },
    });

    await expect(
      test.service.actOnTeamRequest(
        actorId,
        tenantId,
        test.row.leave_id,
        'APPROVE',
        undefined,
        {
          roles: ['HR_EXECUTIVE'],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(test.workflow.advanceAfterApproval).not.toHaveBeenCalled();
    expect(test.requestRepository.save).not.toHaveBeenCalled();
  });

  it('does not persist an override transition when its audit insert fails', async () => {
    const auditWrite = jest
      .fn()
      .mockRejectedValue(new Error('audit unavailable'));
    const test = createService({ auditWrite });

    await expect(
      test.service.actOnTeamRequest(
        actorId,
        tenantId,
        test.row.leave_id,
        'APPROVE',
        undefined,
        {
          adminOverride: true,
          roles: ['HRAdmin'],
        },
      ),
    ).rejects.toThrow('audit unavailable');
    expect(auditWrite).toHaveBeenCalled();
    expect(test.requestRepository.save).not.toHaveBeenCalled();
  });
});
