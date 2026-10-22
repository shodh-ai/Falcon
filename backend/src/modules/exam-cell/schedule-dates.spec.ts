import { ExamCellService } from './exam-cell.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';

describe('Schedule date-only API contract', () => {
  it('returns persisted schedule dates as text in staff schedule and linked lists', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new ExamCellService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,

      {} as never,
    );
    await service.listSchedules('tenant');
    await service.listSeatingAllocations('tenant');
    await service.listSeatingPlans('tenant');
    await service.listInvigilationDuties('tenant');
    expect(
      query.mock.calls.every(([sql]) =>
        String(sql).includes('exam_date::text AS exam_date'),
      ),
    ).toBe(true);
  });
  it('returns today dates as date-only strings rather than the previous UTC day', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new ExamCellOperationsService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,

      {} as never,
    );
    await service.listTodayExams('tenant');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('es.exam_date::text AS exam_date'),
      expect.arrayContaining(['tenant']),
    );
  });
});
