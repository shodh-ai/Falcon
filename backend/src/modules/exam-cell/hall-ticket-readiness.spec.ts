import { HallTicketReadinessService } from './hall-ticket-readiness.service';

describe('Hall Ticket exact registration diagnostics (mocked sources)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const session = '22222222-2222-4222-8222-222222222222';
  const registrationId = '33333333-3333-4333-8333-333333333333';
  const studentId = '44444444-4444-4444-8444-444444444444';
  const course = '55555555-5555-4555-8555-555555555555';
  const schedule = '66666666-6666-4666-8666-666666666666';
  function fixture() {
    const registration = {
      student_user_id: studentId,
      window_id: '77777777-7777-4777-8777-777777777777',
      session_id: session,
      semester: 4,
      status: 'APPROVED',
      reviewed_at: new Date(),
      reviewed_by: studentId,
    };
    const seats = [
      { exam_schedule_id: schedule, room: 'Hall A', seat_number: 'A1' },
    ];
    const approval = {
      stage: 'APPROVED',
      eligibility_status: 'APPROVED',
      finance_status: 'APPROVED',
      exam_office_status: 'APPROVED',
      coe_status: 'APPROVED',
      approved_at: new Date(),
      approved_by: studentId,
      block_reasons: [],
    };
    const query = jest.fn((sql: string): unknown[] => {
      if (sql.includes('FROM exam_sessions'))
        return [
          {
            session_id: session,
            semester: 4,
            program_label: 'BTECH CSE',
            academic_year: '2026-2027',
            status: 'OPEN',
          },
        ];
      if (sql.includes('FROM exam_semester_registrations'))
        return [registration];
      if (sql.includes('FROM exam_form_windows'))
        return [
          { session_id: session, semester: 4, program_label: 'BTECH CSE' },
        ];
      if (sql.includes('FROM hall_ticket_approvals')) return [approval];
      if (sql.includes('FROM exam_schedules'))
        return [
          {
            exam_schedule_id: schedule,
            subject_id: 7,
            exam_date: '2026-11-05',
            start_time: '09:00',
            end_time: '12:00',
            venue: 'Hall A',
            status: 'SCHEDULED',
          },
        ];
      if (sql.includes('FROM exam_seating_allocations')) return seats;
      throw new Error('Unexpected query');
    });
    const manager = { query };
    const enrollment = {
      listExamRegistrationRoster: jest.fn().mockResolvedValue([
        {
          student_user_id: studentId,
          unresolved_reasons: [],
          enrollments: [
            { course_id: course, course_code: 'TEST-01', subject_id: 7 },
          ],
        },
      ]),
    };
    const attendance = {
      evaluate: jest
        .fn()
        .mockResolvedValue({ eligible: true, attendance_percent: 90 }),
    };
    const finance = { getPendingDues: jest.fn().mockResolvedValue([]) };
    const service = new HallTicketReadinessService(
      {
        transaction: (fn: (m: typeof manager) => unknown) => fn(manager),
      } as never,
      enrollment as never,
      attendance as never,
      finance as never,
    );
    return {
      registration,
      seats,
      approval,
      query,
      manager,
      enrollment,
      attendance,
      finance,
      service,
    };
  }
  it('scopes strict attendance to exact courses and semester but never authorizes issuance', async () => {
    const f = fixture();
    const result = await f.service.inspect(
      tenant,
      session,
      registrationId,
      'ExamCell',
    );
    expect(f.attendance.evaluate).toHaveBeenCalledWith(tenant, studentId, {
      strict: true,
      context: 'ADMIT_CARD',
      semester: 4,
      courseIds: [course],
      manager: f.manager,
      audit: false,
    });
    expect(f.finance.getPendingDues).toHaveBeenCalledWith(studentId, tenant);
    expect(result).toMatchObject({
      ready_to_issue: false,
      diagnostic_only: true,
      block_reasons: [],
    });
    expect(result.unresolved_requirements.join(' ')).toMatch(
      /internal assessment/,
    );
    expect(
      f.query.mock.calls.every(
        ([sql]) => !/\b(INSERT|UPDATE|DELETE)\b/.test(sql),
      ),
    ).toBe(true);
  });
  it.each(['Student', 'Faculty', 'Accountant', undefined])(
    'rejects diagnostic access by %s',
    async (role) => {
      const f = fixture();
      await expect(
        f.service.inspect(tenant, session, registrationId, role),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.query).not.toHaveBeenCalled();
    },
  );
  it('rejects missing tenant and malformed registration identity without source calls', async () => {
    const f = fixture();
    await expect(
      f.service.inspect('', session, registrationId, 'ExamCell'),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.service.inspect(tenant, session, '', 'ExamCell'),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each([
    undefined,
    null,
    { eligible: true },
    { eligible: true, attendance_percent: 101 },
  ])('fails closed on malformed attendance %p', async (value) => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue(value);
    await expect(
      f.service.inspect(tenant, session, registrationId, 'ExamCell'),
    ).rejects.toMatchObject({ status: 503 });
    expect(f.finance.getPendingDues).not.toHaveBeenCalled();
  });
  it('explains denied attendance even when the upstream reason is missing', async () => {
    const f = fixture();
    f.attendance.evaluate.mockResolvedValue({
      eligible: false,
      attendance_percent: 0,
    });
    expect(
      (await f.service.inspect(tenant, session, registrationId, 'ExamCell'))
        .block_reasons,
    ).toContain('Strict attendance clearance is not verified');
  });
  it('rejects malformed Finance and propagates unavailable Finance', async () => {
    const f = fixture();
    f.finance.getPendingDues.mockResolvedValue(null);
    await expect(
      f.service.inspect(tenant, session, registrationId, 'ExamCell'),
    ).rejects.toMatchObject({ status: 503 });
    f.finance.getPendingDues.mockRejectedValue(new Error('Finance offline'));
    await expect(
      f.service.inspect(tenant, session, registrationId, 'ExamCell'),
    ).rejects.toThrow('Finance offline');
  });
  it('reports rejected registration, incomplete approval and missing own seating', async () => {
    const f = fixture();
    f.registration.status = 'REJECTED';
    f.approval.coe_status = 'PENDING';
    f.seats.length = 0;
    const reasons = (
      await f.service.inspect(tenant, session, registrationId, 'ExamCell')
    ).block_reasons.join(' ');
    expect(reasons).toMatch(/Registration requires/);
    expect(reasons).toMatch(/final Hall Ticket approval/);
    expect(reasons).toMatch(/own seating/);
  });
  it.each([null, {}, [{ enrollments: [], unresolved_reasons: null }]])(
    'fails closed on a malformed official enrollment response %p',
    async (value) => {
      const f = fixture();
      f.enrollment.listExamRegistrationRoster.mockResolvedValue(value);
      await expect(
        f.service.inspect(tenant, session, registrationId, 'ExamCell'),
      ).rejects.toMatchObject({ status: 503 });
      expect(f.attendance.evaluate).not.toHaveBeenCalled();
      expect(f.finance.getPendingDues).not.toHaveBeenCalled();
    },
  );
  it.each([null, 0, -1])(
    'blocks an unverified subject allocation %p',
    async (subject) => {
      const f = fixture();
      f.enrollment.listExamRegistrationRoster.mockResolvedValue([
        {
          student_user_id: studentId,
          unresolved_reasons: [],
          enrollments: [
            { course_id: course, course_code: 'TEST-01', subject_id: subject },
          ],
        },
      ]);
      const result = await f.service.inspect(
        tenant,
        session,
        registrationId,
        'ExamCell',
      );
      expect(result.ready_to_issue).toBe(false);
      expect(result.block_reasons.join(' ')).toMatch(
        /allocations are missing or ambiguous/,
      );
      expect(f.attendance.evaluate).not.toHaveBeenCalled();
    },
  );
  it('blocks duplicate course/subject allocations instead of silently deduplicating clearance scope', async () => {
    const f = fixture();
    const record = { course_id: course, course_code: 'TEST-01', subject_id: 7 };
    f.enrollment.listExamRegistrationRoster.mockResolvedValue([
      {
        student_user_id: studentId,
        unresolved_reasons: [],
        enrollments: [record, record],
      },
    ]);
    const result = await f.service.inspect(
      tenant,
      session,
      registrationId,
      'ExamCell',
    );
    expect(result.block_reasons.join(' ')).toMatch(
      /allocations are missing or ambiguous/,
    );
    expect(f.attendance.evaluate).not.toHaveBeenCalled();
  });
});
