import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import { ExamCellService } from './exam-cell.service';
import { ExamsService } from '../exams/exams.service';
import { HallTicketVerificationService } from './hall-ticket-verification.service';

jest.mock('fs', () => ({
  ...jest.requireActual<typeof fs>('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('Hall-ticket enrollment mapping', () => {
  afterEach(() => jest.restoreAllMocks());
  it('uses real profile/subject rows and never issues an unrelated examination to another enrolled student', async () => {
    const generate = jest.fn().mockResolvedValue(Buffer.from('pdf'));
    const query = jest.fn((sql: string, params: unknown[]) => {
      if (sql.includes('SELECT DISTINCT u.user_id'))
        return Promise.resolve([
          {
            user_id: 'enrolled',
            name: 'Synthetic One',
            enrollment_number: 'SYNTH-001',
            program_name: 'B.Tech',
            current_semester: 9,
          },
          {
            user_id: 'unrelated',
            name: 'Synthetic Two',
            enrollment_number: 'SYNTH-002',
          },
        ]);
      if (sql.includes('INSERT INTO exam_admit_card_runs'))
        return Promise.resolve([{ run_id: 'owned-run' }]);
      if (sql.includes('SELECT es.exam_schedule_id'))
        return Promise.resolve(
          params[2] === 'enrolled'
            ? [
                {
                  exam_schedule_id: 'schedule',
                  subject_code: 'SYNTH-COURSE',
                  subject_name: 'Synthetic Course',
                  seat_no: '03',
                },
              ]
            : [],
        );
      return Promise.resolve([]);
    });
    const transaction = jest.fn(
      async (run: (manager: unknown) => Promise<unknown>) => run({ query }),
    );
    jest
      .spyOn(HallTicketVerificationService.prototype, 'check')
      .mockResolvedValue({ student: {}, schedules: [] });
    const issue = jest
      .spyOn(HallTicketVerificationService.prototype, 'issue')
      .mockResolvedValue({
        issue_id: 'issued',
        payload: 'FALCON-HALL-TICKET:synthetic',
      });
    const service = new ExamCellService(
      { query, transaction } as never,
      {} as never,
      { generate } as never,
      { admitCardLocked: jest.fn() } as never,
      {} as never,
      {} as never,

      {} as never,
    );
    jest.spyOn(service, 'getAdmitBlockReasons').mockResolvedValue([]);
    const result = await service.generateAdmitCards(
      'tenant',
      { batch_label: 'Synthetic', semester: 9 },
      'actor',
    );
    expect(result).toMatchObject({ generated: 1, blocked: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(issue).toHaveBeenCalledWith(
      'tenant',
      'enrolled',
      ['schedule'],
      expect.objectContaining({ query }),
      'actor',
    );
    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        student: expect.objectContaining({
          user_id: 'enrolled',
          enrollment_no: 'SYNTH-001',
          program: 'B.Tech',
          semester: 9,
        }) as unknown,
        exams: [
          expect.objectContaining({
            subject_code: 'SYNTH-COURSE',
            subject_name: 'Synthetic Course',
            seat_no: '03',
          }),
        ],
      }),
    );
    expect(
      result.students.find((row) => row.student_user_id === 'unrelated')
        ?.reasons,
    ).toContain(
      'Blocked: No scheduled examinations for enrolled subjects in this batch',
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('course.course_code = sub.subject_code'),
      ['tenant', 'Synthetic', 'enrolled', 9],
    );
  });

  it('rejects an empty student timetable before creating a blank PDF', async () => {
    const generate = jest.fn();
    const service = new ExamsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { generate } as never,
      {} as never,
    );
    jest.spyOn(service, 'checkEligibility').mockResolvedValue({
      eligible: true,
      attendance_percent: 100,
      min_required: 75,
      exempted: false,
      reasons: [],
    });
    const loader = service as unknown as {
      loadAdmitCardStudent: () => Promise<unknown>;
      listAdmitCardExams: () => Promise<unknown[]>;
    };
    jest
      .spyOn(loader, 'loadAdmitCardStudent')
      .mockResolvedValue({ user_id: 'student', name: 'Synthetic' });
    jest.spyOn(loader, 'listAdmitCardExams').mockResolvedValue([]);
    await expect(
      service.generateAdmitCardOrThrow('tenant', 'student'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(generate).not.toHaveBeenCalled();
  });
});
