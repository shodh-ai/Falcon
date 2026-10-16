import { ForbiddenException } from '@nestjs/common';
import { ExamCellController } from './exam-cell.controller';

describe('ExamCellController tenant context', () => {
  const tenantId = '11111111-1111-4111-8111-111111111111';

  function createController() {
    const examCell = {
      listSchedules: jest.fn().mockResolvedValue([]),
    };
    const unused = {};
    return {
      controller: new ExamCellController(
        examCell as never,
        unused as never,
        unused as never,
        unused as never,
        unused as never,
        unused as never,
        unused as never,
        unused as never,
        unused as never,
      ),
      examCell,
    };
  }

  it('uses the tenant context established for the authenticated user', async () => {
    const { controller, examCell } = createController();

    await expect(
      controller.schedules({
        user: { user_id: 'exam-user', tenant_id: tenantId, role: 'ExamCell' },
      }),
    ).resolves.toEqual([]);

    expect(examCell.listSchedules).toHaveBeenCalledWith(tenantId);
  });

  it.each([undefined, null, '', '   '])(
    'rejects missing or invalid tenant context %p without using a fallback',
    (tenant_id) => {
      const { controller, examCell } = createController();

      expect(() =>
        controller.schedules({
          user: {
            user_id: 'exam-user',
            tenant_id: tenant_id as string | undefined,
            role: 'ExamCell',
          },
        }),
      ).toThrow(ForbiddenException);
      expect(examCell.listSchedules).not.toHaveBeenCalled();
    },
  );
});
