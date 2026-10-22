import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import type { FeeDemand } from '../../entities/fee-demand.entity';

describe('student exam fee campus isolation', () => {
  function setup() {
    const demands = {
      manager: {
        query: jest.fn().mockResolvedValue([{ tenant_id: 'campus-b' }]),
      },
      create: jest.fn((dto: Partial<FeeDemand>) => dto),
      save: jest.fn((demand: Partial<FeeDemand>) => Promise.resolve(demand)),
      find: jest.fn<Promise<FeeDemand[]>, [unknown]>().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };
    const notify = { feeGenerated: jest.fn() };
    const service = new FinanceService(
      demands as never,
      {} as never,
      {} as never,
      notify as never,
    );
    return { demands, notify, service };
  }

  const dto = {
    student_user_id: 'student-a',
    fee_head: 'Re-evaluation',
    academic_year: '2026-27',
    total_amount: 500,
    due_date: '2026-10-31',
  };

  it('persists the authenticated campus for a newly generated fee', async () => {
    const { service, demands, notify } = setup();
    await service.createDemand(dto, 'campus-b');
    expect(demands.create).toHaveBeenCalledWith({
      ...dto,
      tenant_id: 'campus-b',
    });
    expect(demands.save).toHaveBeenCalledWith({
      ...dto,
      tenant_id: 'campus-b',
    });
    expect(notify.feeGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'campus-b', userId: 'student-a' }),
    );
  });

  it('does not save a fee when the campus is missing', async () => {
    const { service, demands } = setup();
    await expect(service.createDemand(dto, '')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(demands.save).not.toHaveBeenCalled();
  });

  it('does not save a fee for a student in another campus', async () => {
    const { service, demands } = setup();
    demands.manager.query.mockResolvedValueOnce([{ tenant_id: 'campus-a' }]);
    await expect(service.createDemand(dto, 'campus-b')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(demands.save).not.toHaveBeenCalled();
  });

  it('filters student exam dues by authenticated student and campus', async () => {
    const { service, demands } = setup();
    await service.getPendingDues('student-a', 'campus-b');
    expect(demands.find).toHaveBeenCalledWith({
      where: { student_user_id: 'student-a', tenant_id: 'campus-b' },
      order: { due_date: 'ASC' },
    });
  });

  it('preserves existing staff calls without an explicit campus filter', async () => {
    const { service, demands } = setup();
    await service.getPendingDues('student-a');
    expect(demands.find).toHaveBeenCalledWith({
      where: { student_user_id: 'student-a' },
      order: { due_date: 'ASC' },
    });
  });

  it('rejects an explicitly blank campus rather than falling back', async () => {
    const { service, demands } = setup();
    await expect(
      service.getPendingDues('student-a', ''),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(demands.find).not.toHaveBeenCalled();
  });

  it('does not select a scholarship demand outside the authenticated tenant', async () => {
    const { service, demands } = setup();
    const studentId = 'aa989437-ede9-4576-81d3-a107b7c84766';
    await expect(service.applyScholarship('campus-b', {
      student_user_id: studentId,
      discount_percent: 15,
    })).rejects.toThrow('No active fee demand');
    expect(demands.findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.arrayContaining([expect.objectContaining({ tenant_id: 'campus-b', student_user_id: studentId })]),
    }));
    expect(demands.save).not.toHaveBeenCalled();
  });

  it('rejects a missing scholarship percentage before touching the database', async () => {
    const { service, demands } = setup();
    await expect(service.applyScholarship('campus-b', {
      student_user_id: 'aa989437-ede9-4576-81d3-a107b7c84766',
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(demands.manager.query).not.toHaveBeenCalled();
  });

  it('applies a scholarship with a tenant-scoped, single-use compare-and-set update', async () => {
    const { service, demands } = setup();
    const studentId = 'aa989437-ede9-4576-81d3-a107b7c84766';
    const demand = {
      demand_id: '010b9ef0-02d3-4cdf-826c-3c002216038f',
      student_user_id: studentId,
      tenant_id: 'campus-b',
      total_amount: 1000,
      paid_amount: 100,
      fee_breakup: null,
    };
    demands.manager.query.mockResolvedValueOnce([{ user_id: studentId }]);
    demands.findOne.mockResolvedValueOnce(demand);
    demands.manager.query.mockResolvedValueOnce([[{ ...demand, total_amount: 900 }], 1]);

    await expect(service.applyScholarship('campus-b', {
      student_user_id: studentId,
      discount_percent: 10,
    })).resolves.toMatchObject({ total_amount: 900 });
    expect(demands.manager.query).toHaveBeenLastCalledWith(
      expect.stringContaining("fee_breakup->>'scholarship_discount_percent' IS NULL"),
      [demand.demand_id, 'campus-b', 900, 10, 1000, studentId, 100],
    );
    expect(demands.save).not.toHaveBeenCalled();
  });

  it('rejects a concurrent scholarship or payment change without overwriting it', async () => {
    const { service, demands } = setup();
    const studentId = 'aa989437-ede9-4576-81d3-a107b7c84766';
    demands.manager.query.mockResolvedValueOnce([{ user_id: studentId }]);
    demands.findOne.mockResolvedValueOnce({
      demand_id: '010b9ef0-02d3-4cdf-826c-3c002216038f',
      total_amount: 1000,
      paid_amount: 0,
      fee_breakup: null,
    });
    demands.manager.query.mockResolvedValueOnce([[], 0]);

    await expect(service.applyScholarship('campus-b', {
      student_user_id: studentId,
      discount_percent: 10,
    })).rejects.toThrow('Fee demand changed');
    expect(demands.save).not.toHaveBeenCalled();
  });
});
