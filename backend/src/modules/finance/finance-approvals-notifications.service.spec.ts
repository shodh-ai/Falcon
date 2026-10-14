import { FinanceApprovalsService } from './finance-approvals.service';

describe('Finance approval notifications', () => {
  const dbQuery = jest.fn();
  const managerQuery = jest.fn();
  const createNotification = jest.fn();
  const service = new FinanceApprovalsService(
    { query: dbQuery } as never,
    {} as never,
    { create: createNotification } as never,
  );

  beforeEach(() => {
    dbQuery.mockReset();
    managerQuery.mockReset();
    createNotification.mockReset().mockResolvedValue({});
  });

  it('writes the approval inside the supplied expense transaction without notifying before commit', async () => {
    managerQuery.mockResolvedValueOnce([{ approval_id: 'approval-1' }]);
    const approvalId = await service.createApprovalRequest(
      {
        tenantId: 'tenant-gvmc',
        entityType: 'VENDOR_INVOICE',
        entityId: 'invoice-1',
        requestedBy: 'requester-1',
        amount: 150000,
      },
      { query: managerQuery } as never,
    );
    expect(approvalId).toBe('approval-1');
    expect(managerQuery).toHaveBeenCalledTimes(1);
    expect(dbQuery).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it('targets only active Finance approvers in the same tenant after commit', async () => {
    dbQuery.mockResolvedValueOnce([{ user_id: 'cfo-user' }]);
    await service.notifyFinanceApprovers(
      'tenant-gvmc',
      'approval-1',
      'VENDOR_INVOICE',
      150000,
    );
    expect(dbQuery).toHaveBeenCalledWith(
      expect.stringContaining(
        "r.role_name IN ('CFO','Chairman','President','SuperAdmin')",
      ),
      ['tenant-gvmc'],
    );
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-gvmc',
        userId: 'cfo-user',
        category: 'FINANCE',
        intent: 'action_required',
      }),
    );
  });
});
