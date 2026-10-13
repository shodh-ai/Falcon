import { HrService } from './hr.service';
import { HrWorkforceService } from './hr-workforce.service';

describe('HR request submission workflow lock contract', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const userId = '20000000-0000-4000-8000-000000000001';
  const approverId = '30000000-0000-4000-8000-000000000001';
  const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const routing = {
    workflow_id: '40000000-0000-4000-8000-000000000001',
    step_order: 1,
    approver_user_id: approverId,
    approver_type: 'REPORTING_MANAGER',
    is_final: false,
  };

  function submissionPort(events: string[]) {
    const save = jest.fn(async (row) => {
      events.push('transaction-save');
      return { ...row, leave_id: 'saved-leave' };
    });
    const manager = { getRepository: jest.fn(() => ({ save })) };
    const withInitializedRequest = jest.fn(async (
      _tenantId, _entityId, _type, _userId, persist,
    ) => {
      events.push('transaction-begin');
      const result = await persist(routing, manager);
      events.push('transaction-commit');
      return result;
    });
    return { save, manager, withInitializedRequest };
  }

  it('persists a workforce request before notifying, using the routing transaction manager', async () => {
    const events: string[] = [];
    const port = submissionPort(events);
    const users = {
      findOne: jest.fn().mockResolvedValue({ user_id: userId, name: 'Requester' }),
      manager: {
        query: jest.fn().mockResolvedValue([{ entity_id: 7 }]),
        connection: { query: jest.fn().mockResolvedValue([]) },
      },
    };
    const requests = { create: jest.fn((row) => row), save: jest.fn() };
    const service = Object.assign(Object.create(HrWorkforceService.prototype), {
      users, requests,
      hrWorkflow: { withInitializedRequest: port.withInitializedRequest },
    }) as HrWorkforceService;
    (service as unknown as { notifyWorkflowApprover: jest.Mock }).notifyWorkflowApprover =
      jest.fn(async () => { events.push('notification'); });

    await expect(service.applyRequest(userId, tenantId, {
      request_type: 'LEAVE', leave_type: 'CL', start_date: date, end_date: date,
    })).resolves.toMatchObject({ leave_id: 'saved-leave', workflow_id: routing.workflow_id });
    expect(port.withInitializedRequest).toHaveBeenCalledWith(
      tenantId, 7, 'LEAVE', userId, expect.any(Function),
    );
    expect(port.manager.getRepository).toHaveBeenCalled();
    expect(requests.save).not.toHaveBeenCalled();
    expect(events).toEqual([
      'transaction-begin', 'transaction-save', 'transaction-commit', 'notification',
    ]);
  });

  it('persists the legacy staff-leave entry path in the routing transaction', async () => {
    const events: string[] = [];
    const port = submissionPort(events);
    const users = {
      manager: {
        query: jest.fn().mockResolvedValue([{ entity_id: 7 }]),
        connection: { query: jest.fn().mockResolvedValue([]) },
      },
    };
    const staffLeaveRequests = { create: jest.fn((row) => row), save: jest.fn() };
    const service = Object.assign(Object.create(HrService.prototype), {
      users, staffLeaveRequests,
      leavePolicies: { validateLeaveApplication: jest.fn().mockResolvedValue(undefined) },
      hrWorkflow: { withInitializedRequest: port.withInitializedRequest },
    }) as HrService;

    await expect(service.applyStaffLeave(userId, tenantId, {
      leave_type: 'CL', start_date: date, end_date: date,
    })).resolves.toMatchObject({ leave_id: 'saved-leave', workflow_id: routing.workflow_id });
    expect(port.withInitializedRequest).toHaveBeenCalledWith(
      tenantId, 7, 'LEAVE', userId, expect.any(Function),
    );
    expect(staffLeaveRequests.save).not.toHaveBeenCalled();
    expect(events).toEqual(['transaction-begin', 'transaction-save', 'transaction-commit']);
  });
});
