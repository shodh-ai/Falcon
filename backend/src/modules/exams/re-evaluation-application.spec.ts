import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ExamsService } from './exams.service';
import { ExamsController } from './exams.controller';
import { CreateExamApplicationDto } from './dto/create-exam-application.dto';

describe('Student re-evaluation applications', () => {
  const studentId = '10000000-0000-4000-8000-000000000001';
  const tenantId = '20000000-0000-4000-8000-000000000001';
  const resultId = '30000000-0000-4000-8000-000000000001';
  const applicationId = '40000000-0000-4000-8000-000000000001';
  const publishedResult = {
    result_id: resultId,
    subject_id: 7,
    subject_code: 'TEST101',
    subject_name: 'Test Subject',
    exam_session: '2026-ODD',
    exam_type: 'END_TERM',
    marks_obtained: '0',
    max_marks: '30',
    grade: 'P',
    grade_points: '8',
    course_id: '50000000-0000-4000-8000-000000000001',
    result_session_id: '60000000-0000-4000-8000-000000000001',
    source_mark_id: '70000000-0000-4000-8000-000000000001',
    source_report_id: '80000000-0000-4000-8000-000000000001',
    source_mark_updated_at: '2026-10-19 00:00:00+00',
    grading_policy_snapshot: {
      bands: [{ minPercent: 0, maxPercent: 100, grade: 'P', gradePoints: 8 }],
    },
  };

  const dto = (
    change: Partial<CreateExamApplicationDto> = {},
  ): CreateExamApplicationDto => ({
    subject_id: 7,
    application_type: 'RE_EVALUATION',
    exam_result_id: resultId,
    ...change,
  });

  function setup() {
    const query = jest.fn().mockImplementation(async (sql: string) => {
      if (sql.startsWith('SELECT s.semester'))
        return [
          {
            semester: 4,
            session_max: 30,
            source_marks: 0,
            report_marks: 0,
            source_max: 30,
            report_max: 30,
            source_updated_at: publishedResult.source_mark_updated_at,
            report_declared_at: publishedResult.source_mark_updated_at,
            report_grade: 'P',
            report_grade_points: '8',
            report_result_status: 'FAIL',
          },
        ];
      if (sql.startsWith('SELECT enrollment_id'))
        return [{ enrollment_id: 'enrollment-1' }];
      return [publishedResult];
    });
    const users = {
      findOne: jest
        .fn()
        .mockResolvedValue({
          user_id: studentId,
          tenant_id: tenantId,
          is_active: true,
        }),
    };
    const applications = {
      create: jest.fn().mockImplementation((value) => ({ ...value })),
      save: jest
        .fn()
        .mockImplementation(async (value) => ({
          ...value,
          exam_application_id: applicationId,
        })),
    };
    const finance = {
      createDemand: jest.fn().mockResolvedValue({ demand_id: 'demand-1' }),
    };
    const service = new ExamsService(
      {} as never,
      applications as never,
      users as never,
      { query } as never,
      finance as never,
      {} as never,
      {} as never,
    );
    return { service, query, users, applications, finance };
  }

  it.each([undefined, '', 'not-a-result-id'])(
    'requires a valid exact result ID before reading records or charging a fee (%p)',
    async (examResultId) => {
      const { service, query, users, applications, finance } = setup();

      await expect(
        service.createApplication(
          studentId,
          dto({ exam_result_id: examResultId }),
          tenantId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(users.findOne).not.toHaveBeenCalled();
      expect(query).not.toHaveBeenCalled();
      expect(applications.create).not.toHaveBeenCalled();
      expect(applications.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
    },
  );

  it.each([
    { reason: 'another student', clause: 'r.student_user_id = $2' },
    { reason: 'another subject', clause: 'sub.subject_id = $3' },
    {
      reason: 'another university',
      clause: '(r.tenant_id = $1 OR r.tenant_id IS NULL)',
    },
    { reason: 'a deleted result', clause: 'r.deleted_at IS NULL' },
    { reason: 'an unpublished result', clause: "r.status = 'PUBLISHED'" },
  ])(
    'rejects an exact result excluded by the query scope: $reason',
    async ({ clause }) => {
      const { service, query, applications, finance } = setup();
      query.mockResolvedValue([]);

      await expect(
        service.createApplication(studentId, dto(), tenantId),
      ).rejects.toBeInstanceOf(BadRequestException);

      const [sql, parameters] = query.mock.calls[0];
      expect(sql).toContain(clause);
      expect(sql).toContain('student.tenant_id = $1');
      expect(parameters).toEqual([tenantId, studentId, 7]);
      expect(applications.create).not.toHaveBeenCalled();
      expect(applications.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
    },
  );

  it('does not substitute another result from the same subject when the selected ID is absent', async () => {
    const { service, query, applications, finance } = setup();
    query.mockResolvedValue([
      { ...publishedResult, result_id: '30000000-0000-4000-8000-000000000099' },
    ]);

    await expect(
      service.createApplication(studentId, dto(), tenantId),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it.each([null, '0', '-1', 'Infinity'])(
    'rejects results without a genuine positive maximum instead of assuming 100 (%p)',
    async (maximum) => {
      const { service, query, applications, finance } = setup();
      query.mockResolvedValue([{ ...publishedResult, max_marks: maximum }]);

      await expect(
        service.createApplication(studentId, dto(), tenantId),
      ).rejects.toThrow('maximum marks');

      expect(applications.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
    },
  );

  it.each([null, '-1', '31'])(
    'rejects invalid original marks before charging the fee (%p)',
    async (original) => {
      const { service, query, applications, finance } = setup();
      query.mockResolvedValue([
        { ...publishedResult, marks_obtained: original },
      ]);

      await expect(
        service.createApplication(studentId, dto(), tenantId),
      ).rejects.toThrow('original marks');

      expect(applications.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
    },
  );

  it('rejects an authenticated tenant mismatch before looking up results or charging a fee', async () => {
    const { service, query, applications, finance } = setup();

    await expect(
      service.createApplication(studentId, dto(), 'another-tenant'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(query).not.toHaveBeenCalled();
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { user_id: studentId, tenant_id: null },
    { user_id: studentId, tenant_id: tenantId, is_active: false },
  ])(
    'requires an active student with a real tenant instead of falling back to a default tenant (%p)',
    async (student) => {
      const { service, query, users, applications, finance } = setup();
      users.findOne.mockResolvedValue(student);

      await expect(
        service.createApplication(studentId, dto(), tenantId),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(query).not.toHaveBeenCalled();
      expect(applications.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
    },
  );

  it('stores the exact result and genuine zero original mark while retaining the existing 500 fee', async () => {
    const { service, applications, finance } = setup();

    const application = await service.createApplication(
      studentId,
      dto(),
      tenantId,
    );

    expect(applications.create).toHaveBeenCalledWith({
      student_user_id: studentId,
      subject_id: 7,
      exam_result_id: resultId,
      original_marks: 0,
      application_type: 'RE_EVALUATION',
      fee_status: 'PENDING',
      status: 'DRAFT',
    });
    expect(application).toMatchObject({
      exam_application_id: applicationId,
      exam_result_id: resultId,
      original_marks: 0,
      finance_demand_id: 'demand-1',
      status: 'DRAFT',
    });
    expect(finance.createDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        student_user_id: studentId,
        fee_head: 'RE_EVALUATION',
        total_amount: 500,
      }),
      tenantId,
    );
    expect(applications.save).toHaveBeenCalledTimes(1);
  });

  it('blocks an unverified legacy result before creating a fee demand but keeps its real marks readable', async () => {
    const { service, query, applications, finance } = setup();
    query.mockResolvedValue([
      {
        ...publishedResult,
        result_session_id: null,
        source_mark_id: null,
        source_report_id: null,
        grading_policy_snapshot: null,
      },
    ]);
    await expect(
      service.createApplication(studentId, dto(), tenantId),
    ).rejects.toThrow('official declaration source');
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
    const candidates = await service.listReEvaluationResults(
      studentId,
      tenantId,
    );
    expect(candidates[0]).toMatchObject({
      marks_obtained: 0,
      max_marks: 30,
      is_valid: true,
      can_apply_for_re_evaluation: false,
    });
  });

  it('refuses an already-stale declared source before creating a fee or application', async () => {
    const { service, query, applications, finance } = setup();
    query.mockImplementation(async (sql: string) =>
      sql.startsWith('SELECT s.semester')
        ? [
            {
              source_marks: 1,
              report_marks: 0,
              source_max: 30,
              report_max: 30,
              session_max: 30,
            },
          ]
        : [publishedResult],
    );
    await expect(
      service.createApplication(studentId, dto(), tenantId),
    ).rejects.toThrow('source marks');
    expect(finance.createDemand).not.toHaveBeenCalled();
    expect(applications.save).not.toHaveBeenCalled();
    expect(
      query.mock.calls.every(([sql]) => !/UPDATE|INSERT|DELETE/.test(sql)),
    ).toBe(true);
  });

  it.each([
    { grade: 'F' }, { grade: null }, { grade_points: '0' }, { grade_points: null },
  ])('refuses inconsistent canonical grade evidence before charging any fee: %j', async mismatch => {
    const { service, query, applications, finance } = setup();
    const originalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => sql.startsWith('SELECT r.result_id')
      ? [{ ...publishedResult, ...mismatch }] : originalQuery(sql));
    await expect(service.createApplication(studentId, dto(), tenantId)).rejects.toThrow('source marks');
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it.each([
    { report_declared_at: null }, { report_grade: 'F' },
    { report_grade_points: '0' }, { report_result_status: 'PASS' },
  ])('refuses undeclared or inconsistent report evidence before charging any fee: %j', async mismatch => {
    const { service, query, applications, finance } = setup();
    const originalQuery = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string) => {
      const rows = await originalQuery(sql);
      return sql.startsWith('SELECT s.semester') ? rows.map(row => ({ ...row, ...mismatch })) : rows;
    });
    await expect(service.createApplication(studentId, dto(), tenantId)).rejects.toThrow('source marks');
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it('lists eligible results with their genuine maximum and excludes unusable maximums', async () => {
    const { service, query, applications, finance } = setup();
    query.mockResolvedValue([
      publishedResult,
      {
        ...publishedResult,
        result_id: '30000000-0000-4000-8000-000000000002',
        max_marks: null,
      },
    ]);

    const rows = await service.listReEvaluationResults(studentId, tenantId);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      result_id: resultId,
      marks_obtained: 0,
      max_marks: 30,
      is_valid: true,
    });
    expect(query.mock.calls[0][1]).toEqual([tenantId, studentId, null]);
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it('exposes the linked exam and maximum when reading applications without changing the result or request', async () => {
    const { service, query, applications, finance } = setup();
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM exam_applications a')
        ? [
            {
              exam_application_id: applicationId,
              application_type: 'RE_EVALUATION',
              subject_id: 7,
              exam_result_id: resultId,
            },
          ]
        : [publishedResult],
    );

    const rows = await service.listMyApplications(studentId);

    expect(rows[0]).toMatchObject({
      exam_result_id: resultId,
      exam_max_marks: 30,
      exam_type: 'END_TERM',
      exam_session: '2026-ODD',
      exam_link_status: 'linked',
    });
    expect(query.mock.calls[0][0]).toContain('a.deleted_at IS NULL');
    expect(
      query.mock.calls.some(([sql]) => /UPDATE|INSERT|DELETE/.test(sql)),
    ).toBe(false);
    expect(applications.save).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it('leaves an unresolvable legacy application visibly unlinked without inventing exam or maximum', async () => {
    const { service, query, applications } = setup();
    query.mockImplementation(async (sql: string) =>
      sql.includes('FROM exam_applications a')
        ? [
            {
              exam_application_id: applicationId,
              application_type: 'RE_EVALUATION',
              subject_id: 7,
              exam_result_id: null,
            },
          ]
        : [],
    );

    const rows = await service.listMyApplications(studentId);

    expect(rows[0]).toMatchObject({
      exam_result_id: null,
      exam_max_marks: null,
      exam_session: null,
      exam_type: null,
      exam_link_status: 'missing',
    });
    expect(applications.save).not.toHaveBeenCalled();
  });

  it('keeps backlog applications working without a published result reference or re-evaluation fee', async () => {
    const { service, query, users, applications, finance } = setup();

    const application = await service.createApplication(
      studentId,
      dto({
        application_type: 'BACKLOG',
        exam_result_id: undefined,
      }),
      tenantId,
    );

    expect(application).toMatchObject({
      subject_id: 7,
      exam_result_id: null,
      original_marks: null,
      application_type: 'BACKLOG',
      status: 'PENDING',
      fee_status: 'PENDING',
    });
    expect(applications.save).toHaveBeenCalledTimes(1);
    expect(users.findOne).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it('forwards the exact result reference and authenticated tenant through the student controller', () => {
    const service = {
      createApplication: jest.fn(),
      listReEvaluationResults: jest.fn(),
    };
    const controller = new ExamsController(service as never);
    const request = { user: { user_id: studentId, tenant_id: tenantId } };
    const input = dto();

    controller.apply(request, input);
    controller.reEvaluationResults(request);

    expect(service.createApplication).toHaveBeenCalledWith(
      studentId,
      input,
      tenantId,
    );
    expect(service.listReEvaluationResults).toHaveBeenCalledWith(
      studentId,
      tenantId,
    );
  });

  it.each([undefined, 'not-a-result-id'])(
    'validates the re-evaluation result reference at the DTO boundary (%p)',
    async (examResultId) => {
      const errors = await validate(
        plainToInstance(
          CreateExamApplicationDto,
          dto({ exam_result_id: examResultId }),
        ),
      );
      expect(errors.some((error) => error.property === 'exam_result_id')).toBe(
        true,
      );
    },
  );

  it.each([
    { application_type: 'RE_EVALUATION', exam_result_id: resultId },
    { application_type: 'BACKLOG' },
  ])('accepts a valid DTO for $application_type', async (change) => {
    const input = { subject_id: 7, ...change };
    await expect(
      validate(plainToInstance(CreateExamApplicationDto, input)),
    ).resolves.toEqual([]);
  });
});
