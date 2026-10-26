import { randomUUID } from 'node:crypto';
import { NotificationEvents } from '../../core/notifications/notification.events';
import type { ExamRegistrationRosterStudent } from '../academics/student-enrollment-sync.service';
import type { CreateExamScheduleDto } from './dto/exam-schedule.dto';
import { HallTicketTimetableService } from './hall-ticket-timetable.service';

describe('session-linked Hall Ticket timetable creation (mocked database)', () => {
  function fixture() {
    const tenant = randomUUID();
    const actor = randomUUID();
    const student = randomUUID();
    const session = {
      session_id: randomUUID(),
      academic_year: '2026-2027',
      program_label: 'BTECH CSE',
      semester: 4,
      status: 'OPEN',
    };
    const input: CreateExamScheduleDto = {
      session_id: session.session_id,
      exam_type: 'END_TERM',
      subject_id: 7,
      exam_date: '2026-11-05',
      start_time: '09:00',
      end_time: '12:00',
      venue: 'Hall A',
    };
    const roster: ExamRegistrationRosterStudent[] = [
      {
        student_user_id: student,
        student_name: 'Disposable test student',
        program_label: session.program_label,
        semester: 4,
        unresolved_reasons: [],
        enrollments: [
          {
            enrollment_id: randomUUID(),
            course_id: randomUUID(),
            course_code: 'QA-07',
            course_name: 'Test course',
            subject_id: 7,
            subject_code: 'QA-07',
            subject_name: 'Test subject',
          },
        ],
      },
    ];
    const conflicts: Array<{
      exam_schedule_id: string;
      session_id: string;
      exam_type: string;
      subject_id: number;
      start_time: string;
      end_time: string;
    }> = [];
    const subjectSlots: Array<{ exam_schedule_id: string }> = [];
    const persisted: Array<Record<string, unknown>> = [];
    const state = {
      sessionFound: true,
      actorFound: true,
      issued: false,
      venueKey: 'hall a' as unknown,
      committed: false,
      rolledBack: false,
    };
    const query = jest.fn((sql: string, params?: unknown[]): unknown[] => {
      if (sql.includes('FROM exam_sessions'))
        return state.sessionFound ? [session] : [];
      if (sql.includes('AS venue_key')) return [{ venue_key: state.venueKey }];
      if (sql.includes('pg_advisory_xact_lock')) return [];
      if (sql.includes('FROM users'))
        return state.actorFound ? [{ user_id: actor }] : [];
      if (sql.includes('FROM exam_admit_card_entries'))
        return state.issued ? [{ entry_id: randomUUID() }] : [];
      if (sql.includes('FROM exam_schedules'))
        return sql.includes('AND subject_id=$3') ? subjectSlots : conflicts;
      if (sql.includes('INSERT INTO exam_schedules')) {
        const row = {
          exam_schedule_id: randomUUID(),
          tenant_id: params?.[0],
          session_id: params?.[1],
          exam_type: params?.[2],
          subject_id: params?.[3],
          start_time: params?.[5],
          end_time: params?.[6],
        };
        persisted.push(row);
        return [row];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const manager = { query };
    const db = {
      query: jest.fn(),
      transaction: jest.fn(
        async (run: (value: typeof manager) => Promise<unknown>) => {
          const before = persisted.length;
          try {
            const result = await run(manager);
            state.committed = true;
            return result;
          } catch (error) {
            state.rolledBack = true;
            persisted.splice(before);
            throw error;
          }
        },
      ),
    };
    const enrollment = {
      listExamRegistrationRoster: jest.fn().mockResolvedValue(roster),
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const events = { emitAsync: jest.fn().mockResolvedValue([]) };
    const service = new HallTicketTimetableService(
      db as never,
      enrollment as never,
      audit as never,
      events as never,
    );
    const create = (dto = input, role: string | undefined = 'ExamCell') =>
      service.create(tenant, actor, role, dto);
    return {
      tenant,
      actor,
      student,
      session,
      input,
      roster,
      conflicts,
      subjectSlots,
      persisted,
      state,
      query,
      manager,
      db,
      enrollment,
      audit,
      events,
      service,
      create,
    };
  }

  it('persists an exact-session timetable and required audit with the same manager', async () => {
    const f = fixture();
    const result = await f.create();
    expect(result).toEqual(f.persisted);
    expect(f.enrollment.listExamRegistrationRoster).toHaveBeenCalledWith(
      f.tenant,
      { academic_year: '2026-2027', semester: 4, program_label: 'BTECH CSE' },
      f.manager,
    );
    expect(f.query.mock.calls[0]).toEqual([
      expect.stringContaining('FROM exam_sessions'),
      [f.tenant, f.session.session_id],
    ]);
    expect(f.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_schedules'),
      [
        f.tenant,
        f.session.session_id,
        'END_TERM',
        7,
        '2026-11-05',
        '09:00:00',
        '12:00:00',
        'Hall A',
        null,
        'SCHEDULED',
      ],
    );
    expect(f.audit.log).toHaveBeenCalledWith(
      f.tenant,
      f.actor,
      expect.objectContaining({ action: 'EXAM_TIMETABLE_CREATED' }),
      f.manager,
    );
    expect(f.db.query).not.toHaveBeenCalled();
  });

  it('retains the database max_marks default and treats batch text as metadata only', async () => {
    const f = fixture();
    f.input.batch_label = 'Arbitrary display label';
    await f.create();
    const [sql, params] = f.query.mock.calls.find(([statement]) =>
      statement.includes('INSERT INTO exam_schedules'),
    )!;
    expect(sql).not.toContain('max_marks');
    expect(params?.[1]).toBe(f.session.session_id);
    expect(params?.[8]).toBe('Arbitrary display label');
  });

  it('preserves explicitly configured positive max marks', async () => {
    const f = fixture();
    f.input.max_marks = 80;
    await f.create();
    const [sql, params] = f.query.mock.calls.find(([statement]) =>
      statement.includes('INSERT INTO exam_schedules'),
    )!;
    expect(sql).toContain('max_marks');
    expect(params?.[10]).toBe(80);
  });

  it.each(['DRAFT', 'OPEN', 'ACTIVE'])(
    'permits timetable preparation for a %s session',
    async (status) => {
      const f = fixture();
      f.session.status = status;
      await expect(f.create()).resolves.toHaveLength(1);
    },
  );

  it.each(['CLOSED', 'ARCHIVED'])(
    'rejects changes to a %s session',
    async (status) => {
      const f = fixture();
      f.session.status = status;
      await expect(f.create()).rejects.toMatchObject({ status: 400 });
      expect(f.persisted).toHaveLength(0);
      expect(f.audit.log).not.toHaveBeenCalled();
      expect(f.events.emitAsync).not.toHaveBeenCalled();
    },
  );

  it.each([
    'ExamOperator',
    'Student',
    'Faculty',
    'Accountant',
    'CampusAdmin',
    '',
  ])('rejects unauthorized role %s before querying', async (role) => {
    const f = fixture();
    await expect(f.create(f.input, role)).rejects.toMatchObject({
      status: 403,
    });
    expect(f.query).not.toHaveBeenCalled();
  });

  it.each(['ExamCell', 'DeputyCOE', 'ExamAdmin', 'SuperAdmin'])(
    'reuses existing manage_schedules permission for %s',
    async (role) => {
      const f = fixture();
      await expect(f.create(f.input, role)).resolves.toHaveLength(1);
    },
  );

  it.each(['', 'invalid', undefined])(
    'rejects tenant %p without a default tenant query',
    async (tenant) => {
      const f = fixture();
      await expect(
        f.service.create(tenant as never, f.actor, 'ExamCell', f.input),
      ).rejects.toMatchObject({ status: 403 });
      expect(f.query).not.toHaveBeenCalled();
    },
  );

  it('rejects a session outside the authenticated tenant', async () => {
    const f = fixture();
    f.state.sessionFound = false;
    await expect(f.create()).rejects.toMatchObject({ status: 404 });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM exam_sessions'),
      [f.tenant, f.input.session_id],
    );
    expect(f.persisted).toHaveLength(0);
  });

  it('rejects missing actor identity before querying', async () => {
    const f = fixture();
    await expect(
      f.service.create(f.tenant, '', 'ExamCell', f.input),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.query).not.toHaveBeenCalled();
  });

  it('rejects an inactive or wrong-tenant actor', async () => {
    const f = fixture();
    f.state.actorFound = false;
    await expect(f.create()).rejects.toMatchObject({ status: 403 });
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM users'),
      [f.tenant, f.actor],
    );
    expect(f.enrollment.listExamRegistrationRoster).not.toHaveBeenCalled();
  });

  it.each([
    { session_id: '' },
    { exam_date: '2026-02-30' },
    { exam_date: '2026-11-05T09:00:00Z' },
    { exam_type: 'VIVA' },
    { subject_id: 0 },
    { subject_id: 7.5 },
    { start_time: '24:00' },
    { start_time: '09:60' },
    { end_time: '09:00' },
    { end_time: '08:00:59' },
    { max_marks: 0 },
    { max_marks: -1 },
    { venue: ' ' },
    { venue: 'X'.repeat(121) },
    { batch_label: 'X'.repeat(81) },
    { tenant_id: 'client-supplied' },
  ])('rejects invalid timetable input %p before writing', async (change) => {
    const f = fixture();
    await expect(
      f.create({ ...f.input, ...change } as CreateExamScheduleDto),
    ).rejects.toMatchObject({ status: 400 });
    expect(f.persisted).toHaveLength(0);
    expect(f.query).not.toHaveBeenCalled();
  });

  it('refuses timetable changes once any ticket is officially issued for the session', async () => {
    const f = fixture();
    f.state.issued = true;
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
    expect(f.enrollment.listExamRegistrationRoster).not.toHaveBeenCalled();
    expect(f.persisted).toHaveLength(0);
  });

  it('fails safely if the official roster service is unavailable', async () => {
    const f = fixture();
    f.enrollment.listExamRegistrationRoster.mockRejectedValue(
      new Error('Roster unavailable'),
    );
    await expect(f.create()).rejects.toThrow('Roster unavailable');
    expect(f.persisted).toHaveLength(0);
    expect(f.events.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects a missing or malformed official roster', async () => {
    const f = fixture();
    f.enrollment.listExamRegistrationRoster.mockResolvedValue(null);
    await expect(f.create()).rejects.toMatchObject({ status: 503 });
    expect(f.persisted).toHaveLength(0);
  });

  it('rejects a subject without an exact session allocation rather than consulting an unscoped catalog', async () => {
    const f = fixture();
    f.roster[0].enrollments[0].subject_id = 8;
    await expect(f.create()).rejects.toMatchObject({ status: 400 });
    expect(f.persisted).toHaveLength(0);
  });

  it('rejects ambiguous subject allocations', async () => {
    const f = fixture();
    f.roster[0].enrollments.push({
      ...f.roster[0].enrollments[0],
      course_id: randomUUID(),
    });
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
    expect(f.persisted).toHaveLength(0);
  });

  it.each(['semester', 'programme', 'unresolved enrollment'])(
    'rejects a student with incorrect %s',
    async (kind) => {
      const f = fixture();
      if (kind === 'semester') f.roster[0].semester = 6;
      if (kind === 'programme') f.roster[0].program_label = 'OTHER';
      if (kind === 'unresolved enrollment')
        f.roster[0].unresolved_reasons.push('Missing official mapping');
      await expect(f.create()).rejects.toMatchObject({ status: 409 });
      expect(f.persisted).toHaveLength(0);
    },
  );

  it('uses a transaction advisory lock on tenant/date/normalized room before checking overlapping slots', async () => {
    const f = fixture();
    f.input.venue = '  HALL    A  ';
    await f.create();
    const advisory = f.query.mock.calls.findIndex(([sql]) =>
      sql.includes('pg_advisory_xact_lock'),
    );
    const conflict = f.query.mock.calls.findIndex(([sql]) =>
      sql.includes('start_time<$5::time'),
    );
    expect(advisory).toBeGreaterThan(0);
    expect(conflict).toBeGreaterThan(advisory);
    expect(f.query.mock.calls[advisory][1]).toEqual([
      `exam-timetable:${f.tenant}:2026-11-05:hall a`,
    ]);
    const [sql, params] = f.query.mock.calls[conflict];
    expect(sql).toContain('tenant_id=$1');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('start_time<$5::time AND end_time>$4::time');
    expect(sql).toContain('ORDER BY exam_schedule_id FOR UPDATE');
    expect(params).toEqual([
      f.tenant,
      '2026-11-05',
      'hall a',
      '09:00:00',
      '12:00:00',
    ]);
  });

  it('uses the database Unicode room identity unchanged for both locking and conflict checks', async () => {
    const f = fixture();
    f.input.venue = '\u0130\u2003 HALL \u03a9';
    f.state.venueKey = 'database-canonical-room';
    await f.create();
    expect(f.query).toHaveBeenCalledWith(
      "SELECT lower(regexp_replace(btrim($1::text),'[[:space:]]+',' ','g')) AS venue_key",
      [f.input.venue],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      [`exam-timetable:${f.tenant}:2026-11-05:database-canonical-room`],
    );
    expect(f.query).toHaveBeenCalledWith(
      expect.stringContaining('start_time<$5::time'),
      [
        f.tenant,
        '2026-11-05',
        'database-canonical-room',
        '09:00:00',
        '12:00:00',
      ],
    );
  });

  it.each([null, undefined, '', ' ', 7, {}])(
    'fails closed for an unavailable canonical room identity %p',
    async (value) => {
      const f = fixture();
      f.state.venueKey = value;
      await expect(f.create()).rejects.toMatchObject({ status: 503 });
      expect(f.persisted).toHaveLength(0);
      expect(
        f.query.mock.calls.some(([sql]) =>
          sql.includes('pg_advisory_xact_lock'),
        ),
      ).toBe(false);
      expect(f.audit.log).not.toHaveBeenCalled();
      expect(f.events.emitAsync).not.toHaveBeenCalled();
    },
  );

  it('rejects exact duplicate timetable rows', async () => {
    const f = fixture();
    f.subjectSlots.push({ exam_schedule_id: randomUUID() });
    await expect(f.create()).rejects.toThrow(
      'A timetable slot already exists for this session and subject',
    );
    expect(f.persisted).toHaveLength(0);
  });

  it('rejects another slot for the same subject even with a different room, time and exam type', async () => {
    const f = fixture();
    f.subjectSlots.push({ exam_schedule_id: randomUUID() });
    f.input.venue = 'A different room';
    f.input.start_time = '14:00';
    f.input.end_time = '16:00';
    f.input.exam_type = 'MID_TERM';
    await expect(f.create()).rejects.toMatchObject({ status: 409 });
    const [sql, params] = f.query.mock.calls.find(([statement]) =>
      statement.includes('AND subject_id=$3'),
    )!;
    expect(sql).toContain('tenant_id=$1 AND session_id=$2 AND subject_id=$3');
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).not.toContain('exam_type=');
    expect(sql).not.toContain('status=');
    expect(params).toEqual([
      f.tenant,
      f.session.session_id,
      f.input.subject_id,
    ]);
    expect(f.persisted).toHaveLength(0);
    expect(f.audit.log).not.toHaveBeenCalled();
    expect(f.events.emitAsync).not.toHaveBeenCalled();
  });

  it('rejects a room overlap with another session in the same tenant', async () => {
    const f = fixture();
    f.conflicts.push({
      exam_schedule_id: randomUUID(),
      session_id: randomUUID(),
      exam_type: 'MID_TERM',
      subject_id: 9,
      start_time: '10:00:00',
      end_time: '11:00:00',
    });
    await expect(f.create()).rejects.toThrow(
      'The examination room is already allocated during this time',
    );
    expect(f.persisted).toHaveLength(0);
    expect(f.audit.log).not.toHaveBeenCalled();
  });

  it('sends notifications only after commit and only to students with the selected official subject', async () => {
    const f = fixture();
    f.roster.push({
      ...f.roster[0],
      student_user_id: randomUUID(),
      enrollments: [{ ...f.roster[0].enrollments[0], subject_id: 8 }],
    });
    f.events.emitAsync.mockImplementation(() => {
      expect(f.state.committed).toBe(true);
      return Promise.resolve([]);
    });
    await f.create();
    expect(f.events.emitAsync).toHaveBeenCalledTimes(1);
    expect(f.events.emitAsync).toHaveBeenCalledWith(
      NotificationEvents.ACADEMICS_TIMETABLE_CHANGED,
      expect.objectContaining({
        tenantId: f.tenant,
        userId: f.student,
        courseName: 'QA-07 — Test subject',
      }),
    );
  });

  it('propagates required audit failure and never emits a success notification', async () => {
    const f = fixture();
    f.audit.log.mockRejectedValue(new Error('Required audit failed'));
    await expect(f.create()).rejects.toThrow('Required audit failed');
    expect(f.state.rolledBack).toBe(true);
    expect(f.state.committed).toBe(false);
    expect(f.persisted).toHaveLength(0);
    expect(f.events.emitAsync).not.toHaveBeenCalled();
  });

  it('does not pretend a post-commit notification failure rolled back the timetable', async () => {
    const f = fixture();
    f.events.emitAsync.mockRejectedValue(
      new Error('Notification service unavailable'),
    );
    await expect(f.create()).resolves.toHaveLength(1);
    expect(f.state.committed).toBe(true);
    expect(f.persisted).toHaveLength(1);
  });
});
