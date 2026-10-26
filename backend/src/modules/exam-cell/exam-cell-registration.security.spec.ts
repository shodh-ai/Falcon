import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';

const tenant = '11111111-1111-4111-8111-111111111111';
const actor = '22222222-2222-4222-8222-222222222222';
const sessionId = '33333333-3333-4333-8333-333333333333';
const windowId = '44444444-4444-4444-8444-444444444444';
const studentId = '55555555-5555-4555-8555-555555555555';
const registrationId = '66666666-6666-4666-8666-666666666666';
const courseId = '77777777-7777-4777-8777-777777777777';
const enrollmentId = '88888888-8888-4888-8888-888888888888';

describe('Exam Cell registration security (mocked database)', () => {
  function fixture() {
    const session = {
      session_id: sessionId,
      tenant_id: tenant,
      academic_year: '2026-2027',
      semester: 4,
      program_label: 'BTECH CSE',
      status: 'OPEN',
    };
    const window = {
      window_id: windowId,
      tenant_id: tenant,
      session_id: sessionId,
      semester: 4,
      program_label: 'BTECH CSE',
      status: 'OPEN',
      accepting: true,
    };
    const current = {
      registration_id: registrationId,
      student_user_id: studentId,
      window_id: windowId,
      session_id: sessionId,
      semester: 4,
      status: 'PENDING',
    };
    const rosterStudent = {
      student_user_id: studentId,
      student_name: 'Fixture',
      program_label: 'BTECH CSE',
      semester: 4,
      enrollments: [
        {
          enrollment_id: enrollmentId,
          course_id: courseId,
          course_code: 'CS401',
          course_name: 'Fixture course',
          subject_id: 42,
          subject_code: 'CS401',
          subject_name: 'Fixture course',
        },
      ],
      unresolved_reasons: [] as string[],
    };
    let duplicate = false;
    let removed = false;
    const query = jest.fn(
      async (sql: string, _params?: unknown[]): Promise<unknown[]> => {
        if (sql.startsWith('SELECT session_id FROM exam_form_windows'))
          return [{ session_id: sessionId }];
        if (sql.includes('FROM exam_sessions')) return [session];
        if (sql.includes('FROM exam_form_windows')) return [window];
        if (sql.startsWith('SELECT window_id FROM exam_semester'))
          return [{ window_id: windowId }];
        if (sql.startsWith('SELECT * FROM exam_semester')) return [current];
        if (sql.startsWith('INSERT INTO exam_semester'))
          return duplicate ? [] : [{ registration_id: registrationId }];
        if (sql.startsWith('WITH changed AS (UPDATE exam_semester'))
          return [{ ...current, status: 'APPROVED' }];
        if (sql.startsWith('WITH invalidated AS'))
          return removed ? [{ registration_id: registrationId }] : [];
        if (sql.includes('INSERT INTO exam_form_windows')) return [window];
        return [];
      },
    );
    const manager = { query };
    const db = {
      query: jest.fn(),
      transaction: jest.fn(
        async (run: (m: typeof manager) => Promise<unknown>) => run(manager),
      ),
    };
    const attendance = {
      evaluate: jest
        .fn()
        .mockResolvedValue({
          eligible: true,
          attendance_percent: 85,
          reason: null,
        }),
    };
    const finance = { getPendingDues: jest.fn().mockResolvedValue([]) };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const source = {
      listExamRegistrationRoster: jest.fn().mockResolvedValue([rosterStudent]),
    };
    const service = new ExamCellOperationsService(
      db as never,
      attendance as never,
      finance as never,
      audit as never,
      {} as never,
      {} as never,
      source as never,
    );
    return {
      service,
      db,
      query,
      manager,
      source,
      session,
      window,
      current,
      rosterStudent,
      attendance,
      finance,
      audit,
      setDuplicate: () => {
        duplicate = true;
      },
      setRemoved: () => {
        removed = true;
      },
    };
  }

  it('uses authenticated tenant, real source contract, strict clearance and one transaction for registrations and audit', async () => {
    const f = fixture();
    await expect(
      f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
    ).resolves.toEqual({ created: 1, refreshed: 0, total_students: 1 });
    expect(f.source.listExamRegistrationRoster).toHaveBeenCalledWith(
      tenant,
      { academic_year: '2026-2027', semester: 4, program_label: 'BTECH CSE' },
      f.manager,
      undefined,
    );
    expect(f.finance.getPendingDues).toHaveBeenCalledWith(studentId, tenant);
    expect(f.attendance.evaluate).toHaveBeenCalledWith(
      tenant,
      studentId,
      expect.objectContaining({
        strict: true,
        semester: 4,
        courseIds: [courseId],
        manager: f.manager,
      }),
    );
    const insert = f.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO exam_semester'),
    )!;
    expect(insert[0]).toContain(
      'ON CONFLICT (window_id, student_user_id) DO NOTHING',
    );
    expect(insert[1]?.slice(0, 5)).toEqual([
      tenant,
      windowId,
      sessionId,
      studentId,
      4,
    ]);
    expect(JSON.parse(String(insert[1]?.[6]))).toMatchObject({
      session_id: sessionId,
      enrollments: [{ enrollment_id: enrollmentId, subject_id: 42 }],
      eligible: true,
    });
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({ action: 'REGISTRATIONS_SYNCHRONIZED' }),
      f.manager,
    );
    expect(f.db.query).not.toHaveBeenCalled();
  });

  it.each(['missing', 'blank', 'invalid'])(
    'rejects %s tenant before querying',
    async (kind) => {
      const f = fixture();
      const id =
        kind === 'missing' ? undefined : kind === 'blank' ? ' ' : 'wrong';
      await expect(
        f.service.seedRegistrationsFromSemester(
          id as never,
          windowId,
          4,
          actor,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(f.db.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects another tenant or nonexistent window before enrollment reads', async () => {
    const f = fixture();
    f.query.mockResolvedValueOnce([]);
    await expect(
      f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(f.source.listExamRegistrationRoster).not.toHaveBeenCalled();
  });

  it.each(['semester', 'dates', 'closed'])(
    'rejects invalid %s context without writes',
    async (kind) => {
      const f = fixture();
      if (kind === 'dates') f.window.accepting = false;
      if (kind === 'closed') f.session.status = 'CLOSED';
      await expect(
        f.service.seedRegistrationsFromSemester(
          tenant,
          windowId,
          kind === 'semester' ? 5 : 4,
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(f.source.listExamRegistrationRoster).not.toHaveBeenCalled();
      expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
        false,
      );
    },
  );

  it('records eligibility exceptions instead of silently approving a denial without a reason', async () => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue({
      eligible: false,
      attendance_percent: 30,
      reason: null,
    });
    f.rosterStudent.unresolved_reasons.push('Missing official subject mapping');
    f.finance.getPendingDues.mockResolvedValue([{ demand_id: 'fixture' }]);
    await f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor);
    const params = f.query.mock.calls.find(([sql]) =>
      sql.startsWith('INSERT INTO exam_semester'),
    )![1]!;
    expect(params[7]).toBe('REJECTED');
    expect(JSON.parse(String(params[6])).block_reasons).toEqual([
      'Missing official subject mapping',
      'Attendance clearance has not been verified',
      'Pending fee dues',
    ]);
  });

  it.each(['attendance', 'finance', 'source'])(
    'fails closed when %s is unavailable',
    async (dependency) => {
      const f = fixture();
      const method =
        dependency === 'attendance'
          ? f.attendance.evaluate
          : dependency === 'finance'
            ? f.finance.getPendingDues
            : f.source.listExamRegistrationRoster;
      method.mockRejectedValue(new Error('Source offline'));
      await expect(
        f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(f.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(
        false,
      );
      expect(f.audit.log).not.toHaveBeenCalled();
    },
  );

  it('refreshes only pending/rejected snapshots on duplicate sync and preserves review fields', async () => {
    const f = fixture();
    f.setDuplicate();
    await expect(
      f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
    ).resolves.toMatchObject({ created: 0, refreshed: 1 });
    const refresh = f.query.mock.calls.find(([sql]) =>
      sql.startsWith('WITH changed AS (UPDATE exam_semester'),
    )![0];
    expect(refresh).toContain("status IN ('PENDING','REJECTED')");
    expect(refresh).not.toMatch(/SET status|reviewed_by =|reviewed_at =/);
  });

  it('rechecks clearance before approval and rejects an ineligible registration without updating it', async () => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue({
      eligible: false,
      attendance_percent: 40,
      reason: 'Attendance shortage',
    });
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).rejects.toThrow('Attendance shortage');
    expect(
      f.query.mock.calls.some(([sql]) => sql.includes('UPDATE exam_semester')),
    ).toBe(false);
  });

  it('invalidates pending/rejected snapshots for students absent from the current roster, including an empty roster', async () => {
    const f = fixture();
    f.setRemoved();
    f.source.listExamRegistrationRoster.mockResolvedValue([]);
    await expect(
      f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
    ).resolves.toEqual({ created: 0, refreshed: 1, total_students: 0 });
    const [sql, params] = f.query.mock.calls.find(([query]) =>
      query.startsWith('WITH invalidated AS'),
    )!;
    expect(params?.slice(0, 5)).toEqual([tenant, windowId, sessionId, 4, []]);
    expect(JSON.parse(String(params?.[5]))).toEqual({
      eligible: false,
      enrollments: [],
      block_reasons: [
        'Student is no longer on the verified programme/semester enrollment roster',
      ],
    });
    expect(sql).toContain("status IN ('PENDING','REJECTED')");
    expect(sql).not.toMatch(
      /SET status|reviewed_at =|reviewed_by =|fee_status =/,
    );
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({
        new_value: expect.objectContaining({ invalidated: 1, refreshed: 1 }),
      }),
      f.manager,
    );
    expect(f.attendance.evaluate).not.toHaveBeenCalled();
  });

  it('does not invalidate current roster members on resync', async () => {
    const f = fixture();
    await f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor);
    const [sql, params] = f.query.mock.calls.find(([query]) =>
      query.startsWith('WITH invalidated AS'),
    )!;
    expect(sql).toContain('NOT (student_user_id = ANY($5::uuid[]))');
    expect(params?.[4]).toEqual([studentId]);
  });

  it('requires an open or active session for review but permits reviewing a closed form window', async () => {
    const f = fixture();
    f.session.status = 'DRAFT';
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).rejects.toThrow('open or active');
    expect(f.source.listExamRegistrationRoster).not.toHaveBeenCalled();
    f.session.status = 'ACTIVE';
    f.window.status = 'CLOSED';
    f.window.accepting = false;
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('permits fresh review of a previously rejected, now eligible registration', async () => {
    const f = fixture();
    f.current.status = 'REJECTED';
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({ old_value: { status: 'REJECTED' } }),
      f.manager,
    );
  });

  it.each(['SENT_BACK', 'SUBMITTED'])(
    'preserves Registrar %s workflow',
    async (status) => {
      const f = fixture();
      f.current.status = status;
      await expect(
        f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
      ).rejects.toThrow('Registrar workflow');
      expect(f.source.listExamRegistrationRoster).not.toHaveBeenCalled();
    },
  );

  it('rejects mismatched registration session and inactive student rosters', async () => {
    const f = fixture();
    f.current.session_id = windowId;
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).rejects.toThrow('inconsistent');
    f.current.session_id = sessionId;
    f.source.listExamRegistrationRoster.mockResolvedValue([]);
    await expect(
      f.service.reviewRegistration(tenant, registrationId, actor, 'APPROVED'),
    ).rejects.toThrow('not actively enrolled');
  });

  it('propagates required audit failure out of the transaction', async () => {
    const f = fixture();
    f.audit.log.mockRejectedValue(new Error('Audit unavailable'));
    await expect(
      f.service.seedRegistrationsFromSemester(tenant, windowId, 4, actor),
    ).rejects.toThrow('Audit unavailable');
    // Mock confirms transaction propagation only; PostgreSQL suite proves rollback.
  });

  it('requires a valid session, matching semester/programme and ordered dates when creating a window', async () => {
    const f = fixture();
    const dto = {
      title: 'Registration fixture',
      session_id: sessionId,
      semester: 4,
      program_label: 'BTECH CSE',
      opens_at: '2026-10-01T00:00:00Z',
      closes_at: '2026-11-01T00:00:00Z',
    };
    await expect(
      f.service.createFormWindow(tenant, actor, {
        ...dto,
        closes_at: dto.opens_at,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      f.service.createFormWindow(tenant, actor, { ...dto, semester: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      f.service.createFormWindow(tenant, actor, dto),
    ).resolves.toMatchObject({ window_id: windowId });
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({ action: 'FORM_WINDOW_CREATED' }),
      f.manager,
    );
  });
});

describe('Read-only official examination registration roster', () => {
  function fixture() {
    const enrollment = {
      student_user_id: studentId,
      student_name: 'Fixture',
      enrollment_id: enrollmentId,
      course_id: courseId,
      course_code: 'CS401',
      course_name: 'Fixture course',
    };
    const profile = {
      user_id: studentId,
      batch: 'BTECH CSE',
      current_semester: 4,
      section_code: 'A',
    };
    const allocation = {
      course_id: courseId,
      program_name: 'BTECH CSE',
      semester: 'IV-A',
      subject_id: 42,
      subject_code: 'CS401',
      subject_name: 'Fixture course',
      subject_semester: 4,
    };
    const query = jest
      .fn()
      .mockResolvedValueOnce([enrollment])
      .mockResolvedValueOnce([profile])
      .mockResolvedValueOnce([allocation]);
    return {
      query,
      profile,
      allocation,
      service: new StudentEnrollmentSyncService({ query } as never),
    };
  }
  const scope = {
    academic_year: '2026-2027',
    semester: 4,
    program_label: 'BTECH CSE',
  };

  it('reads tenant-bound active source records and unambiguous official subject mapping without synchronization writes', async () => {
    const f = fixture();
    const manager = { query: f.query };
    const rows = await f.service.listExamRegistrationRoster(
      tenant,
      scope,
      manager as never,
      studentId,
    );
    expect(rows[0].unresolved_reasons).toEqual([]);
    expect(rows[0].enrollments[0].subject_id).toBe(42);
    expect(
      f.query.mock.calls.every(([sql]: [string]) =>
        sql.trim().startsWith('SELECT'),
      ),
    ).toBe(true);
    expect(f.query.mock.calls[0][0]).toContain("e.status = 'ENROLLED'");
    expect(f.query.mock.calls[0][0]).toContain('c.tenant_id = e.tenant_id');
    expect(f.query.mock.calls[0][0]).toContain('FOR SHARE OF u, e, c');
    expect(f.query.mock.calls[2][1]).toEqual([
      tenant,
      scope.academic_year,
      [courseId],
    ]);
  });

  it.each([
    'missing programme',
    'wrong semester',
    'bad allocation',
    'missing section',
  ])(
    'reports unresolved %s instead of matching permissive source defaults',
    async (kind) => {
      const f = fixture();
      if (kind === 'missing programme') f.profile.batch = '';
      if (kind === 'wrong semester') f.profile.current_semester = 5;
      if (kind === 'bad allocation') f.allocation.semester = '';
      if (kind === 'missing section') f.profile.section_code = '';
      const rows = await f.service.listExamRegistrationRoster(tenant, scope);
      expect(rows[0].unresolved_reasons.length).toBeGreaterThan(0);
    },
  );

  it('rejects missing explicit programme rather than assuming a default', async () => {
    const f = fixture();
    await expect(
      f.service.listExamRegistrationRoster(tenant, {
        ...scope,
        program_label: '',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(f.query).not.toHaveBeenCalled();
  });

  it('does not register a different degree merely because both programme names contain CSE', async () => {
    const f = fixture();
    f.profile.batch = 'MTECH CSE';
    f.allocation.program_name = 'MTECH CSE';
    await expect(
      f.service.listExamRegistrationRoster(tenant, scope),
    ).resolves.toEqual([]);
    const detail = fixture();
    detail.profile.batch = 'MTECH CSE';
    detail.allocation.program_name = 'MTECH CSE';
    const rows = await detail.service.listExamRegistrationRoster(
      tenant,
      scope,
      undefined,
      studentId,
    );
    expect(rows[0].unresolved_reasons).toContain(
      'Student programme does not match the examination session',
    );
  });

  it('rejects an allocation for another degree despite a matching subject branch', async () => {
    const f = fixture();
    f.allocation.program_name = 'MTECH CSE';
    const rows = await f.service.listExamRegistrationRoster(tenant, scope);
    expect(rows[0].enrollments[0].subject_id).toBeNull();
    expect(rows[0].unresolved_reasons).not.toEqual([]);
  });
});
