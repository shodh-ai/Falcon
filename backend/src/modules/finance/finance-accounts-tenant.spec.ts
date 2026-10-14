import { NotFoundException } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';

describe('FinanceAccountsService tenant references', () => {
  const dataSource = { query: jest.fn(), transaction: jest.fn() };
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

  it('does not include tenantless transactions in another tenant collection', async () => {
    await service.listCollections('tenant-a');
    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('WHERE t.tenant_id = $1');
    expect(sql).not.toContain('t.tenant_id IS NULL');
    expect(params[0]).toBe('tenant-a');
  });

  it('scopes bulk demand job status to the caller tenant', async () => {
    await service.getBulkJob('tenant-a', 'job-b');
    const [sql, params] = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('job_id = $1 AND tenant_id = $2');
    expect(params).toEqual(['job-b', 'tenant-a']);
  });

  it('rejects a supplied budget ID that does not belong to the tenant', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await expect(
      service.checkBudget('tenant-a', 1, 500, 'budget-b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(dataSource.query.mock.calls[0][1]).toEqual(['budget-b', 'tenant-a']);
  });

  it('rejects an expense with a foreign expense-head ID before insertion', async () => {
    const tx = { query: jest.fn() };
    tx.query
      .mockResolvedValueOnce([
        { default_tds_rate: 0, business_name: 'Vendor A' },
      ])
      .mockResolvedValueOnce([]);
    dataSource.transaction.mockImplementationOnce(
      async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx),
    );
    await expect(
      service.createExpense('tenant-a', {
        vendor_id: 'vendor-a',
        expense_head_id: 'head-b',
        invoice_number: 'INV-1',
        invoice_date: '2026-10-12',
        taxable_amount: 100,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.query.mock.calls[1][1]).toEqual(['head-b', 'tenant-a']);
    expect(tx.query).toHaveBeenCalledTimes(2);
  });
});
