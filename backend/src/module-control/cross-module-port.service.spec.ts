import { CrossModulePortService } from './cross-module-port.service';

const command = {
  tenantId: 'tenant-a',
  sourceModule: 'hrms_ess' as const,
  targetModule: 'finance_procurement' as const,
  operationType: 'POST_PAYROLL',
  sourceAggregateId: 'payroll-1',
  sourceRevision: 7,
  idempotencyKey: 'payroll-1:r7',
  payload: { amount: 100 },
};

describe('CrossModulePortService', () => {
  it('queues an idempotent handoff when the target is unavailable', async () => {
    const modules = {
      isAvailable: jest.fn().mockResolvedValue(false),
      enqueueHandoff: jest.fn().mockResolvedValue({ handoff_id: 'handoff-1' }),
    };
    await expect(
      new CrossModulePortService(modules as any).dispatch(command),
    ).resolves.toEqual({ status: 'ACCEPTED_PENDING', handoffId: 'handoff-1' });
    expect(modules.enqueueHandoff).toHaveBeenCalledWith(command);
  });

  it('executes a registered typed operation when the target is available', async () => {
    const modules = { isAvailable: jest.fn().mockResolvedValue(true) };
    const port = new CrossModulePortService(modules as any);
    const handler = jest.fn().mockResolvedValue({ posting_id: 'post-1' });
    port.register('finance_procurement', 'POST_PAYROLL', handler);
    await expect(port.dispatch(command)).resolves.toEqual({
      status: 'COMPLETED',
      result: { posting_id: 'post-1' },
    });
    expect(handler).toHaveBeenCalledWith(command);
  });

  it('does not claim completion for an unregistered target operation', async () => {
    const modules = { isAvailable: jest.fn().mockResolvedValue(true) };
    await expect(
      new CrossModulePortService(modules as any).dispatch(command),
    ).resolves.toEqual({
      status: 'REJECTED',
      reason: 'TARGET_OPERATION_NOT_REGISTERED',
    });
  });
});
