import 'reflect-metadata';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { NotificationEvents } from '../../core/notifications/notification.events';
import { FinanceService } from '../finance/finance.service';
import { StudentEnrollmentSyncService } from '../academics/student-enrollment-sync.service';
import { AttendanceEligibilityService } from '../attendance-policy/attendance-eligibility.service';
import { ExamCellAuditService } from './exam-cell-audit.service';
import { ExamCellOperationsService } from './exam-cell-operations.service';
import { ExamCellEnterpriseService } from './exam-cell-enterprise.service';
import { HallTicketPreparationService } from './hall-ticket-preparation.service';
import { HallTicketReadinessService } from './hall-ticket-readiness.service';
import { HallTicketTimetableService } from './hall-ticket-timetable.service';
import type { CreateExamScheduleDto } from './dto/exam-schedule.dto';

/**
 * Real PostgreSQL registration tests. Opt-in, exact loopback database and marker
 * required before fixture writes. Only explicit additive hall-ticket migrations;
 * no application .env, automatic migrations, schema sync,
 * live notifications, or reset. Cleanup is limited to this suite's UUID tenants
 * and subjects. HTTP authentication is covered separately by boundary tests.
 */
const integration =
  process.env.FALCON_TEST_DB === '1' ? describe : describe.skip;
const marker = 'falcon-examcell-disposable-integration-20261021';
type Fixture = {
  tenant: string;
  actor: string;
  students: string[];
  course: string;
  session: string;
  subject?: number;
  window?: string;
};
type RegistrationRow = {
  registration_id: string;
  student_user_id: string;
  status: string;
  reviewed_by: string | null;
  eligibility_snapshot: {
    eligible: boolean;
    fee_clear: boolean;
    block_reasons: string[];
    enrollments: Array<{ course_id: string; subject_id: number | null }>;
  };
};

class FailingRegistrationAudit extends ExamCellAuditService {
  override async log(
    tenant: string,
    actor: string | undefined,
    payload: Parameters<ExamCellAuditService['log']>[2],
    manager?: EntityManager,
  ) {
    await super.log(tenant, actor, payload, manager);
    if (!manager)
      throw new Error('Registration audit must use the transaction manager');
    await manager.query('SELECT 1 / 0 AS registration_injected_audit_failure');
  }
}

integration('isolated PostgreSQL registration and clearance', () => {
  jest.setTimeout(30000);
  const run = randomUUID();
  const sources: DataSource[] = [];
  const fixtures: Fixture[] = [];
  let primary: DataSource;
  let competing: DataSource;
  let observer: DataSource;
  let studentRole: number;
  let officerRole: number;

  function finance(db = primary) {
    return new FinanceService(
      db.getRepository(FeeDemand),
      undefined as never,
      undefined as never,
      undefined as never,
    );
  }

  function service(
    db = primary,
    audit = new ExamCellAuditService(db),
    attendance = new AttendanceEligibilityService(db),
    fees = finance(db),
  ) {
    return new ExamCellOperationsService(
      db,
      attendance,
      fees,
      audit,
      undefined as never,
      undefined as never,
      new StudentEnrollmentSyncService(db),
    );
  }

  beforeAll(async () => {
    if (process.env.FALCON_RESET_DB === '1')
      throw new Error('Refusing reset-enabled environment');
    const supplied = process.env.TEST_DATABASE_URL;
    if (!supplied) throw new Error('Explicit TEST_DATABASE_URL is required');
    const url = new URL(supplied);
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      url.hostname !== '127.0.0.1' ||
      url.port !== '55432' ||
      url.pathname !== '/falcon_examcell_test' ||
      url.search ||
      url.hash
    ) {
      throw new Error('Refusing non-disposable PostgreSQL target');
    }
    async function connect(name: string) {
      const db = new DataSource({
        type: 'postgres',
        url: supplied,
        synchronize: false,
        migrationsRun: false,
        logging: false,
        entities: [FeeDemand],
        extra: {
          max: 4,
          application_name: `registration-it-${run}-${name}`,
          statement_timeout: 15000,
        },
      });
      sources.push(db);
      await db.initialize();
      return db;
    }
    observer = await connect('observer');
    const [identity] = await observer.query<
      Array<{ name: string; marker: string }>
    >(
      `SELECT current_database() AS name, shobj_description(oid, 'pg_database') AS marker FROM pg_database WHERE datname=current_database()`,
    );
    if (identity?.name !== 'falcon_examcell_test' || identity.marker !== marker)
      throw new Error(
        'Refusing database without disposable-test identity marker',
      );
    primary = await connect('primary');
    competing = await connect('competing');
    for (const file of [
      '20261023120000_hall_ticket_issued_document_links.sql',
      '20261023143000_hall_ticket_session_scope.sql',
      '20261023160000_hall_ticket_registration_queue.sql',
    ]) {
      await primary.transaction((manager) =>
        manager.query(
          readFileSync(resolve(__dirname, '../../../migrations', file), 'utf8'),
        ),
      );
    }
    const roles = await primary.query<
      Array<{ role_id: number; role_name: string }>
    >('SELECT role_id, role_name FROM roles WHERE role_name IN ($1,$2)', [
      'Student',
      'ExamCell',
    ]);
    studentRole =
      roles.find((r: { role_name: string }) => r.role_name === 'Student')
        ?.role_id ?? 0;
    officerRole =
      roles.find((r: { role_name: string }) => r.role_name === 'ExamCell')
        ?.role_id ?? 0;
    if (!studentRole || !officerRole)
      throw new Error('Existing role seed is required in isolated database');
  });

  afterAll(async () => {
    try {
      if (primary?.isInitialized)
        for (const f of fixtures.reverse()) {
          await primary.transaction(async (manager) => {
            // These tenants and subject IDs were inserted by this suite only.
            for (const table of [
              'exam_audit_logs',
              'hall_ticket_approvals',
              'exam_seating_allocations',
              'exam_schedules',
              'exam_semester_registrations',
              'exam_form_windows',
              'exam_sessions',
              'finance_fee_demands',
              'academic_course_allocations',
              'student_course_enrollments',
              'student_profiles',
              'academic_courses',
              'users',
            ]) {
              await manager.query(`DELETE FROM ${table} WHERE tenant_id=$1`, [
                f.tenant,
              ]);
            }
            if (f.subject !== undefined)
              await manager.query(
                'DELETE FROM academic_subjects WHERE subject_id=$1',
                [f.subject],
              );
            await manager.query('DELETE FROM tenants WHERE tenant_id=$1', [
              f.tenant,
            ]);
          });
        }
    } finally {
      for (const db of sources.reverse())
        if (db.isInitialized) await db.destroy();
    }
  });

  async function fixture(): Promise<Fixture> {
    const f: Fixture = {
      tenant: randomUUID(),
      actor: randomUUID(),
      students: [randomUUID(), randomUUID()].sort(),
      course: randomUUID(),
      session: randomUUID(),
    };
    fixtures.push(f);
    await primary.query(
      `INSERT INTO tenants(tenant_id,name,subdomain,pg_schema) VALUES($1,'Disposable registration QA',$2,'public')`,
      [f.tenant, `test-${f.tenant}`],
    );
    for (const id of [f.actor, ...f.students]) {
      await primary.query(
        `INSERT INTO users(user_id,tenant_id,name,official_email,role_id) VALUES($1,$2,'Disposable registration fixture',$3,$4)`,
        [
          id,
          f.tenant,
          `${id}@example.invalid`,
          id === f.actor ? officerRole : studentRole,
        ],
      );
    }
    await primary.query(
      `INSERT INTO academic_courses(course_id,tenant_id,course_code,course_name,credits) VALUES($1,$2,$3,'Disposable registration course',4)`,
      [f.course, f.tenant, `IT-${f.course}`],
    );
    const [subject] = await primary.query<Array<{ subject_id: number }>>(
      `INSERT INTO academic_subjects(subject_code,subject_name,program_id,semester) VALUES($1,'Disposable registration subject',1,4) RETURNING subject_id`,
      [`IT-${f.course.replaceAll('-', '').slice(0, 24)}`],
    );
    f.subject = subject.subject_id;
    await primary.query(
      `INSERT INTO academic_course_allocations(tenant_id,subject_id,course_id,program_name,semester,academic_year) VALUES($1,$2,$3,'BTECH CSE','IV','2026-2027')`,
      [f.tenant, f.subject, f.course],
    );
    for (const id of f.students) {
      await primary.query(
        `INSERT INTO student_profiles(tenant_id,user_id,batch,current_semester) VALUES($1,$2,'BTECH CSE',4)`,
        [f.tenant, id],
      );
      await primary.query(
        `INSERT INTO student_course_enrollments(tenant_id,student_user_id,course_id,semester,status,attendance_percent) VALUES($1,$2,$3,4,'ENROLLED',90)`,
        [f.tenant, id, f.course],
      );
    }
    await primary.query(
      `INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,cycle_type,semester,program_label,status,created_by) VALUES($1,$2,'2026-2027','Disposable registration exam','END_SEMESTER',4,'BTECH CSE','OPEN',$3)`,
      [f.session, f.tenant, f.actor],
    );
    const window = (await service().createFormWindow(f.tenant, f.actor, {
      title: 'Disposable registration window',
      session_id: f.session,
      semester: 4,
      program_label: 'BTECH CSE',
      opens_at: new Date(Date.now() - 86400000).toISOString(),
      closes_at: new Date(Date.now() + 86400000).toISOString(),
    })) as { window_id: string };
    f.window = window.window_id;
    await service().updateFormWindowStatus(f.tenant, f.window, f.actor, 'OPEN');
    return f;
  }

  function sync(f: Fixture, ops = service()) {
    return ops.seedRegistrationsFromSemester(f.tenant, f.window!, 4, f.actor);
  }

  function rows(f: Fixture) {
    return primary.query<RegistrationRow[]>(
      `SELECT * FROM exam_semester_registrations WHERE tenant_id=$1 ORDER BY student_user_id`,
      [f.tenant],
    );
  }

  async function waitForLocks(count: number) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      const [row] = await observer.query<Array<{ total: number }>>(
        `SELECT COUNT(*)::int AS total FROM pg_stat_activity WHERE application_name LIKE $1 AND wait_event_type='Lock'`,
        [`registration-it-${run}-%`],
      );
      if (Number(row.total) >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 30));
    }
    throw new Error(`Did not observe ${count} real PostgreSQL lock waiters`);
  }

  function preparation(db = primary, audit = new ExamCellAuditService(db)) {
    return new HallTicketPreparationService(
      db,
      new StudentEnrollmentSyncService(db),
      audit,
    );
  }

  function readiness() {
    return new HallTicketReadinessService(
      primary,
      new StudentEnrollmentSyncService(primary),
      new AttendanceEligibilityService(primary),
      finance(),
    );
  }

  function timetable(db = primary, audit = new ExamCellAuditService(db)) {
    // Actual PostgreSQL source services and a local event bus. No delivery to
    // real users, external notification service, or mock database/locks.
    const events = new EventEmitter2();
    const notifications: unknown[] = [];
    events.on(
      NotificationEvents.ACADEMICS_TIMETABLE_CHANGED,
      (payload: unknown) => {
        notifications.push(payload);
      },
    );
    return {
      events,
      notifications,
      service: new HallTicketTimetableService(
        db,
        new StudentEnrollmentSyncService(db),
        audit,
        events,
      ),
    };
  }

  function timetableInput(f: Fixture): CreateExamScheduleDto {
    return {
      session_id: f.session,
      exam_type: 'END_TERM',
      subject_id: f.subject!,
      exam_date: '2026-11-05',
      start_time: '09:00',
      end_time: '12:00',
      venue: 'Disposable Timetable Hall',
    };
  }

  it('persists an explicitly session-linked timetable and required audit before local notifications', async () => {
    const f = await fixture();
    const creator = timetable();
    const visibleCounts: number[] = [];
    const observeCommittedVisibility = async () => {
      const [visible] = await observer.query<Array<{ total: number }>>(
        'SELECT COUNT(*)::int AS total FROM exam_schedules WHERE tenant_id=$1 AND session_id=$2',
        [f.tenant, f.session],
      );
      visibleCounts.push(visible.total);
    };
    creator.events.on(
      NotificationEvents.ACADEMICS_TIMETABLE_CHANGED,
      // EventEmitter2 types on() listeners as void, but this service uses
      // emitAsync(), which preserves and awaits the returned Promise.
      observeCommittedVisibility as () => unknown,
    );
    const result = await creator.service.create(f.tenant, f.actor, 'ExamCell', {
      ...timetableInput(f),
      max_marks: 80,
      batch_label: 'Display metadata only',
    });
    expect(result).toHaveLength(1);
    const [stored] = await primary.query<Array<Record<string, unknown>>>(
      'SELECT * FROM exam_schedules WHERE tenant_id=$1 AND session_id=$2',
      [f.tenant, f.session],
    );
    expect(stored).toMatchObject({
      tenant_id: f.tenant,
      session_id: f.session,
      subject_id: f.subject,
      exam_type: 'END_TERM',
      start_time: '09:00:00',
      end_time: '12:00:00',
      venue: 'Disposable Timetable Hall',
      max_marks: 80,
      batch_label: 'Display metadata only',
      status: 'SCHEDULED',
    });
    expect(
      await primary.query(
        "SELECT actor_user_id,resource_id FROM exam_audit_logs WHERE tenant_id=$1 AND action='EXAM_TIMETABLE_CREATED'",
        [f.tenant],
      ),
    ).toEqual([
      { actor_user_id: f.actor, resource_id: stored.exam_schedule_id },
    ]);
    expect(visibleCounts).toEqual([1, 1]);
    expect(creator.notifications).toHaveLength(2);
    expect(creator.notifications).toEqual(
      expect.arrayContaining(
        f.students.map((student): unknown =>
          expect.objectContaining({
            tenantId: f.tenant,
            userId: student,
          }),
        ),
      ),
    );
  });

  it('rejects foreign tenant/session and subject relationships without timetable writes', async () => {
    const f = await fixture();
    const other = await fixture();
    const creator = timetable();
    await expect(
      creator.service.create(
        other.tenant,
        other.actor,
        'ExamCell',
        timetableInput(f),
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', {
        ...timetableInput(f),
        session_id: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', {
        ...timetableInput(f),
        subject_id: other.subject!,
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      await primary.query(
        'SELECT 1 FROM exam_schedules WHERE tenant_id=ANY($1::uuid[])',
        [[f.tenant, other.tenant]],
      ),
    ).toHaveLength(0);
    expect(creator.notifications).toHaveLength(0);
  });

  it('rejects duplicate and overlapping room slots while preserving the first timetable and its audit', async () => {
    const f = await fixture();
    const creator = timetable();
    await creator.service.create(
      f.tenant,
      f.actor,
      'ExamCell',
      timetableInput(f),
    );
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', timetableInput(f)),
    ).rejects.toMatchObject({ status: 409 });
    const overlappingSession = randomUUID();
    await primary.query(
      `INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,cycle_type,semester,program_label,status,created_by)
       SELECT $1,tenant_id,academic_year,'Disposable room-conflict session',cycle_type,semester,program_label,status,created_by
       FROM exam_sessions WHERE session_id=$2 AND tenant_id=$3`,
      [overlappingSession, f.session, f.tenant],
    );
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', {
        ...timetableInput(f),
        session_id: overlappingSession,
        start_time: '11:00',
        end_time: '13:00',
        venue: '  DISPOSABLE   TIMETABLE HALL ',
      }),
    ).rejects.toMatchObject({ status: 409 });
    const [schedule] = await primary.query<Array<{ max_marks: number }>>(
      'SELECT max_marks FROM exam_schedules WHERE tenant_id=$1',
      [f.tenant],
    );
    expect(schedule.max_marks).toBe(100); // Existing database default.
    expect(
      await primary.query('SELECT 1 FROM exam_schedules WHERE tenant_id=$1', [
        f.tenant,
      ]),
    ).toHaveLength(1);
    expect(
      await primary.query(
        "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='EXAM_TIMETABLE_CREATED'",
        [f.tenant],
      ),
    ).toHaveLength(1);
    expect(creator.notifications).toHaveLength(2);
  });

  it('rejects another slot for the same session subject across room, time and exam type without ignoring historical status', async () => {
    const f = await fixture();
    const creator = timetable();
    const [original] = await creator.service.create(
      f.tenant,
      f.actor,
      'ExamCell',
      timetableInput(f),
    );
    const differentSlot: CreateExamScheduleDto = {
      ...timetableInput(f),
      venue: 'Another disposable hall',
      start_time: '14:00',
      end_time: '16:00',
      exam_type: 'MID_TERM',
    };
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', differentSlot),
    ).rejects.toMatchObject({ status: 409 });
    // Only this test's fixture: a non-deleted historical slot is not silently
    // discarded to guess which examination should appear on a hall ticket.
    await primary.query(
      "UPDATE exam_schedules SET status='CANCELLED' WHERE tenant_id=$1 AND exam_schedule_id=$2",
      [f.tenant, original.exam_schedule_id],
    );
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', differentSlot),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await primary.query(
        'SELECT exam_schedule_id,status,exam_type FROM exam_schedules WHERE tenant_id=$1 AND session_id=$2',
        [f.tenant, f.session],
      ),
    ).toEqual([
      {
        exam_schedule_id: original.exam_schedule_id,
        status: 'CANCELLED',
        exam_type: 'END_TERM',
      },
    ]);
    expect(creator.notifications).toHaveLength(2);
    expect(
      await primary.query(
        "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='EXAM_TIMETABLE_CREATED'",
        [f.tenant],
      ),
    ).toHaveLength(1);
  });

  it('uses PostgreSQL Unicode normalization consistently when rejecting a room conflict across sessions', async () => {
    const f = await fixture();
    const creator = timetable();
    const venue = '\u0130\u2003  HALL \u03a9';
    const [canonical] = await observer.query<Array<{ venue_key: string }>>(
      "SELECT lower(regexp_replace(btrim($1::text),'[[:space:]]+',' ','g')) AS venue_key",
      [venue],
    );
    expect(typeof canonical.venue_key).toBe('string');
    expect(canonical.venue_key.length).toBeGreaterThan(0);
    const otherSession = randomUUID();
    await primary.query(
      `INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,cycle_type,semester,program_label,status,created_by)
       SELECT $1,tenant_id,academic_year,'Disposable Unicode room session',cycle_type,semester,program_label,status,created_by
       FROM exam_sessions WHERE session_id=$2 AND tenant_id=$3`,
      [otherSession, f.session, f.tenant],
    );
    await creator.service.create(f.tenant, f.actor, 'ExamCell', {
      ...timetableInput(f),
      venue,
    });
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', {
        ...timetableInput(f),
        session_id: otherSession,
        venue: canonical.venue_key,
      }),
    ).rejects.toMatchObject({
      status: 409,
      message: 'The examination room is already allocated during this time',
    });
    expect(
      await primary.query(
        'SELECT venue FROM exam_schedules WHERE tenant_id=$1',
        [f.tenant],
      ),
    ).toEqual([{ venue }]);
    expect(creator.notifications).toHaveLength(2);
  });

  it('rolls back timetable persistence and audit on a required PostgreSQL audit failure without notifications', async () => {
    const f = await fixture();
    const creator = timetable(primary, new FailingRegistrationAudit(primary));
    const before = await primary.query<unknown[]>(
      'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
      [f.tenant],
    );
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', timetableInput(f)),
    ).rejects.toMatchObject({ code: '22012' });
    expect(
      await primary.query('SELECT 1 FROM exam_schedules WHERE tenant_id=$1', [
        f.tenant,
      ]),
    ).toHaveLength(0);
    expect(
      await primary.query(
        'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
        [f.tenant],
      ),
    ).toEqual(before);
    expect(creator.notifications).toHaveLength(0);
  });

  it.each(['same session', 'different sessions'] as const)(
    'allows only one conflicting timetable create from independent PostgreSQL connections for %s',
    async (scope) => {
      const f = await fixture();
      const secondSession = scope === 'same session' ? f.session : randomUUID();
      if (scope === 'different sessions')
        await primary.query(
          `INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,cycle_type,semester,program_label,status,created_by)
           VALUES($1,$2,'2026-2027','Disposable competing timetable','END_SEMESTER',4,'BTECH CSE','OPEN',$3)`,
          [secondSession, f.tenant, f.actor],
        );
      const first = timetable(primary);
      const second = timetable(competing);
      const barrier = observer.createQueryRunner();
      await barrier.connect();
      await barrier.startTransaction();
      let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
      try {
        if (scope === 'same session')
          await barrier.query(
            'SELECT session_id FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
            [f.tenant, f.session],
          );
        else
          await barrier.query(
            'SELECT pg_advisory_xact_lock(hashtextextended($1,0))',
            [`exam-timetable:${f.tenant}:2026-11-05:disposable timetable hall`],
          );
        pending = Promise.allSettled([
          first.service.create(
            f.tenant,
            f.actor,
            'ExamCell',
            timetableInput(f),
          ),
          second.service.create(f.tenant, f.actor, 'ExamCell', {
            ...timetableInput(f),
            session_id: secondSession,
            venue: '  DISPOSABLE   TIMETABLE HALL  ',
          }),
        ]);
        await waitForLocks(2);
        await barrier.commitTransaction();
        const outcomes = await pending;
        expect(
          outcomes.filter((result) => result.status === 'fulfilled'),
        ).toHaveLength(1);
        const rejected = outcomes.find(
          (result): result is PromiseRejectedResult =>
            result.status === 'rejected',
        );
        expect(rejected).toBeDefined();
        const reason: unknown = rejected?.reason;
        expect(reason).toMatchObject({ status: 409 });
        expect(
          await primary.query(
            'SELECT 1 FROM exam_schedules WHERE tenant_id=$1',
            [f.tenant],
          ),
        ).toHaveLength(1);
        expect(
          await primary.query(
            "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='EXAM_TIMETABLE_CREATED'",
            [f.tenant],
          ),
        ).toHaveLength(1);
        expect(first.notifications.length + second.notifications.length).toBe(
          2,
        );
      } finally {
        if (barrier.isTransactionActive) await barrier.rollbackTransaction();
        await barrier.release();
        if (pending) await pending;
      }
    },
  );

  it('keeps a committed timetable and audit intact when a local post-commit notification listener fails', async () => {
    const f = await fixture();
    const creator = timetable();
    creator.events.on(NotificationEvents.ACADEMICS_TIMETABLE_CHANGED, () => {
      throw new Error('Injected local notification failure');
    });
    await expect(
      creator.service.create(f.tenant, f.actor, 'ExamCell', timetableInput(f)),
    ).resolves.toHaveLength(1);
    expect(
      await primary.query('SELECT 1 FROM exam_schedules WHERE tenant_id=$1', [
        f.tenant,
      ]),
    ).toHaveLength(1);
    expect(
      await primary.query(
        "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='EXAM_TIMETABLE_CREATED'",
        [f.tenant],
      ),
    ).toHaveLength(1);
  });

  it('diagnoses exact session timetable, own seating and missing final approval using real source services', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    const [registration] = await rows(f);
    const [slot] = await primary.query<Array<{ exam_schedule_id: string }>>(
      `INSERT INTO exam_schedules(tenant_id,session_id,subject_id,exam_type,exam_date,start_time,end_time,venue,status)
      VALUES($1,$2,$3,'END_TERM',CURRENT_DATE+1,'09:00','12:00','Fixture Hall','SCHEDULED') RETURNING exam_schedule_id`,
      [f.tenant, f.session, f.subject],
    );
    // Another student's seat must never satisfy the selected registration.
    await primary.query(
      "INSERT INTO exam_seating_allocations(tenant_id,exam_schedule_id,student_user_id,room,seat_number) VALUES($1,$2,$3,'Fixture Hall','A1')",
      [f.tenant, slot.exam_schedule_id, f.students[1]],
    );
    const first = await readiness().inspect(
      f.tenant,
      f.session,
      registration.registration_id,
      'ExamCell',
    );
    expect(first.block_reasons.join(' ')).toMatch(/own seating/);
    expect(first.block_reasons.join(' ')).toMatch(/final Hall Ticket approval/);
    expect(first.unresolved_requirements.join(' ')).toMatch(
      /internal assessment/,
    );
    expect(first.ready_to_issue).toBe(false);
    await primary.query(
      "INSERT INTO exam_seating_allocations(tenant_id,exam_schedule_id,student_user_id,room,seat_number) VALUES($1,$2,$3,'Fixture Hall','A2')",
      [f.tenant, slot.exam_schedule_id, f.students[0]],
    );
    const second = await readiness().inspect(
      f.tenant,
      f.session,
      registration.registration_id,
      'ExamCell',
    );
    expect(second.block_reasons.join(' ')).not.toMatch(
      /own seating|timetable slot/,
    );
    expect(second.ready_to_issue).toBe(false);
    await primary.query(
      'UPDATE exam_schedules SET session_id=NULL WHERE exam_schedule_id=$1 AND tenant_id=$2',
      [slot.exam_schedule_id, f.tenant],
    );
    expect(
      (
        await readiness().inspect(
          f.tenant,
          f.session,
          registration.registration_id,
          'ExamCell',
        )
      ).block_reasons.join(' '),
    ).toMatch(/timetable slot/);
  });

  it('diagnoses fresh strict attendance and tenant-scoped Finance failures without mutating approvals', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    const [registration] = await rows(f);
    await primary.query(
      'UPDATE student_course_enrollments SET attendance_percent=20 WHERE tenant_id=$1 AND student_user_id=$2',
      [f.tenant, f.students[0]],
    );
    await primary.query(
      "INSERT INTO finance_fee_demands(tenant_id,student_user_id,fee_head,academic_year,total_amount,paid_amount,due_date,status) VALUES($1,$2,'Readiness fixture','2026-2027',100,0,CURRENT_DATE,'PENDING')",
      [f.tenant, f.students[0]],
    );
    const before = await primary.query<unknown[]>(
      'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 ORDER BY approval_id',
      [f.tenant],
    );
    const audits = await primary.query<unknown[]>(
      'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
      [f.tenant],
    );
    const report = await readiness().inspect(
      f.tenant,
      f.session,
      registration.registration_id,
      'ExamCell',
    );
    expect(report.fee_clear).toBe(false);
    expect(report.attendance_percent).toBe(20);
    expect(report.block_reasons.join(' ')).toMatch(/Blocked: Shortfall.*20%/);
    expect(report.block_reasons).toContain('Pending fee dues');
    expect(
      await primary.query(
        'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 ORDER BY approval_id',
        [f.tenant],
      ),
    ).toEqual(before);
    expect(
      await primary.query(
        'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
        [f.tenant],
      ),
    ).toEqual(audits);
    const other = await fixture();
    await expect(
      readiness().inspect(
        other.tenant,
        f.session,
        registration.registration_id,
        'ExamCell',
      ),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      readiness().inspect(
        f.tenant,
        f.session,
        registration.registration_id,
        'Student',
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  async function approveRegistrations(f: Fixture) {
    await sync(f);
    for (const registration of await rows(f)) {
      await service().reviewRegistration(
        f.tenant,
        registration.registration_id,
        f.actor,
        'APPROVED',
      );
    }
  }

  it('prepares the real approved enrollment roster into pending Hall Ticket stages, idempotently', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    const before = await rows(f);
    expect(
      await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell'),
    ).toMatchObject({ synced: 2, total: 2 });
    const approvals = await primary.query<
      Array<{
        stage: string;
        eligibility_status: string;
        finance_status: string;
        exam_office_status: string;
        coe_status: string;
        registration_id: string;
        batch_label: string | null;
      }>
    >('SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1', [f.tenant]);
    expect(approvals).toHaveLength(2);
    for (const a of approvals) {
      expect(a).toMatchObject({
        stage: 'ELIGIBILITY',
        eligibility_status: 'PENDING',
        finance_status: 'PENDING',
        exam_office_status: 'PENDING',
        coe_status: 'PENDING',
        batch_label: null,
      });
      expect(
        before.map((r: { registration_id: string }) => r.registration_id),
      ).toContain(a.registration_id);
    }
    expect(
      await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell'),
    ).toMatchObject({ synced: 0, unchanged: 2 });
    expect(await rows(f)).toEqual(before);
    expect(
      await primary.query(
        "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='HALL_TICKET_APPROVAL_PREPARED'",
        [f.tenant],
      ),
    ).toHaveLength(2);
  });

  it('lists only the prepared tenant/session queue using the real enrollment_no schema and search contract', async () => {
    const f = await fixture();
    const other = await fixture();
    await approveRegistrations(f);
    await approveRegistrations(other);
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    await preparation().prepare(
      other.tenant,
      other.session,
      other.actor,
      'ExamCell',
    );
    for (const student of f.students)
      await primary.query(
        'UPDATE student_profiles SET enrollment_no=$3 WHERE tenant_id=$1 AND user_id=$2',
        [f.tenant, student, `HT-QA-${student}`],
      );
    const enterprise = new ExamCellEnterpriseService(
      primary,
      new AttendanceEligibilityService(primary),
      finance(),
      new ExamCellAuditService(primary),
      preparation(),
      readiness(),
    );
    const before = await primary.query<unknown[]>(
      'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
      [f.tenant],
    );
    const result = await enterprise.listHallTicketApprovals(
      f.tenant,
      { session_id: f.session, semester: 4 },
      'ExamCell',
    );
    expect(result.total).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(result.workflow).toMatchObject({
      can_approve: false,
      can_issue: false,
    });
    for (const approval of result.data) {
      expect(approval).toMatchObject({
        tenant_id: f.tenant,
        session_id: f.session,
        semester: 4,
        stage: 'ELIGIBILITY',
      });
      expect(f.students).toContain(approval.student_user_id);
      expect(approval.enrollment_number).toBe(
        `HT-QA-${String(approval.student_user_id)}`,
      );
    }
    const filtered = await enterprise.listHallTicketApprovals(
      f.tenant,
      { session_id: f.session, search: `HT-QA-${f.students[0]}` },
      'ExamCell',
    );
    expect(filtered.total).toBe(1);
    expect(filtered.data).toEqual([
      expect.objectContaining({ student_user_id: f.students[0] }),
    ]);
    await expect(
      enterprise.listHallTicketApprovals(
        other.tenant,
        { session_id: f.session },
        'ExamCell',
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(
      await primary.query(
        'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1 ORDER BY audit_id',
        [f.tenant],
      ),
    ).toEqual(before);
  });

  it('does not include pending registrations or another tenant/session', async () => {
    const f = await fixture();
    await sync(f);
    expect(
      await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell'),
    ).toMatchObject({ synced: 0, total: 0 });
    const other = await fixture();
    await expect(
      preparation().prepare(other.tenant, f.session, other.actor, 'ExamCell'),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      preparation().prepare(f.tenant, f.session, f.actor, 'ExamOperator'),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('preparation preserves approved/rejected decisions and does not relink legacy batch matches', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    const [first] = await primary.query<Array<{ approval_id: string }>>(
      'SELECT approval_id FROM hall_ticket_approvals WHERE tenant_id=$1 ORDER BY approval_id',
      [f.tenant],
    );
    await primary.query(
      "UPDATE hall_ticket_approvals SET stage=CASE WHEN approval_id=$2 THEN 'APPROVED' ELSE 'REJECTED' END, approved_at=clock_timestamp(),approved_by=$3 WHERE tenant_id=$1",
      [f.tenant, first.approval_id, f.actor],
    );
    await primary.query(
      "INSERT INTO hall_ticket_approvals(tenant_id,student_user_id,semester,batch_label) VALUES($1,$2,4,'Historical unlinked fixture')",
      [f.tenant, f.students[0]],
    );
    const before = await primary.query<unknown[]>(
      'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 ORDER BY approval_id',
      [f.tenant],
    );
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    expect(
      await primary.query(
        'SELECT * FROM hall_ticket_approvals WHERE tenant_id=$1 ORDER BY approval_id',
        [f.tenant],
      ),
    ).toEqual(before);
  });

  it('rolls back pending approval records and required audit writes together', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    await expect(
      preparation(primary, new FailingRegistrationAudit(primary)).prepare(
        f.tenant,
        f.session,
        f.actor,
        'ExamCell',
      ),
    ).rejects.toThrow();
    expect(
      await primary.query(
        'SELECT 1 FROM hall_ticket_approvals WHERE tenant_id=$1',
        [f.tenant],
      ),
    ).toHaveLength(0);
    expect(
      await primary.query(
        "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='HALL_TICKET_APPROVAL_PREPARED'",
        [f.tenant],
      ),
    ).toHaveLength(0);
    expect(
      (await rows(f)).every((r: { status: string }) => r.status === 'APPROVED'),
    ).toBe(true);
  });

  it('serializes simultaneous preparation through real session row locks', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    const barrier = observer.createQueryRunner();
    await barrier.connect();
    await barrier.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await barrier.query(
        'SELECT session_id FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [f.tenant, f.session],
      );
      pending = Promise.allSettled([
        preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell'),
        preparation(competing).prepare(
          f.tenant,
          f.session,
          f.actor,
          'ExamCell',
        ),
      ]);
      await waitForLocks(2);
      await barrier.commitTransaction();
      const results = await pending;
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(
        await primary.query(
          'SELECT 1 FROM hall_ticket_approvals WHERE tenant_id=$1',
          [f.tenant],
        ),
      ).toHaveLength(2);
      expect(
        await primary.query(
          "SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='HALL_TICKET_APPROVAL_PREPARED'",
          [f.tenant],
        ),
      ).toHaveLength(2);
    } finally {
      if (barrier.isTransactionActive) await barrier.rollbackTransaction();
      await barrier.release();
      if (pending) await pending;
    }
  });

  it('rechecks registration rejection after waiting for a real registration lock', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    const registrations = await rows(f);
    const writer = competing.createQueryRunner();
    await writer.connect();
    await writer.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await writer.query(
        "UPDATE exam_semester_registrations SET status='REJECTED' WHERE registration_id=$1 AND tenant_id=$2",
        [registrations[0].registration_id, f.tenant],
      );
      pending = Promise.allSettled([
        preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell'),
      ]);
      await waitForLocks(1);
      await writer.commitTransaction();
      expect((await pending)[0].status).toBe('fulfilled');
      const approvals = await primary.query<Array<{ student_user_id: string }>>(
        'SELECT student_user_id FROM hall_ticket_approvals WHERE tenant_id=$1',
        [f.tenant],
      );
      expect(approvals).toEqual([
        { student_user_id: registrations[1].student_user_id },
      ]);
    } finally {
      if (writer.isTransactionActive) await writer.rollbackTransaction();
      await writer.release();
      if (pending) await pending;
    }
  });

  it('uses the database registration unique key without prohibiting distinct sessions', async () => {
    const f = await fixture();
    await approveRegistrations(f);
    await preparation().prepare(f.tenant, f.session, f.actor, 'ExamCell');
    await expect(
      primary.query(
        `INSERT INTO hall_ticket_approvals(tenant_id,student_user_id,semester,registration_id,session_id)
      SELECT tenant_id,student_user_id,semester,registration_id,session_id FROM hall_ticket_approvals WHERE tenant_id=$1 LIMIT 1`,
        [f.tenant],
      ),
    ).rejects.toMatchObject({
      code: '23505',
      constraint: 'uq_hall_approval_registration',
    });
    const secondSession = randomUUID();
    const secondWindow = randomUUID();
    await primary.query(
      "INSERT INTO exam_sessions(session_id,tenant_id,academic_year,session_name,semester,program_label,status) VALUES($1,$2,'2026-2027','Another valid session',4,'BTECH CSE','OPEN')",
      [secondSession, f.tenant],
    );
    await primary.query(
      "INSERT INTO exam_form_windows(window_id,tenant_id,session_id,title,semester,program_label,opens_at,closes_at) VALUES($1,$2,$3,'Another window',4,'BTECH CSE',NOW(),NOW()+INTERVAL '1 day')",
      [secondWindow, f.tenant, secondSession],
    );
    await primary.query(
      "INSERT INTO exam_semester_registrations(tenant_id,window_id,student_user_id,session_id,semester,status,reviewed_by,reviewed_at) VALUES($1,$2,$3,$4,4,'APPROVED',$5,NOW())",
      [f.tenant, secondWindow, f.students[0], secondSession, f.actor],
    );
    expect(
      await preparation().prepare(f.tenant, secondSession, f.actor, 'ExamCell'),
    ).toMatchObject({ synced: 1 });
  });

  it('refuses historical linked duplicates without deleting or choosing records', async () => {
    // Transaction-local shadow table: never drop an existing public constraint.
    await expect(
      primary.transaction(async (manager) => {
        await manager.query(
          'CREATE TEMP TABLE hall_ticket_approvals(tenant_id uuid, registration_id uuid) ON COMMIT DROP',
        );
        await manager.query(
          'INSERT INTO hall_ticket_approvals VALUES($1,$2),($1,$2)',
          [randomUUID(), randomUUID()],
        );
        await manager.query(
          readFileSync(
            resolve(
              __dirname,
              '../../../migrations/20261023160000_hall_ticket_registration_queue.sql',
            ),
            'utf8',
          ),
        );
      }),
    ).rejects.toMatchObject({
      code: '23505',
      message:
        'Duplicate linked hall-ticket approvals require manual review before registration uniqueness',
    });
    expect(
      await primary.query(
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='uq_hall_approval_registration'",
      ),
    ).toHaveLength(1);
  });

  it('persists real enrollment/subject snapshots and freshly approved registrations with audits', async () => {
    const f = await fixture();
    expect(await sync(f)).toMatchObject({ created: 2, total_students: 2 });
    const registrations = await rows(f);
    expect(registrations).toHaveLength(2);
    expect(registrations[0]).toMatchObject({
      session_id: f.session,
      semester: 4,
      status: 'PENDING',
      eligibility_snapshot: {
        eligible: true,
        fee_clear: true,
        enrollments: [
          expect.objectContaining({
            course_id: f.course,
            subject_id: f.subject,
          }),
        ],
      },
    });
    await service().reviewRegistration(
      f.tenant,
      registrations[0].registration_id,
      f.actor,
      'APPROVED',
    );
    const [approved] = await rows(f);
    expect(approved.status).toBe('APPROVED');
    expect(approved.reviewed_by).toBe(f.actor);
    expect(
      await primary.query(
        `SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='REGISTRATION_APPROVED' AND resource_id=$2`,
        [f.tenant, approved.registration_id],
      ),
    ).toHaveLength(1);
  });

  it('records real attendance and fee exceptions, then refreshes after source correction', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE student_course_enrollments SET attendance_percent=20 WHERE tenant_id=$1 AND student_user_id=$2`,
      [f.tenant, f.students[0]],
    );
    await primary.query(
      `INSERT INTO finance_fee_demands(tenant_id,student_user_id,fee_head,academic_year,total_amount,paid_amount,due_date,status) VALUES($1,$2,'QA tuition','2026-2027',100,0,CURRENT_DATE,'PENDING')`,
      [f.tenant, f.students[1]],
    );
    await sync(f);
    const registrations = await rows(f);
    for (const row of registrations) {
      expect(row.eligibility_snapshot.eligible).toBe(false);
      expect(row.eligibility_snapshot.block_reasons.length).toBeGreaterThan(0);
      await expect(
        service().reviewRegistration(
          f.tenant,
          row.registration_id,
          f.actor,
          'APPROVED',
        ),
      ).rejects.toThrow();
    }
    await primary.query(
      `UPDATE student_course_enrollments SET attendance_percent=90 WHERE tenant_id=$1`,
      [f.tenant],
    );
    await primary.query(
      `UPDATE finance_fee_demands SET status='PAID',paid_amount=total_amount WHERE tenant_id=$1`,
      [f.tenant],
    );
    expect(await sync(f)).toMatchObject({ created: 0, refreshed: 2 });
    const refreshed = await rows(f);
    expect(
      refreshed.every(
        (row: { eligibility_snapshot: { eligible: boolean } }) =>
          row.eligibility_snapshot.eligible,
      ),
    ).toBe(true);
    await service().reviewRegistration(
      f.tenant,
      refreshed[0].registration_id,
      f.actor,
      'APPROVED',
    );
  });

  it('does not approve an old snapshot after current attendance or enrollment changes', async () => {
    const f = await fixture();
    await sync(f);
    const registrations = await rows(f);
    await primary.query(
      `UPDATE student_course_enrollments SET attendance_percent=10 WHERE tenant_id=$1 AND student_user_id=$2`,
      [f.tenant, f.students[0]],
    );
    await expect(
      service().reviewRegistration(
        f.tenant,
        registrations[0].registration_id,
        f.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
    await primary.query(
      `UPDATE student_course_enrollments SET status='COMPLETED' WHERE tenant_id=$1 AND student_user_id=$2`,
      [f.tenant, f.students[1]],
    );
    await expect(
      service().reviewRegistration(
        f.tenant,
        registrations[1].registration_id,
        f.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
    expect(
      (await rows(f)).every(
        (row: { status: string }) => row.status !== 'APPROVED',
      ),
    ).toBe(true);
  });

  it('rejects wrong semester and foreign tenant/window/session without registration writes', async () => {
    const f = await fixture();
    const other = await fixture();
    await expect(
      service().seedRegistrationsFromSemester(f.tenant, f.window!, 3, f.actor),
    ).rejects.toThrow();
    await expect(
      service().seedRegistrationsFromSemester(
        other.tenant,
        f.window!,
        4,
        other.actor,
      ),
    ).rejects.toThrow();
    await expect(
      service().createFormWindow(other.tenant, other.actor, {
        session_id: f.session,
        semester: 4,
        program_label: 'BTECH CSE',
        title: 'Cross tenant rejected',
        opens_at: new Date().toISOString(),
        closes_at: new Date(Date.now() + 86400000).toISOString(),
      }),
    ).rejects.toThrow();
    expect(await rows(f)).toHaveLength(0);
    expect(await rows(other)).toHaveLength(0);
    await sync(f);
    await expect(
      service().reviewRegistration(
        other.tenant,
        (await rows(f))[0].registration_id,
        other.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
  });

  it('keeps an unresolved subject mapping blocked instead of inventing a subject', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE academic_course_allocations SET academic_year='2025-2026' WHERE tenant_id=$1`,
      [f.tenant],
    );
    await sync(f);
    for (const row of await rows(f)) {
      expect(row.eligibility_snapshot.eligible).toBe(false);
      expect(row.eligibility_snapshot.enrollments[0].subject_id).toBeNull();
      expect(row.eligibility_snapshot.block_reasons.join(' ')).toMatch(
        /subject allocation/i,
      );
      await expect(
        service().reviewRegistration(
          f.tenant,
          row.registration_id,
          f.actor,
          'APPROVED',
        ),
      ).rejects.toThrow();
    }
  });

  it('preserves already approved and Registrar-owned registrations on repeated sync', async () => {
    const f = await fixture();
    await sync(f);
    const registrations = await rows(f);
    await service().reviewRegistration(
      f.tenant,
      registrations[0].registration_id,
      f.actor,
      'APPROVED',
    );
    await primary.query(
      `UPDATE exam_semester_registrations SET status='SUBMITTED',registrar_remarks='Disposable Registrar fixture' WHERE registration_id=$1 AND tenant_id=$2`,
      [registrations[1].registration_id, f.tenant],
    );
    const before = await rows(f);
    expect(await sync(f)).toMatchObject({ created: 0, refreshed: 0 });
    expect(await rows(f)).toEqual(before);
    await expect(
      service().reviewRegistration(
        f.tenant,
        registrations[1].registration_id,
        f.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
  });

  it('serializes two real concurrent syncs and preserves the database unique key', async () => {
    const f = await fixture();
    const barrier = observer.createQueryRunner();
    await barrier.connect();
    await barrier.startTransaction();
    let pending: Promise<PromiseSettledResult<unknown>[]> | undefined;
    try {
      await barrier.query(
        'SELECT session_id FROM exam_sessions WHERE tenant_id=$1 AND session_id=$2 FOR UPDATE',
        [f.tenant, f.session],
      );
      pending = Promise.allSettled([sync(f), sync(f, service(competing))]);
      await waitForLocks(2);
      await barrier.commitTransaction();
      const results = await pending;
      expect(results.every((r) => r.status === 'fulfilled')).toBe(true);
      const values = results
        .filter(
          (r): r is PromiseFulfilledResult<{ created: number }> =>
            r.status === 'fulfilled',
        )
        .map((r) => r.value);
      expect(values.reduce((sum, value) => sum + value.created, 0)).toBe(2);
      expect(await rows(f)).toHaveLength(2);
      expect(
        await primary.query(
          `SELECT student_user_id FROM exam_semester_registrations WHERE tenant_id=$1 GROUP BY window_id,student_user_id HAVING COUNT(*)>1`,
          [f.tenant],
        ),
      ).toHaveLength(0);
    } finally {
      if (barrier.isTransactionActive) await barrier.rollbackTransaction();
      await barrier.release();
      if (pending) await pending;
    }
  });

  it('rolls back registrations and required audit SQL together on a real database error', async () => {
    const f = await fixture();
    const before = await primary.query<unknown[]>(
      'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1',
      [f.tenant],
    );
    await expect(
      sync(f, service(primary, new FailingRegistrationAudit(primary))),
    ).rejects.toThrow();
    expect(await rows(f)).toHaveLength(0);
    expect(
      await primary.query(
        'SELECT audit_id FROM exam_audit_logs WHERE tenant_id=$1',
        [f.tenant],
      ),
    ).toEqual(before);
  });

  it('rolls back a review when its required audit SQL fails', async () => {
    const f = await fixture();
    await sync(f);
    const before = await rows(f);
    await expect(
      service(
        primary,
        new FailingRegistrationAudit(primary),
      ).reviewRegistration(
        f.tenant,
        before[0].registration_id,
        f.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
    expect(await rows(f)).toEqual(before);
    expect(
      await primary.query(
        `SELECT 1 FROM exam_audit_logs WHERE tenant_id=$1 AND action='REGISTRATION_APPROVED'`,
        [f.tenant],
      ),
    ).toHaveLength(0);
  });

  it('rolls back the whole batch when a later student clearance source fails', async () => {
    const f = await fixture();
    class FailingAttendance extends AttendanceEligibilityService {
      override async evaluate(
        tenant: string,
        student: string,
        options: Parameters<AttendanceEligibilityService['evaluate']>[2],
      ) {
        if (student === f.students[1]) {
          if (!options?.manager)
            throw new Error(
              'Strict clearance must use the transaction manager',
            );
          await options.manager.query(
            'SELECT 1 / 0 AS registration_injected_clearance_failure',
          );
        }
        return super.evaluate(tenant, student, options);
      }
    }
    await expect(
      sync(
        f,
        service(
          primary,
          new ExamCellAuditService(primary),
          new FailingAttendance(primary),
        ),
      ),
    ).rejects.toThrow();
    expect(await rows(f)).toHaveLength(0);
  });

  it('invalidates pending snapshots when the student leaves the active enrollment roster', async () => {
    const f = await fixture();
    await sync(f);
    await primary.query(
      `UPDATE student_course_enrollments SET status='COMPLETED' WHERE tenant_id=$1 AND student_user_id=$2`,
      [f.tenant, f.students[0]],
    );
    expect(await sync(f)).toMatchObject({
      created: 0,
      refreshed: 2,
      total_students: 1,
    });
    const [removed] = await rows(f);
    expect(removed.status).toBe('PENDING');
    expect(removed.eligibility_snapshot.eligible).toBe(false);
    expect(removed.eligibility_snapshot.enrollments).toEqual([]);
    expect(removed.eligibility_snapshot.block_reasons.join(' ')).toMatch(
      /no longer.*roster/i,
    );
  });

  it('does not confuse programmes sharing the same branch name or approve a wrong current semester', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE student_profiles SET batch='MTECH CSE' WHERE tenant_id=$1 AND user_id=$2`,
      [f.tenant, f.students[0]],
    );
    await primary.query(
      `UPDATE student_profiles SET current_semester=5 WHERE tenant_id=$1 AND user_id=$2`,
      [f.tenant, f.students[1]],
    );
    expect(await sync(f)).toMatchObject({ created: 1, total_students: 1 });
    const [wrongSemester] = await rows(f);
    expect(wrongSemester.student_user_id).toBe(f.students[1]);
    expect(wrongSemester.eligibility_snapshot.eligible).toBe(false);
    expect(wrongSemester.eligibility_snapshot.block_reasons.join(' ')).toMatch(
      /semester/i,
    );
    await expect(
      service().reviewRegistration(
        f.tenant,
        wrongSemester.registration_id,
        f.actor,
        'APPROVED',
      ),
    ).rejects.toThrow();
  });

  it('rejects expired windows and does not silently create registrations', async () => {
    const f = await fixture();
    await primary.query(
      `UPDATE exam_form_windows SET opens_at=NOW()-INTERVAL '2 days',closes_at=NOW()-INTERVAL '1 day' WHERE tenant_id=$1 AND window_id=$2`,
      [f.tenant, f.window],
    );
    await expect(sync(f)).rejects.toThrow();
    expect(await rows(f)).toHaveLength(0);
  });
});
