import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { validate } from 'class-validator';
import { BacklogService } from './backlog.service';
import { ConfigureBacklogOfferingDto } from './dto/backlog.dto';
import { invalidateOfficialTranscripts } from './official-transcript-revisions';
import { resolveDeanDepartmentIds } from '../academics/dean-scope.util';

jest.mock('./official-transcript-revisions', () => ({
  invalidateOfficialTranscripts: jest.fn(),
}));
jest.mock('../academics/dean-scope.util', () => ({
  resolveDeanDepartmentIds: jest.fn(),
}));
const bands = {
  bands: [
    { minPercent: 40, maxPercent: 100, grade: 'A', gradePoints: 8 },
    { minPercent: 0, maxPercent: 39.99, grade: 'F', gradePoints: 0 },
  ],
};
const offering = {
  offering_id: 'offering',
  tenant_id: 'tenant',
  course_id: 'course',
  semester: 4,
  source_exam_type: 'END_TERM',
  faculty_user_id: 'faculty',
  status: 'OPEN',
  opens_at: '2020-01-01',
  closes_at: '2099-01-01',
  payment_due_date: '2099-01-01',
  fee_mode: 'REQUIRED',
  fee_amount: 123,
  attempt_limit: 2,
  selection_policy: 'BEST_ATTEMPT',
  grading_rules: bands,
  max_marks: 50,
  pass_marks: 20,
  academic_year: '2026-27',
};
const original = {
  source_result_id: 'original-result',
  report_id: 'report',
  session_id: 'session',
  subject_id: 1,
  marks_obtained: '10',
  max_marks: '50',
  percent: '20',
  grade: 'F',
  grade_points: '0',
  result_status: 'FAIL',
  declared_at: '2026-01-01',
};
const configure = {
  course_id: 'course',
  semester: 4,
  source_exam_type: 'END_TERM',
  exam_session_id: 'session',
  exam_schedule_id: 'schedule',
  faculty_user_id: 'faculty',
  academic_year: '2026-27',
  opens_at: '2026-01-01',
  closes_at: '2026-02-01',
  payment_due_date: '2026-01-31',
  fee_mode: 'REQUIRED',
  fee_amount: 123,
  attempt_limit: 2,
  selection_policy: 'BEST_ATTEMPT',
  grading_policy_id: 1,
  max_marks: 50,
  pass_marks: 20,
} as ConfigureBacklogOfferingDto;
const attempt = {
  ...offering,
  attempt_id: 'attempt',
  application_id: 'application',
  student_user_id: 'student',
  marks_status: 'DRAFT',
  marks_obtained: 30,
  finance_demand_id: 'demand',
  fee_status: 'PENDING',
  demand_status: 'PAID',
  status: 'APPROVED',
};

type Options = {
  sourceMissing?: boolean;
  sourceNoLongerFailed?: boolean;
  competingRevaluation?: boolean;
  sourceAmbiguous?: boolean;
  duplicate?: boolean;
  limit?: boolean;
  unpaid?: boolean;
  auditFailure?: boolean;
  missingCourse?: boolean;
  scheduleOutside?: boolean;
  inconsistentPolicy?: boolean;
  policyMissing?: boolean;
  hold?: boolean;
  attempt?: Partial<typeof attempt>;
  offering?: Partial<typeof offering>;
};
function setup(options: Options = {}) {
  const query = jest.fn(async (sql: string, _params?: unknown[]) => {
    void _params;
    await Promise.resolve();
    if (sql.includes('FROM exam_backlog_offerings WHERE'))
      return [{ ...offering, ...options.offering }];
    if (sql.includes('FROM exam_backlog_attempts a JOIN'))
      return [{ ...attempt, ...options.attempt }];
    if (sql.includes('FROM academic_courses WHERE'))
      return options.missingCourse
        ? []
        : [{ course_id: 'course', course_code: 'SYNTH' }];
    if (sql.includes('FROM exam_sessions WHERE'))
      return [
        {
          session_id: 'session',
          start_date: '2026-01-01',
          end_date: '2026-02-01',
        },
      ];
    if (sql.includes('FROM exam_schedules es JOIN'))
      return options.scheduleOutside ? [] : [{ exam_schedule_id: 'schedule' }];
    if (sql.includes('FROM users u WHERE')) return [{ user_id: 'faculty' }];
    if (sql.includes('FROM academic_grading_policies'))
      return options.policyMissing ? [] : [{ rules: bands }];
    if (sql.includes('selection_policy<>'))
      return options.inconsistentPolicy ? [{ offering_id: 'other' }] : [];
    if (sql.includes('FROM ufm_cases'))
      return options.hold ? [{ blocked: 1 }] : [];
    if (sql.includes('SELECT r.*,s.semester'))
      return options.sourceMissing
        ? []
        : options.sourceAmbiguous
          ? [original, original]
          : [original];
    if (sql.includes("application_type='RE_EVALUATION'"))
      return options.competingRevaluation
        ? [{ exam_application_id: 'revaluation' }]
        : [];
    if (sql.includes('SELECT attempt_id FROM exam_backlog_attempts'))
      return options.duplicate ? [{ attempt_id: 'duplicate' }] : [];
    if (sql.includes('COUNT(*)::int AS attempts'))
      return [{ attempts: options.limit ? 2 : 0 }];
    if (sql.includes('INSERT INTO exam_applications'))
      return [{ exam_application_id: 'application' }];
    if (sql.includes('INSERT INTO exam_backlog_attempts'))
      return [{ attempt_id: 'attempt' }];
    if (sql.includes('INSERT INTO exam_backlog_offerings'))
      return [{ offering_id: 'offering' }];
    if (sql.includes('SELECT d.demand_id FROM finance_fee_demands'))
      return options.unpaid ? [] : [{ demand_id: 'demand' }];
    if (sql.includes('FROM exam_backlog_current_results'))
      return [
        {
          grade: 'A',
          grade_points: 8,
          result_status: 'PASS',
          selected_attempt_id: 'attempt',
        },
      ];
    if (sql.includes('SELECT e.course_id FROM student_course_enrollments e'))
      return options.sourceNoLongerFailed ? [] : [{ course_id: 'course' }];
    if (sql.includes('SELECT dept_id FROM users')) return [{ dept_id: 2 }];
    return [];
  });
  const manager = { query };
  const outside = jest
    .fn()
    .mockRejectedValue(new Error('Mutation escaped its transaction'));
  const transaction = jest.fn(
    async (run: (tx: typeof manager) => Promise<unknown>) => run(manager),
  );
  const audit = {
    log: options.auditFailure
      ? jest.fn().mockRejectedValue(new Error('audit unavailable'))
      : jest.fn().mockResolvedValue(undefined),
  };
  const finance = {
    createDemand: jest.fn().mockResolvedValue({ demand_id: 'demand' }),
    notifyDemandGenerated: jest.fn(),
  };
  const service = new BacklogService(
    { query: outside, transaction } as never,
    finance as never,
    audit as never,
  );
  return { query, manager, outside, transaction, audit, finance, service };
}

beforeEach(() => {
  jest.mocked(invalidateOfficialTranscripts).mockReset().mockResolvedValue(0);
  jest.mocked(resolveDeanDepartmentIds).mockReset().mockResolvedValue([2]);
});

describe('Explicit backlog configuration', () => {
  it('has no implicit DTO academic or fee defaults', async () => {
    const dto = new ConfigureBacklogOfferingDto();
    const errors = await validate(dto);
    for (const field of [
      'fee_mode',
      'fee_amount',
      'attempt_limit',
      'selection_policy',
      'grading_policy_id',
      'max_marks',
      'pass_marks',
    ])
      expect(errors.some((error) => error.property === field)).toBe(true);
    expect(
      Object.keys(dto).every(
        (key) => dto[key as keyof ConfigureBacklogOfferingDto] === undefined,
      ),
    ).toBe(true);
  });
  it('rejects missing configuration before any query', async () => {
    const state = setup();
    await expect(
      state.service.configure('tenant', 'staff', {} as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.query).not.toHaveBeenCalled();
    expect(state.finance.createDemand).not.toHaveBeenCalled();
  });
  it('validates numeric database storage bounds in the DTO', async () => {
    const dto = Object.assign(new ConfigureBacklogOfferingDto(), configure, {
      semester: 2147483648,
      attempt_limit: 2147483648,
      grading_policy_id: 2147483648,
      fee_amount: 10000000000,
      max_marks: 10000,
      pass_marks: 10000,
    });
    const errors = await validate(dto);
    for (const property of [
      'semester',
      'attempt_limit',
      'grading_policy_id',
      'fee_amount',
      'max_marks',
      'pass_marks',
    ])
      expect(
        errors.some(
          (error) => error.property === property && error.constraints?.max,
        ),
      ).toBe(true);
  });
  it.each([
    { fee_amount: 10000000000 },
    { max_marks: 10000 },
    { semester: 2147483648 },
    { attempt_limit: 2147483648 },
    { grading_policy_id: 2147483648 },
  ])('rejects storage overflow before any query: %j', async (patch) => {
    const state = setup();
    await expect(
      state.service.configure('tenant', 'staff', { ...configure, ...patch }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.query).not.toHaveBeenCalled();
  });
  it('rejects component exam types that cannot replace a final course result', async () => {
    const state = setup();
    await expect(
      state.service.configure('tenant', 'staff', {
        ...configure,
        source_exam_type: 'MID_TERM',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.query).not.toHaveBeenCalled();
  });
  it('rejects a foreign course and an absent explicit grading policy', async () => {
    await expect(
      setup({ missingCourse: true }).service.configure(
        'tenant',
        'staff',
        configure,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      setup({ policyMissing: true }).service.configure(
        'tenant',
        'staff',
        configure,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('matches the retake schedule against configured session dates before writing an offering', async () => {
    const state = setup({ scheduleOutside: true });
    await expect(
      state.service.configure('tenant', 'staff', configure),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('es.exam_date >= $5::date'),
      ['tenant', 'schedule', 'SYNTH', 4, '2026-01-01', '2026-02-01'],
    );
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO exam_backlog_offerings'),
      ),
    ).toBe(false);
  });
  it('rejects mixed selection policies for the same attempt family before inserting an offering', async () => {
    const state = setup({ inconsistentPolicy: true });
    await expect(
      state.service.configure('tenant', 'staff', configure),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO exam_backlog_offerings'),
      ),
    ).toBe(false);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['backlog-policy:tenant:course:4:END_TERM'],
    );
  });
  it('snapshots explicit grading rules and creates only a draft offering', async () => {
    const state = setup();
    await state.service.configure('tenant', 'staff', configure);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining("'DRAFT'"),
      expect.arrayContaining([JSON.stringify(bands), 123, 2, 'BEST_ATTEMPT']),
    );
    expect(state.audit.log).toHaveBeenCalledWith(
      'tenant',
      'staff',
      expect.objectContaining({ action: 'BACKLOG_OFFERING_CONFIGURED' }),
      state.manager,
    );
  });
});

describe('Retake source freshness', () => {
  it('rejects approval after the original source or enrollment ceases to be failed', async () => {
    const state = setup({
      sourceNoLongerFailed: true,
      attempt: { status: 'PENDING_REVIEW' },
    });
    await expect(
      state.service.review('tenant', 'staff', 'attempt', {
        decision: 'APPROVED',
        reason: 'SYNTH reviewed',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.startsWith('UPDATE exam_backlog_attempts'),
      ),
    ).toBe(false);
  });
  it('rejects publication after the original source or enrollment ceases to be failed', async () => {
    const state = setup({
      sourceNoLongerFailed: true,
      attempt: { marks_status: 'DEAN_APPROVED' },
    });
    await expect(
      state.service.publish('tenant', 'staff', 'attempt'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes("SET status='PUBLISHED'"),
      ),
    ).toBe(false);
    expect(invalidateOfficialTranscripts).not.toHaveBeenCalled();
  });
});

describe('Backlog source and charge boundaries', () => {
  it('checks published attempts for the same offering before any duplicate application or charge', async () => {
    const state = setup({ duplicate: true });
    await expect(
      state.service.apply('tenant', 'student', {
        offering_id: 'offering',
        source_report_id: 'report',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining("offering_id=$6 AND status<>'REJECTED'"),
      ['tenant', 'student', 'course', 4, 'END_TERM', 'offering'],
    );
    expect(state.finance.createDemand).not.toHaveBeenCalled();
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO exam_applications'),
      ),
    ).toBe(false);
  });

  it.each([
    { sourceMissing: true },
    { competingRevaluation: true },
    { sourceAmbiguous: true },
    { duplicate: true },
    { limit: true },
    { hold: true },
  ])(
    'rejects invalid, duplicate, held or exhausted attempts before charging: %j',
    async (options) => {
      const state = setup(options);
      await expect(
        state.service.apply('tenant', 'student', {
          offering_id: 'offering',
          source_report_id: 'report',
        }),
      ).rejects.toThrow();
      expect(state.finance.createDemand).not.toHaveBeenCalled();
      expect(
        state.query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO exam_applications'),
        ),
      ).toBe(false);
    },
  );
  it('rejects a closed offering before charging', async () => {
    const state = setup({ offering: { status: 'CLOSED' } });
    await expect(
      state.service.apply('tenant', 'student', {
        offering_id: 'offering',
        source_report_id: 'report',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(state.finance.createDemand).not.toHaveBeenCalled();
  });
  it('saves the original source snapshot and fee demand in the same transaction', async () => {
    const state = setup();
    await expect(
      state.service.apply('tenant', 'student', {
        offering_id: 'offering',
        source_report_id: 'report',
      }),
    ).resolves.toMatchObject({
      attempt_id: 'attempt',
      finance_demand_id: 'demand',
    });
    expect(state.finance.createDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        fee_head: 'BACKLOG',
        total_amount: 123,
        student_user_id: 'student',
      }),
      'tenant',
      { manager: state.manager, notify: false },
    );
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_backlog_attempts'),
      expect.arrayContaining([
        JSON.stringify(original),
        'original-result',
        'report',
        'session',
        'PAYMENT_PENDING',
      ]),
    );
    expect(state.outside).not.toHaveBeenCalled();
    expect(state.finance.notifyDemandGenerated).toHaveBeenCalledTimes(1);
  });
  it('uses a zero-fee path only when staff explicitly configured NO_FEE and zero', async () => {
    const state = setup({ offering: { fee_mode: 'NO_FEE', fee_amount: 0 } });
    await state.service.apply('tenant', 'student', {
      offering_id: 'offering',
      source_report_id: 'report',
    });
    expect(state.finance.createDemand).not.toHaveBeenCalled();
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_applications'),
      expect.arrayContaining(['WAIVED', 'PENDING']),
    );
  });
  it('does not send a fee notification when the application audit fails', async () => {
    const state = setup({ auditFailure: true });
    await expect(
      state.service.apply('tenant', 'student', {
        offering_id: 'offering',
        source_report_id: 'report',
      }),
    ).rejects.toThrow('audit unavailable');
    expect(state.finance.notifyDemandGenerated).not.toHaveBeenCalled();
  });
});

describe('Payment, review and faculty permissions', () => {
  it('requires a tenant/student/demand-matched settled non-mock payment before approval', async () => {
    const state = setup({
      unpaid: true,
      attempt: { status: 'PAYMENT_PENDING' },
    });
    await expect(
      state.service.review('tenant', 'staff', 'attempt', {
        decision: 'APPROVED',
        reason: 'Checked',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    const call = state.query.mock.calls.find(([sql]) =>
      sql.includes('SELECT d.demand_id'),
    );
    expect(call?.[0]).toContain("t.status='SUCCESS'");
    expect(call?.[0]).toContain("gateway_payload->>'mock'");
    expect(call?.[1]).toEqual(['tenant', 'student', 'demand', 123]);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes('SET status=$3,reviewed_by'),
      ),
    ).toBe(false);
  });
  it('does not let a student synchronize another student’s payment', async () => {
    const state = setup();
    await expect(
      state.service.synchronizePayment('tenant', 'other', 'attempt'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes('SELECT d.demand_id'),
      ),
    ).toBe(false);
  });
  it('rejects staff or another faculty member attempting to enter marks', async () => {
    await expect(
      setup().service.saveMarks('tenant', 'staff', 'attempt', 30),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('rejects out-of-range marks and resubmission after faculty submission', async () => {
    await expect(
      setup().service.saveMarks('tenant', 'faculty', 'attempt', 51),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      setup({ attempt: { marks_status: 'SUBMITTED' } }).service.saveMarks(
        'tenant',
        'faculty',
        'attempt',
        30,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
  it('blocks an out-of-scope Dean even with a valid academic role', async () => {
    jest.mocked(resolveDeanDepartmentIds).mockResolvedValue([3]);
    await expect(
      setup({ attempt: { marks_status: 'COE_APPROVED' } }).service.advanceMarks(
        'tenant',
        'dean',
        'attempt',
        'DEAN_APPROVED',
        ['Dean'],
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('Published retake persistence', () => {
  it('requires the complete marks approval sequence before publication', async () => {
    const state = setup({ attempt: { marks_status: 'SUBMITTED' } });
    await expect(
      state.service.publish('tenant', 'staff', 'attempt'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(
      state.query.mock.calls.some(([sql]) =>
        sql.includes("SET status='PUBLISHED'"),
      ),
    ).toBe(false);
  });
  it('records a new immutable attempt outcome and selected enrollment grade without changing original marks/results', async () => {
    const state = setup({ attempt: { marks_status: 'DEAN_APPROVED' } });
    await expect(
      state.service.publish('tenant', 'staff', 'attempt'),
    ).resolves.toMatchObject({
      status: 'PUBLISHED',
      grade: 'A',
      grade_points: 8,
      result_status: 'PASS',
      selected_attempt_id: 'attempt',
    });
    expect(
      state.query.mock.calls.some(([sql]) =>
        /UPDATE\s+academic_marks|UPDATE\s+academic_exam_results|UPDATE\s+student_exam_reports|DELETE FROM/i.test(
          sql,
        ),
      ),
    ).toBe(false);
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE student_course_enrollments'),
      expect.arrayContaining(['A', 8, 'PASS']),
    );
    expect(invalidateOfficialTranscripts).toHaveBeenCalledWith(
      state.manager,
      expect.objectContaining({
        tenantId: 'tenant',
        studentUserId: 'student',
        semester: 4,
      }),
    );
    expect(state.audit.log).toHaveBeenCalledWith(
      'tenant',
      'staff',
      expect.objectContaining({ action: 'BACKLOG_RESULT_PUBLISHED' }),
      state.manager,
    );
  });
});

describe('Retake SQL parameter typing', () => {
  it('uses explicit stage and actor casts for the shared submission and approval update', async () => {
    const state = setup();
    await state.service.advanceMarks(
      'tenant',
      'faculty',
      'attempt',
      'SUBMITTED',
    );
    expect(state.query).toHaveBeenCalledWith(
      expect.stringContaining('SET marks_status=$3::varchar'),
      ['tenant', 'attempt', 'SUBMITTED', 'faculty'],
    );
    expect(
      state.query.mock.calls.find(([sql]) =>
        sql.includes('SET marks_status='),
      )?.[0],
    ).toContain("WHEN $3::varchar='COE_APPROVED' THEN $4::uuid");
  });
});
