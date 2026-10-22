import { NotFoundException } from '@nestjs/common';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
function setup(populated = false, found = true) {
  const query = jest.fn<Promise<Array<Record<string, unknown>>>, [string]>(
    (sql: string) => {
      if (sql.includes('FROM users u'))
        return Promise.resolve(
          found ? [{ name: 'Synthetic', enrollment_number: 'SYNTH-001' }] : [],
        );
      if (!populated) return Promise.resolve([]);
      if (sql.includes('FROM exam_semester_registrations'))
        return Promise.resolve([
          { status: 'APPROVED', created_at: 'registered' },
        ]);
      if (sql.includes('FROM exam_admit_card_entries'))
        return Promise.resolve([{ eligible: true, created_at: 'generated' }]);
      if (sql.includes('FROM exam_day_attendance'))
        return Promise.resolve([{ status: 'PRESENT', marked_at: 'attended' }]);
      if (sql.includes('FROM student_exam_reports'))
        return Promise.resolve([{ status: 'PASS', occurred_at: 'published' }]);
      if (sql.includes('FROM exam_applications'))
        return Promise.resolve([
          { status: 'COMPLETED', created_at: 'revalued' },
        ]);
      return Promise.resolve([]);
    },
  );
  const dues = jest.fn().mockResolvedValue([]);
  const service = new ExamCellEnterpriseService(
    { query } as never,
    {} as never,
    { getPendingDues: dues } as never,
    {} as never,
  );
  return { query, dues, service };
}
describe('Student examination timeline', () => {
  it('returns pending stages without crashing when optional records are absent', async () => {
    const { service } = setup();
    const result = await service.studentExamTimeline('tenant', 'student');
    expect(result.timeline).toHaveLength(5);
    expect(result.timeline).toContainEqual({
      stage: 'Hall Ticket',
      status: 'PENDING',
      at: null,
    });
    expect(result.timeline).toContainEqual({
      stage: 'Result',
      status: 'PENDING',
      at: null,
    });
  });
  it('uses persisted record objects and the actual result-status field', async () => {
    const { service, query } = setup(true);
    const result = await service.studentExamTimeline('tenant', 'student');
    expect(result.timeline).toEqual(
      expect.arrayContaining([
        { stage: 'Hall Ticket', status: 'GENERATED', at: 'generated' },
        { stage: 'Result', status: 'PASS', at: 'published' },
        { stage: 'Revaluation', status: 'COMPLETED', at: 'revalued' },
      ]),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'ser.result_status AS status, ser.declared_at AS occurred_at',
      ),
      ['student', 'tenant'],
    );
    expect(
      query.mock.calls.find(([sql]) =>
        sql.includes('FROM student_exam_reports'),
      )?.[0],
    ).toContain('ser.tenant_id = $2');
  });
  it('rejects a missing or foreign student before querying examination history', async () => {
    const { service, query, dues } = setup(false, false);
    await expect(
      service.studentExamTimeline('tenant', 'foreign'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(dues).not.toHaveBeenCalled();
  });
});

describe('Student timeline failure handling', () => {
  it('does not turn a failed result query into a genuine pending result', async () => {
    const { service, query } = setup(true);
    const original = query.getMockImplementation()!;
    query.mockImplementation((sql: string) =>
      sql.includes('FROM student_exam_reports')
        ? Promise.reject(new Error('result query unavailable'))
        : original(sql),
    );
    await expect(
      service.studentExamTimeline('tenant', 'student'),
    ).rejects.toThrow('result query unavailable');
  });
});
