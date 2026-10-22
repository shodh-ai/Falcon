import { ForbiddenException } from '@nestjs/common';
import { ExamsService } from '../exams/exams.service';
import { ExamCellService } from './exam-cell.service';

describe('Open UFM cases block both hall ticket entry points', () => {
  const attendance = {
    eligible: true,
    attendance_percent: 100,
    effective_threshold: 75,
  };

  it('blocks the staff pre-generation audit despite cleared fees and attendance', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(sql.includes('ufm_cases') ? [{ c: 1 }] : [{ c: 0 }]),
    );
    const service = new ExamCellService(
      { query } as never,
      { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
      {} as never,
      {} as never,
      {} as never,
      { evaluate: jest.fn().mockResolvedValue(attendance) } as never,

      {} as never,
    );
    await expect(
      service.getAdmitBlockReasons('student', 'tenant'),
    ).resolves.toContain('Blocked: Open UFM case');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("status != 'CLOSED'"),
      ['tenant', 'student'],
    );
  });

  it('rejects the authenticated student PDF before generating a document', async () => {
    const generate = jest.fn();
    const service = new ExamsService(
      {} as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ user_id: 'student' }) } as never,
      { query: jest.fn().mockResolvedValue([{ c: 1 }]) } as never,
      { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
      { generate } as never,
      { evaluate: jest.fn().mockResolvedValue(attendance) } as never,
    );
    await expect(
      service.generateAdmitCardOrThrow('tenant', 'student'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(generate).not.toHaveBeenCalled();
  });
});
