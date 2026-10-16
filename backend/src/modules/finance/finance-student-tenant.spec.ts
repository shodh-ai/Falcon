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
});
