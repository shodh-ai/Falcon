import { FinanceService } from './finance.service';

describe('Revaluation demand ownership and transaction participation', () => {
  const input = {
    student_user_id: 'student',
    fee_head: 'RE_EVALUATION',
    academic_year: '2026-27',
    total_amount: 500,
    due_date: '2026-10-22',
  };

  it('persists the explicit tenant with a generated demand', async () => {
    const demands = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ ...value, demand_id: 'demand' }),
      ),
    };
    const feeGenerated = jest.fn();
    const service = new FinanceService(
      demands as never,
      {} as never,
      {} as never,
      { feeGenerated } as never,
    );
    await service.createDemand(input, 'tenant');
    expect(demands.create).toHaveBeenCalledWith({
      ...input,
      tenant_id: 'tenant',
    });
    expect(feeGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant', userId: 'student' }),
    );
  });

  it('uses the caller transaction and defers notifications when requested', async () => {
    const outside = { create: jest.fn(), save: jest.fn() };
    const transactional = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ ...value, demand_id: 'demand' }),
      ),
    };
    const feeGenerated = jest.fn();
    const service = new FinanceService(
      outside as never,
      {} as never,
      {} as never,
      { feeGenerated } as never,
    );
    await service.createDemand(input, 'tenant', {
      manager: { getRepository: () => transactional } as never,
      notify: false,
    });
    expect(transactional.save).toHaveBeenCalledWith(
      expect.objectContaining({ tenant_id: 'tenant' }),
    );
    expect(outside.save).not.toHaveBeenCalled();
    expect(feeGenerated).not.toHaveBeenCalled();
  });
});
