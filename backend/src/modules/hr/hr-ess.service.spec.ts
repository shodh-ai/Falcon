import { BadRequestException, NotFoundException } from '@nestjs/common';
import { HrEssService } from './hr-ess.service';

describe('faculty self-service data boundaries', () => {
  const query = jest.fn();
  const transactionQuery = jest.fn();
  const transaction = jest.fn((run: (manager: unknown) => unknown) => run({ query: transactionQuery }));
  let service: HrEssService;

  beforeEach(() => {
    query.mockReset();
    transactionQuery.mockReset();
    transaction.mockClear();
    service = new HrEssService({ query, transaction } as never, {} as never, {} as never);
  });

  it('does not mutate another employee or tenant onboarding pipeline', async () => {
    transactionQuery.mockResolvedValueOnce([]);
    await expect(service.completeOnboardingStep('tenant-a', 2, 'faculty-a', 'pipeline-b', 'PAN_UPLOAD'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(transactionQuery).toHaveBeenCalledTimes(1);
    expect(transactionQuery.mock.calls[0][0]).toMatch(/tenant_id = \$2 AND entity_id = \$3 AND user_id = \$4/);
    expect(transactionQuery.mock.calls[0][1]).toEqual(['pipeline-b', 'tenant-a', 2, 'faculty-a']);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent step without updating pipeline progress', async () => {
    transactionQuery.mockResolvedValueOnce([{ pipeline_id: 'mine' }]).mockResolvedValueOnce([]);
    await expect(service.completeOnboardingStep('tenant-a', 2, 'faculty-a', 'mine', 'UNKNOWN'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(transactionQuery).toHaveBeenCalledTimes(2);
  });

  it.each([[1, 25, 'OFFER'], [2, 50, 'POLICIES'], [4, 100, 'COMPLETED']])(
    'recalculates progress after %s completed steps in the same locked transaction',
    async (done, percentage, stage) => {
      transactionQuery
        .mockResolvedValueOnce([{ pipeline_id: 'mine' }])
        .mockResolvedValueOnce([{ step_key: 'PAN_UPLOAD' }])
        .mockResolvedValueOnce([{ total: 4, done }])
        .mockResolvedValueOnce([]);
      await expect(service.completeOnboardingStep('tenant-a', 2, 'faculty-a', 'mine', 'PAN_UPLOAD'))
        .resolves.toEqual({ progress_percent: percentage, stage });
      expect(transaction).toHaveBeenCalledTimes(1);
      expect(transactionQuery.mock.calls[0][0]).toContain('FOR UPDATE');
      expect(transactionQuery.mock.calls[1][0]).toContain("status = 'COMPLETED'");
      expect(transactionQuery.mock.calls[3][1]).toEqual(['mine', percentage, stage]);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it.each([['2026-10', '2026-10-31'], ['2024-02', '2024-02-29'], ['2026-02', '2026-02-28']])(
    'includes the final day of %s independently of server timezone', async (month, end) => {
      query.mockResolvedValue([]);
      await service.getEmployeeCalendar('tenant-a', 2, 'faculty-a', month);
      expect(query.mock.calls[0][1]).toEqual(['faculty-a', `${month}-01`, end]);
      expect(query.mock.calls[1][1]).toEqual([`${month}-01`, end, 2]);
      expect(query.mock.calls[1][0]).toContain('deleted_at IS NULL');
      expect(query.mock.calls[2][1]).toEqual(['faculty-a', 'tenant-a', `${month}-01`, end]);
    },
  );

  it.each(['', '2026-00', '2026-13', '2026-1', 'invalid'])('rejects invalid calendar month %p before querying', async (month) => {
    await expect(service.getEmployeeCalendar('tenant-a', 2, 'faculty-a', month)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });
});
