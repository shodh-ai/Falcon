import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { FinanceController } from './finance.controller';

describe('legacy Finance tenant boundary', () => {
  const demands = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn(async (value: unknown) => value),
    update: jest.fn(),
    manager: { query: jest.fn() },
    createQueryBuilder: jest.fn(),
  };
  const transactions = {
    find: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  };
  const finePolicies = { find: jest.fn() };
  const notify = { feeGenerated: jest.fn(), admitCardLocked: jest.fn() };
  let service: FinanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinanceService(
      demands as never,
      transactions as never,
      finePolicies as never,
      notify as never,
    );
  });

  it('scopes fee and transaction lists even when a student ID is supplied', async () => {
    await service.listDemands('tenant-a', 'student-b');
    await service.listTransactions('tenant-a', 'student-b');
    expect(demands.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', student_user_id: 'student-b' },
      order: { due_date: 'ASC' },
    });
    expect(transactions.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', student_user_id: 'student-b' },
      order: { created_at: 'DESC' },
    });
  });

  it('scopes fee-clearance checks used by Exams to the same tenant', async () => {
    demands.find.mockResolvedValueOnce([]);
    await service.getPendingDues('tenant-a', 'student-b');
    expect(demands.find).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', student_user_id: 'student-b' },
      order: { due_date: 'ASC' },
    });
  });

  it('refuses to create a demand for a student outside the tenant', async () => {
    demands.manager.query.mockResolvedValueOnce([]);
    await expect(
      service.createDemand(
        {
          student_user_id: 'student-b',
          fee_head: 'TUITION',
          academic_year: '2026-27',
          total_amount: 100,
          due_date: '2026-12-01',
        },
        'tenant-a',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(demands.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id=$2'),
      ['student-b', 'tenant-a'],
    );
    expect(demands.save).not.toHaveBeenCalled();
  });

  it('persists the tenant on a valid new demand', async () => {
    demands.manager.query.mockResolvedValueOnce([{ '?column?': 1 }]);
    await service.createDemand(
      {
        student_user_id: 'student-a',
        fee_head: 'TUITION',
        academic_year: '2026-27',
        total_amount: 100,
        due_date: '2026-12-01',
      },
      'tenant-a',
    );
    expect(demands.create).toHaveBeenCalledWith(
      expect.objectContaining({
        student_user_id: 'student-a',
        tenant_id: 'tenant-a',
      }),
    );
  });

  it('scopes receipt updates and scholarship lookups', async () => {
    transactions.update.mockResolvedValueOnce({ affected: 1 });
    await service.uploadReceipt('tenant-a', 'transaction-b', 'receipt-path');
    expect(transactions.update).toHaveBeenCalledWith(
      { tenant_id: 'tenant-a', transaction_id: 'transaction-b' },
      { receipt_url: 'receipt-path' },
    );

    demands.findOne.mockResolvedValueOnce(null);
    await expect(
      service.applyScholarship('tenant-a', {
        student_user_id: 'student-b',
        discount_percent: 20,
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    const lookup = demands.findOne.mock.calls[0][0] as {
      where: Array<{ tenant_id: string }>;
    };
    expect(
      lookup.where.every((condition) => condition.tenant_id === 'tenant-a'),
    ).toBe(true);
  });

  it('scopes defaulter lists and related student details', async () => {
    demands.find.mockResolvedValueOnce([
      {
        student_user_id: 'student-a',
        total_amount: 100,
        paid_amount: 0,
        status: 'PENDING',
      },
    ]);
    demands.manager.query.mockResolvedValueOnce([]);
    await service.listDefaulters('tenant-a');
    const lookup = demands.find.mock.calls[0][0] as {
      where: Array<{ tenant_id: string }>;
    };
    expect(
      lookup.where.every((condition) => condition.tenant_id === 'tenant-a'),
    ).toBe(true);
    expect(demands.manager.query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id=$2'),
      [['student-a'], 'tenant-a'],
    );
  });

  it('filters dashboard totals and recent transactions by tenant', async () => {
    const transactionQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const demandQuery = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    transactions.createQueryBuilder.mockReturnValue(transactionQuery);
    demands.createQueryBuilder.mockReturnValue(demandQuery);
    transactions.find.mockResolvedValueOnce([]);
    demands.manager.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);

    await service.getDashboard('tenant-a');

    expect(transactionQuery.andWhere).toHaveBeenCalledWith(
      'transaction.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    );
    expect(demandQuery.andWhere).toHaveBeenCalledWith(
      'demand.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    );
    expect(transactions.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'SUCCESS', tenant_id: 'tenant-a' },
      }),
    );
  });

  it('rejects Finance requests without authenticated tenant context', () => {
    const controller = new FinanceController(
      service,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    expect(() =>
      controller.listDemands({ user: { user_id: 'user-a' } }),
    ).toThrow(ForbiddenException);
  });
});
