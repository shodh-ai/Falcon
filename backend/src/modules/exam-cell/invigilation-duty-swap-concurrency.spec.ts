import { BadRequestException, ConflictException } from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Exam Duty decision consistency', () => {
  const query = jest.fn();
  const transaction = jest.fn();
  const outsideQuery = jest.fn();
  const resolved = jest.fn();
  const swap = {
    swap_id: 'swap', tenant_id: 'tenant', assignment_id: 'assignment',
    status: 'PENDING_EXAM_CELL', current_faculty_user_id: 'requester',
    requester_faculty_user_id: 'requester', target_faculty_user_id: 'target',
    requester_name: 'Requester', target_name: 'Target', exam_date: '2026-10-23',
    room: '101', session_label: 'Morning', exam_schedule_id: 'schedule',
  };
  let service: ExamCellService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(ExamCellService.prototype), {
      db: { query: outsideQuery, transaction }, notify: { examDutySwapResolved: resolved },
    });
    transaction.mockImplementation(async (work) => work({ query }));
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT s.*')) return [swap];
      if (sql.includes('SELECT user_id FROM users')) return [{ user_id: 'target' }];
      if (sql.includes('UPDATE invigilation_duty_swaps')) return [[{ ...swap, status: 'APPROVED' }], 1];
      return [];
    });
  });

  it('locks the request and assignment, serializes target approvals, and returns the saved row', async () => {
    const result = await service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'APPROVED', '  Verified  ');
    expect(result.status).toBe('APPROVED');
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(outsideQuery).not.toHaveBeenCalled();
    expect(query.mock.calls[0][0]).toContain('FOR UPDATE OF s, a');
    expect(query.mock.calls[1][0]).toContain('FOR UPDATE');
    expect(query.mock.calls[1][1]).toEqual(['target', 'tenant']);
    const update = query.mock.calls.find(([sql]) => sql.includes('UPDATE invigilation_duty_swaps'))!;
    expect(update[0]).toContain("tenant_id = $5 AND status = 'PENDING_EXAM_CELL'");
    expect(update[1]).toEqual(['APPROVED', 'officer', 'Verified', 'swap', 'tenant']);
    expect(resolved).toHaveBeenCalledTimes(2);
    expect(resolved).toHaveBeenCalledWith(expect.objectContaining({ examDate: '2026-10-23' }));
  });

  it('does not overwrite a cancellation observed after acquiring the row lock', async () => {
    query.mockResolvedValueOnce([{ ...swap, status: 'CANCELLED' }]);
    await expect(service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'APPROVED', 'Verified'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(resolved).not.toHaveBeenCalled();
  });

  it('does not transfer a duty to an inactive or deleted target', async () => {
    query.mockResolvedValueOnce([swap]).mockResolvedValueOnce([]);
    await expect(service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'APPROVED', 'Verified'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(2);
    expect(resolved).not.toHaveBeenCalled();
  });

  it('rejects an existing target conflict without changing assignments or notifying', async () => {
    query.mockResolvedValueOnce([swap]).mockResolvedValueOnce([{ user_id: 'target' }]).mockResolvedValueOnce([{ exists: 1 }]);
    await expect(service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'APPROVED', 'Verified'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls.some(([sql]) => /^\s*UPDATE\b/.test(sql))).toBe(false);
    expect(resolved).not.toHaveBeenCalled();
  });

  it('rejects an empty decision UPDATE inside the transaction without auditing success', async () => {
    query.mockImplementation(async (sql: string) => sql.includes('SELECT s.*') ? [swap] : []);
    await expect(service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'REJECTED', 'Reason'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql]) => sql.includes('INSERT INTO invigilation_duty_swap_audits'))).toBe(false);
    expect(resolved).not.toHaveBeenCalled();
  });

  it('rolls back when the audit fails and never sends a false success notification', async () => {
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT s.*')) return [swap];
      if (sql.includes('UPDATE invigilation_duty_swaps')) return [[{ ...swap, status: 'REJECTED_BY_EXAM_CELL' }], 1];
      throw new Error('Audit unavailable');
    });
    await expect(service.resolveInvigilationDutySwap('tenant', 'swap', 'officer', 'REJECTED', 'Reason'))
      .rejects.toThrow('Audit unavailable');
    expect(resolved).not.toHaveBeenCalled();
  });
});
