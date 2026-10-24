import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FinanceAccountsService } from './finance-accounts.service';

describe('FinanceAccountsService fee template and job validation', () => {
  const query = jest.fn();
  const service = new FinanceAccountsService(
    { query } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  beforeEach(() => query.mockReset());

  it('rejects empty template fields before reaching SQL', () => {
    expect(() =>
      service.createTemplate('tenant-1', {
        template_name: '',
        academic_year: '',
        total_amount: 0,
      }),
    ).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects an empty vendor name and invalid IFSC before saving', () => {
    expect(() => service.createVendor('tenant-1', { business_name: '' })).toThrow(BadRequestException);
    expect(() => service.createVendor('tenant-1', { business_name: 'Vendor', ifsc_code: 'bad' })).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects invalid department-budget amounts before touching a transaction', () => {
    expect(() => service.upsertBudget('tenant-1', {
      department_id: 1, financial_year: '2026-2027', allocated_amount: -1,
    })).toThrow(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('does not change a department allocation under a locked university budget', async () => {
    const manager = { query: jest.fn((sql: string) => {
      if (sql.includes('FROM departments d')) return [{ dept_id: 1 }];
      if (sql.includes('FROM fin_dept_budgets') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('FROM fin_university_budgets')) return [{ university_budget_id: 'univ-1', status: 'LOCKED', total_allocated: '100.00' }];
      if (sql.includes('SUM(allocated_amount)')) return [{ allocated: '70.00' }];
      return [];
    }) };
    const dataSource = { transaction: jest.fn((work: (value: typeof manager) => unknown) => work(manager)) };
    const scopedService = new FinanceAccountsService(
      dataSource as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    await expect(scopedService.upsertBudget('tenant-1', {
      department_id: 1, financial_year: '2026-2027', allocated_amount: 40,
    })).rejects.toThrow('submit a budget expansion for approval');
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fin_dept_budgets'), expect.anything());
  });

  it('enforces the university cap before updating a draft allocation', async () => {
    const manager = { query: jest.fn((sql: string) => {
      if (sql.includes('FROM departments d')) return [{ dept_id: 1 }];
      if (sql.includes('FROM fin_dept_budgets') && sql.includes('FOR UPDATE')) return [];
      if (sql.includes('FROM fin_university_budgets')) return [{ university_budget_id: 'univ-1', status: 'DRAFT', total_allocated: '100.00' }];
      if (sql.includes('SUM(allocated_amount)')) return [{ allocated: '70.00' }];
      return [];
    }) };
    const dataSource = { transaction: jest.fn((work: (value: typeof manager) => unknown) => work(manager)) };
    const scopedService = new FinanceAccountsService(
      dataSource as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    await expect(scopedService.upsertBudget('tenant-1', {
      department_id: 1, financial_year: '2026-2027', allocated_amount: 40,
    })).rejects.toThrow('exceed the university budget cap');
    expect(manager.query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO fin_dept_budgets'), expect.anything());
  });

  it('updates a draft department allocation under the same university budget', async () => {
    const manager = { query: jest.fn((sql: string) => {
      if (sql.includes('FROM departments d')) return [{ dept_id: 1 }];
      if (sql.includes('FROM fin_dept_budgets') && sql.includes('FOR UPDATE'))
        return [{ budget_id: 'dept-1', status: 'DRAFT', utilized_amount: '10.00', encumbered_amount: '5.00' }];
      if (sql.includes('FROM fin_program_budgets')) return [{ allocated: '20.00' }];
      if (sql.includes('FROM fin_university_budgets'))
        return [{ university_budget_id: 'univ-1', status: 'DRAFT', total_allocated: '100.00' }];
      if (sql.includes('SUM(allocated_amount)')) return [{ allocated: '30.00' }];
      if (sql.includes('INSERT INTO fin_dept_budgets')) return [{ budget_id: 'dept-1', allocated_amount: '60.00' }];
      return [];
    }) };
    const dataSource = { transaction: jest.fn((work: (value: typeof manager) => unknown) => work(manager)) };
    const scopedService = new FinanceAccountsService(
      dataSource as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never,
    );
    await expect(scopedService.upsertBudget('tenant-1', {
      department_id: 1, financial_year: '2026-2027', allocated_amount: 60,
    })).resolves.toEqual([{ budget_id: 'dept-1', allocated_amount: '60.00' }]);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('university_budget_id = EXCLUDED.university_budget_id'),
      ['tenant-1', 1, '2026-2027', 60, 'univ-1'],
    );
  });

  it('keeps the saved semester and monetary values', async () => {
    query.mockResolvedValueOnce([{ template_id: 'template-1' }]);
    await service.createTemplate('tenant-1', {
      template_name: 'Semester fee',
      academic_year: '2026-27',
      semester: 5,
      total_amount: 1000,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO finance_fee_templates'),
      ['tenant-1', 'Semester fee', null, null, '2026-27', 5, '{}', 1000],
    );
  });

  it("rejects another tenant's template before queueing", async () => {
    query.mockResolvedValueOnce([]);
    await expect(
      service.createBulkJob('tenant-1', {
        template_id: '11111111-1111-4111-8111-111111111111',
      }),
    ).rejects.toThrow(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('SELECT template_id FROM finance_fee_templates'),
      ['tenant-1', '11111111-1111-4111-8111-111111111111'],
    );
  });

  it('scopes job-status reads to the tenant', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.getBulkJob('tenant-1', 'job-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FROM finance_bulk_jobs'),
      ['tenant-1', 'job-1'],
    );
  });
});
