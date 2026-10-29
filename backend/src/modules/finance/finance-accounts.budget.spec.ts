import { BadRequestException } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';

describe('FinanceAccountsService budget allocation', () => {
  const dataSource = { query: jest.fn() };
  const calls = () =>
    dataSource.query.mock.calls as unknown as Array<[string, unknown[]]>;
  let service: FinanceAccountsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceAccountsService(
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  it('rejects invalid department, year, or amount before database writes', async () => {
    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 0,
        financial_year: '2026-2027',
        allocated_amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 4,
        financial_year: 'FY26',
        allocated_amount: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 4,
        financial_year: '2026-2027',
        allocated_amount: 0,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('requires the selected department to be in the current tenant budget scope', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 4,
        financial_year: '2026-2027',
        allocated_amount: 100,
      }),
    ).rejects.toThrow(/not available in this tenant/i);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(calls()[0][0]).toContain('scoped_budget.tenant_id = $1');
    expect(calls()[0][1]).toEqual(['tenant-a', 4]);
  });

  it('upserts the current tenant department-budget record after the scope check', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ dept_id: 4 }])
      .mockResolvedValueOnce([{ budget_id: 'budget-1' }]);

    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 4,
        financial_year: '2026-2027',
        allocated_amount: 100,
      }),
    ).resolves.toEqual([{ budget_id: 'budget-1' }]);

    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(calls()[1][0]).toContain('INSERT INTO fin_dept_budgets');
    expect(calls()[1][0]).toContain(
      'ON CONFLICT (tenant_id, department_id, financial_year)',
    );
    expect(calls()[1][1]).toEqual(['tenant-a', 4, '2026-2027', 100]);
  });

  it('does not silently change a locked or archived allocation', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ dept_id: 4 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.upsertBudget('tenant-a', {
        department_id: 4,
        financial_year: '2026-2027',
        allocated_amount: 100,
      }),
    ).rejects.toThrow(/locked or archived/i);
    expect(calls()[1][0]).toContain("status <> 'LOCKED'");
    expect(calls()[1][0]).toContain('deleted_at IS NULL');
  });
});
