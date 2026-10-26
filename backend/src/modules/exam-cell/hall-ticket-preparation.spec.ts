import { HallTicketPreparationService } from './hall-ticket-preparation.service';

describe('session-linked Hall Ticket preparation (mocked database)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const actor = '33333333-3333-4333-8333-333333333333';
  const student = '44444444-4444-4444-8444-444444444444';
  const registrationId = '55555555-5555-4555-8555-555555555555';
  function fixture() {
    const session = {
      session_id: sessionId,
      tenant_id: tenant,
      status: 'OPEN',
      semester: 4,
      academic_year: '2026-2027',
      program_label: 'BTECH CSE',
    };
    const window = {
      window_id: 'window',
      semester: 4,
      program_label: 'BTECH CSE',
    };
    const registration = {
      registration_id: registrationId,
      window_id: 'window',
      student_user_id: student,
      session_id: sessionId,
      semester: 4,
      reviewed_by: actor,
      reviewed_at: new Date(),
    };
    const existing: Array<{
      approval_id: string;
      session_id: string;
      student_user_id: string;
      semester: number;
    }> = [];
    const registrations = [registration];
    const query = jest.fn((sql: string): unknown[] => {
      if (sql.includes('FROM exam_sessions')) return [session];
      if (sql.includes('FROM users')) return [{ user_id: actor }];
      if (sql.includes('FROM exam_form_windows')) return [window];
      if (sql.includes('FROM exam_semester_registrations'))
        return registrations;
      if (sql.includes('FROM hall_ticket_approvals')) return existing;
      if (sql.includes('INSERT INTO hall_ticket_approvals'))
        return [{ approval_id: 'approval' }];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const manager = { query };
    const db = {
      query,
      transaction: jest.fn(
        async (run: (value: typeof manager) => Promise<unknown>) =>
          run(manager),
      ),
    };
    const enrollment = {
      listExamRegistrationRoster: jest.fn().mockResolvedValue([
        {
          student_user_id: student,
          unresolved_reasons: [],
          enrollments: [{ subject_id: 7 }],
        },
      ]),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new HallTicketPreparationService(
      db as never,
      enrollment as never,
      audit as never,
    );
    return {
      session,
      window,
      registration,
      registrations,
      existing,
      query,
      manager,
      db,
      enrollment,
      audit,
      service,
    };
  }
  it('prepares pending stages without granting approval or changing the registration', async () => {
    const f = fixture();
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).resolves.toMatchObject({ synced: 1, total: 1, unchanged: 0 });
    expect(f.enrollment.listExamRegistrationRoster).toHaveBeenCalledWith(
      tenant,
      { academic_year: '2026-2027', semester: 4, program_label: 'BTECH CSE' },
      f.manager,
      student,
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "'ELIGIBILITY','PENDING','PENDING','PENDING','PENDING'",
      ),
      [tenant, student, 4, registrationId, sessionId],
    );
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(
      true,
    ); // row locks, not mutations
    expect(f.query.mock.calls.some(([sql]) => /^\s*UPDATE\b/.test(sql))).toBe(
      false,
    );
    expect(f.audit.log).toHaveBeenCalledWith(
      tenant,
      actor,
      expect.objectContaining({ action: 'HALL_TICKET_APPROVAL_PREPARED' }),
      f.manager,
    );
  });
  it.each([
    'ExamOperator',
    'Student',
    'Faculty',
    'Accountant',
    'CampusAdmin',
    undefined,
  ])('does not grant preparation authority to %s', async (role) => {
    const f = fixture();
    await expect(
      f.service.prepare(tenant, sessionId, actor, role),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(['', 'bad-tenant'])(
    'rejects invalid authenticated tenant %s before queries',
    async (value) => {
      const f = fixture();
      await expect(
        f.service.prepare(value, sessionId, actor, 'ExamCell'),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.query).not.toHaveBeenCalled();
    },
  );
  it('rejects missing session identity without a batch-label fallback', async () => {
    const f = fixture();
    await expect(
      f.service.prepare(tenant, '', actor, 'ExamCell'),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.query).not.toHaveBeenCalled();
  });
  it.each(['DRAFT', 'CLOSED', 'ARCHIVED'])(
    'does not prepare a %s session',
    async (status) => {
      const f = fixture();
      f.session.status = status;
      await expect(
        f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
      ).rejects.toMatchObject({ status: 400 });
      expect(f.audit.log).not.toHaveBeenCalled();
    },
  );
  it('preserves previously approved or rejected decisions without querying clearances or writing', async () => {
    const f = fixture();
    f.existing.push({
      approval_id: 'approval',
      session_id: sessionId,
      student_user_id: student,
      semester: 4,
    });
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).resolves.toMatchObject({ synced: 0, unchanged: 1 });
    expect(f.enrollment.listExamRegistrationRoster).not.toHaveBeenCalled();
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('rejects ambiguous approved registrations for one student/session', async () => {
    const f = fixture();
    f.registrations.push({ ...f.registration, registration_id: actor });
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('rejects a window/semester mismatch', async () => {
    const f = fixture();
    f.window.semester = 6;
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('propagates unavailable official roster without writing success', async () => {
    const f = fixture();
    f.enrollment.listExamRegistrationRoster.mockRejectedValue(
      new Error('Source offline'),
    );
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).rejects.toThrow('Source offline');
    expect(f.audit.log).not.toHaveBeenCalled();
  });
  it('requires an unambiguous subject allocation', async () => {
    const f = fixture();
    f.enrollment.listExamRegistrationRoster.mockResolvedValue([
      {
        student_user_id: student,
        unresolved_reasons: ['Ambiguous subject'],
        enrollments: [],
      },
    ]);
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('does not swallow required audit failure', async () => {
    const f = fixture();
    f.audit.log.mockRejectedValue(new Error('Audit failed'));
    await expect(
      f.service.prepare(tenant, sessionId, actor, 'ExamCell'),
    ).rejects.toThrow('Audit failed');
  });
  it('only advertises preparation, never approval or issuance', async () => {
    const f = fixture();
    await expect(
      f.service.availability(tenant, sessionId, 'ExamCell'),
    ).resolves.toMatchObject({
      can_sync: true,
      can_approve: false,
      can_issue: false,
    });
    await expect(
      f.service.availability(tenant, sessionId, 'ExamOperator'),
    ).resolves.toMatchObject({ can_sync: false });
  });
});
