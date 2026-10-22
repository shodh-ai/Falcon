import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ExamCellOperationsService } from './exam-cell-operations.service';
function setup(
  window: { semester: number; session_id: string } | null = {
    semester: 9,
    session_id: 'session',
  },
) {
  const query = jest.fn(async (sql: string) => {
    await Promise.resolve();
    if (sql.includes('FROM exam_form_windows')) return window ? [window] : [];
    if (sql.includes('SELECT DISTINCT u.user_id'))
      return [{ user_id: 'student' }];
    if (sql.includes('INSERT INTO exam_semester_registrations'))
      return [{ registration_id: 'registration' }];
    return [];
  });
  const manager = { query };
  const outside = jest.fn();
  const db = {
    query: outside,
    transaction: (work: (executor: typeof manager) => Promise<unknown>) =>
      work(manager),
  };
  const service = new ExamCellOperationsService(
    db as never,
    {
      evaluate: jest
        .fn()
        .mockResolvedValue({ eligible: true, attendance_percent: 100 }),
    } as never,
    { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
    {} as never,
    {} as never,
  );
  return { query, outside, service };
}
describe('Registration window ownership', () => {
  it('rejects a missing or foreign window before loading students or writing registrations', async () => {
    const { query, service } = setup(null);
    await expect(
      service.seedRegistrationsFromSemester('tenant', 'foreign', 9),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('tenant_id = $1 AND window_id = $2 FOR UPDATE'),
      ['tenant', 'foreign'],
    );
  });
  it('rejects mismatched semesters before any registration writes', async () => {
    const { query, service } = setup();
    await expect(
      service.seedRegistrationsFromSemester('tenant', 'window', 8),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).toHaveBeenCalledTimes(1);
  });
  it('uses the window session and inserts idempotently in its transaction', async () => {
    const { service, query, outside } = setup();
    await expect(
      service.seedRegistrationsFromSemester('tenant', 'window', 9),
    ).resolves.toEqual({ created: 1, total_students: 1 });
    const call = query.mock.calls.find(([sql]) =>
      sql.includes('INSERT INTO exam_semester_registrations'),
    );
    expect(call?.[0]).toContain(
      'ON CONFLICT (window_id, student_user_id) DO NOTHING',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_semester_registrations'),
      expect.arrayContaining(['tenant', 'window', 'student', 9, 'session']),
    );
    expect(outside).not.toHaveBeenCalled();
  });
});
