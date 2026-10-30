import { ForbiddenException } from '@nestjs/common';
import { FinanceController } from './finance.controller';

describe('FinanceController tenant scope', () => {
  const accounts = { listBudgets: jest.fn() };
  let controller: FinanceController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new FinanceController(
      {} as never,
      {} as never,
      accounts as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('fails closed instead of selecting a default tenant when context is absent', () => {
    expect(() =>
      controller.budgets({ user: { user_id: 'finance-user' } }),
    ).toThrow(ForbiddenException);
    expect(accounts.listBudgets).not.toHaveBeenCalled();
  });

  it('passes the authenticated tenant to the budget query', async () => {
    accounts.listBudgets.mockResolvedValue([]);
    await controller.budgets({
      user: { user_id: 'finance-user', tenant_id: 'tenant-a' },
    });
    expect(accounts.listBudgets).toHaveBeenCalledWith('tenant-a');
  });
});
