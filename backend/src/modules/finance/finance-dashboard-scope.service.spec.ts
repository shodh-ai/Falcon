import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';

describe('Finance dashboard tenant scope', () => {
  it('scopes collections, outstanding dues, and recent payments to the active book', async () => {
    const builders: Array<{ andWhere: jest.Mock }> = [];
    const makeBuilder = () => {
      const builder = {
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        take: jest.fn(),
        leftJoinAndSelect: jest.fn(),
        getMany: jest.fn().mockResolvedValue([]),
      };
      for (const method of [
        'where',
        'andWhere',
        'orderBy',
        'take',
        'leftJoinAndSelect',
      ] as const) {
        builder[method].mockReturnValue(builder);
      }
      builders.push(builder);
      return builder;
    };
    const transactions = { createQueryBuilder: jest.fn(makeBuilder) };
    const demands = {
      createQueryBuilder: jest.fn(makeBuilder),
      manager: { query: jest.fn().mockResolvedValue([]) },
    };
    const service = new FinanceService(
      demands as never,
      transactions as never,
      {} as never,
      {} as never,
    );

    await service.getDashboard('tenant-gvmc');

    expect(builders).toHaveLength(3);
    for (const builder of builders) {
      expect(builder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('tenant_id = :tenantId'),
        { tenantId: 'tenant-gvmc' },
      );
    }
  });

  it('rejects a demand for a student in another institution', async () => {
    const save = jest.fn();
    const demands = {
      manager: {
        query: jest.fn().mockResolvedValue([{ tenant_id: 'tenant-sgvu' }]),
      },
      save,
    };
    const service = new FinanceService(
      demands as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.createDemand(
        { student_user_id: 'student-1' } as never,
        'tenant-gvmc',
      ),
    ).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });
});
