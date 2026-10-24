import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ExamCellService } from './exam-cell.service';
import { ExamCellFinanceListener } from './exam-cell-finance.listener';

describe('Revaluation publication consistency', () => {
  function setup(options?: {
    failReport?: boolean;
    sources?: number;
    status?: string;
    assigned?: string;
  }) {
    const application = {
      exam_application_id: 'application',
      student_user_id: 'student',
      subject_id: 1,
      status: options?.status ?? 'UNDER_REVIEW',
      fee_status: 'PAID',
      assigned_faculty_user_id: options?.assigned ?? 'faculty',
      original_marks: 42,
      revised_marks: 46,
      subject_name: 'Synthetic subject',
      subject_code: 'SYNTHETIC',
      student_name: 'Synthetic student',
      report_notes: 'Synthetic report',
    };
    const source = {
      result_id: 'result',
      course_id: 'course',
      course_name: 'Synthetic course',
      exam_type: 'INTERNAL',
      semester: 8,
      max_marks: '50',
      marks_obtained: '42',
      mark_id: 'mark',
      session_id: 'session',
      pass_marks: '20',
      grading_policy_id: null,
    };
    const query = jest.fn((sql: string) => {
      if (sql.includes('SELECT ar.result_id, c.course_id'))
        return Promise.resolve(Array(options?.sources ?? 1).fill(source));
      if (sql.includes('UPDATE student_exam_reports') && options?.failReport)
        return Promise.reject(new Error('report write failed'));
      return Promise.resolve([]);
    });
    const manager = { query };
    const notify = {
      examRevaluationPublished: jest.fn(),
      examRevaluationReportReady: jest.fn(),
    };
    const service = new ExamCellService(
      {
        transaction: async (
          callback: (executor: typeof manager) => Promise<unknown>,
        ) => callback(manager),
      } as never,
      {} as never,
      {} as never,
      notify as never,
      {} as never,
      {} as never,

      {} as never,
    );
    jest.spyOn(service, 'getReEvaluation').mockResolvedValue(application);
    return { service, query, notify };
  }

  it('updates RCC marks, result mirror, report and enrollment using the existing grading engine', async () => {
    const { service, query, notify } = setup();
    await service.publishReEvaluation('tenant', 'actor', 'application');
    expect(query).toHaveBeenNthCalledWith(
      1,
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['exam-grade-cards:tenant'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE academic_exam_results'),
      ['tenant', 'result', 46, 'A+', 10],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE academic_marks'),
      ['tenant', 'mark', 46],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_exam_reports'),
      expect.arrayContaining([46, 92, 'A+', 10, 'PASS']),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_course_enrollments'),
      ['tenant', 'student', 'course', 'A+', 10, 'PASS', 8],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("'{requires_regeneration}', 'true'::jsonb"),
      ['tenant', 'student', 8],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        'semester IN (SELECT semester FROM grade_cards WHERE tenant_id = $1 AND student_user_id = $2)',
      ),
      ['tenant', 'student', 8],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_audit_logs'),
      expect.arrayContaining(['REVALUATION_PUBLISHED', 'application']),
    );
    expect(notify.examRevaluationPublished).toHaveBeenCalledTimes(1);
  });

  it('does not mark completed or notify when a result write fails', async () => {
    const { service, query, notify } = setup({ failReport: true });
    await expect(
      service.publishReEvaluation('tenant', 'actor', 'application'),
    ).rejects.toThrow('report write failed');
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'COMPLETED'"),
      expect.anything(),
    );
    expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('rejects ambiguous published examination identities rather than choosing one', async () => {
    const { service, notify } = setup({ sources: 2 });
    await expect(
      service.publishReEvaluation('tenant', 'actor', 'application'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notify.examRevaluationPublished).not.toHaveBeenCalled();
  });

  it('validates revised marks against the actual published maximum', async () => {
    const { service, query } = setup({ status: 'ASSIGNED' });
    await expect(
      service.submitReEvaluationReport('tenant', 'faculty', 'application', {
        revised_marks: 51,
        report_notes: 'Review',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'UNDER_REVIEW'"),
      expect.anything(),
    );
  });

  it('rejects a report from an unassigned faculty member', async () => {
    const { service } = setup({
      status: 'ASSIGNED',
      assigned: 'another-faculty',
    });
    await expect(
      service.submitReEvaluationReport('tenant', 'faculty', 'application', {
        revised_marks: 46,
        report_notes: 'Review',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('unlocks only a fully paid draft and uses actual returned notification identity', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        exam_application_id: 'app',
        student_user_id: 'student',
        tenant_id: 'tenant',
        subject_name: 'Subject',
      },
    ]);
    const examRevaluationFeePaid = jest.fn();
    const listener = new ExamCellFinanceListener(
      { query } as never,
      { examRevaluationFeePaid } as never,
    );
    await listener.onDemandPaid({
      demandId: 'demand',
      feeHead: 'RE_EVALUATION',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining(
        "a.status = 'DRAFT' AND a.fee_status = 'PENDING'",
      ),
      ['demand'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('d.paid_amount >= d.total_amount'),
      ['demand'],
    );
    expect(examRevaluationFeePaid).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'student', tenantId: 'tenant' }),
    );
    query.mockResolvedValueOnce([]);
    await listener.onDemandPaid({
      demandId: 'demand',
      feeHead: 'RE_EVALUATION',
    });
    expect(examRevaluationFeePaid).toHaveBeenCalledTimes(1);
  });
});
