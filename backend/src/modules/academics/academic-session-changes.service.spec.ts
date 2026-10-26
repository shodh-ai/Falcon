import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AcademicSessionChangesService } from './academic-session-changes.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECOND_SLOT = '22222222-2222-4222-8222-222222222222';
const COURSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STUDENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GROUP = '11111111-1111-4111-8111-111111111111';
const SPACE = '99999999-9999-4999-8999-999999999999';

const move = { timetable_id: SLOT, source_date: '2026-10-26', target_date: '2026-10-26',
  target_start_time: '11:00', target_end_time: '12:00', target_room: 'R-2' };
const otherMove = { timetable_id: SECOND_SLOT, source_date: '2026-10-26', target_date: '2026-10-26',
  target_start_time: '09:00', target_end_time: '10:00', target_room: 'R-1' };
const slot = { timetable_id: SLOT, course_id: COURSE, faculty_user_id: OWNER,
  faculty_dept_id: 7, day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00',
  room: 'R-1', section: 'A' };
const secondSlot = { ...slot, timetable_id: SECOND_SLOT, start_time: '11:00:00',
  end_time: '12:00:00', room: 'R-2' };

function setup(respond: (sql: string, params?: unknown[]) => unknown[]) {
  const manager = { query: jest.fn(async (sql: string, params?: unknown[]) => respond(sql, params)) };
  const dataSource = {
    transaction: jest.fn(async (run: (db: typeof manager) => Promise<unknown>) => run(manager)),
    query: jest.fn(async (sql: string, params?: unknown[]) => respond(sql, params)),
  };
  const notify = { approvalRequired: jest.fn(), timetableChanged: jest.fn() };
  return { service: new AcademicSessionChangesService(dataSource as never, notify as never),
    manager, dataSource, notify };
}

const basic = (sql: string, params?: unknown[]): unknown[] => {
  if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7, role_name: 'Faculty' }];
  if (sql.includes('FROM academic_timetables t JOIN users u') ||
      sql.includes('SELECT start_time,end_time,room FROM academic_timetables')) {
    return [params?.[1] === SECOND_SLOT ? secondSlot : slot];
  }
  if (sql.includes('FROM student_course_enrollments e')) return [{ student_user_id: STUDENT }];
  if (sql.includes('FROM academic_calendar_days')) return [{ kind_of_day: 'TEACHING_DAY' }];
  if (sql.includes('FROM campus_spaces')) return [{ space_id: SPACE, space_type: 'CLASSROOM',
    capacity: 40, status: 'AVAILABLE' }];
  if (sql.includes('SELECT course_code FROM academic_courses')) return [{ course_code: 'BP101T' }];
  return [];
};

describe('dated class changes', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-24T09:00:00Z'));
  });
  afterAll(() => jest.useRealTimers());
  it('rejects an original date that is not the class weekday', async () => {
    const { service } = setup(basic);
    await expect(service.propose(OWNER, TENANT, 'SWAP', [{ ...move, source_date: '2026-10-27' }, otherMove], 'Swap'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['RESCHEDULE', 'RESHUFFLE'] as const)('rejects an invalid %s group before touching the database', async (type) => {
    const { service, manager } = setup(basic);
    await expect(service.propose(OWNER, TENANT, type, [move, otherMove], 'Move'))
      .rejects.toThrow('Choose the affected class sessions');
    expect(manager.query).not.toHaveBeenCalled();
  });

  it('accepts one dated reschedule only after checking its mapped cohort and resources', async () => {
    const { service, manager } = setup(basic);
    await expect(service.propose(OWNER, TENANT, 'RESCHEDULE', [move], 'Move class'))
      .resolves.toMatchObject({ status: 'PENDING_HOD_APPROVAL', legs: 1 });
    const insert = manager.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'));
    expect(insert?.[0]).toContain('source_roster_hash');
    expect(insert?.[1]).toContain('09:00:00');
  });

  it('never labels a slot available when the academic calendar is missing', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM academic_calendar_days') ? [] : basic(sql, params));
    const result = await service.availability(OWNER, TENANT, {
      timetable_id: SLOT, source_date: move.source_date, target_date: move.target_date,
      target_room: 'R-2',
    });
    expect(result.slots.some((candidate) => candidate.status === 'AVAILABLE')).toBe(false);
    expect(result.slots.some((candidate) => candidate.status === 'REQUIRES_REVIEW')).toBe(true);
  });

  it('blocks a class that overlaps an affected student examination', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM exam_schedules es')
      ? [{ exam_schedule_id: GROUP, student_user_id: STUDENT }] : basic(sql, params));
    await expect(service.propose(OWNER, TENANT, 'RESCHEDULE', [move], 'Move'))
      .rejects.toThrow('Affected students have an examination');
  });

  it('marks extra-class slots for review when required calendar data is missing', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM academic_calendar_days')
      ? [] : basic(sql, params));
    const result = await service.extraAvailability(OWNER,TENANT,{
      timetable_id: SLOT, target_date: '2026-10-27', target_room: 'R-2',
      duration_minutes: 60,
    });
    expect(result.slots.some((candidate) => candidate.status === 'AVAILABLE')).toBe(false);
    expect(result.slots.some((candidate) => candidate.status === 'REQUIRES_REVIEW')).toBe(true);
  });

  it('blocks an extra class when the room capacity is below its actual cohort', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM campus_spaces')
      ? [{ space_id: SPACE,space_type: 'CLASSROOM',capacity: 0,status: 'AVAILABLE' }]
      : basic(sql, params));
    await expect(service.assertExtraClassAvailable({ query: jest.fn((sql, params) =>
      sql.includes('FROM campus_spaces')
        ? [{ space_id: SPACE,space_type: 'CLASSROOM',capacity: 0,status: 'AVAILABLE' }]
        : basic(sql, params)) } as never,TENANT,{
      source_timetable_id: SLOT,course_id: COURSE,section: 'A',faculty_user_id: OWNER,date: '2026-10-27',
      start_time: '11:00',end_time: '12:00',room: 'R-2',
    })).rejects.toThrow('room is too small');
  });

  it('does not offer a second attendance session for the same timetable on one date', async () => {
    const { service, manager } = setup((sql, params) =>
      sql.includes('SELECT 1 FROM academic_timetables t') && sql.includes('UNION ALL')
        ? [{ one: 1 }] : basic(sql, params));
    await expect(service.assertExtraClassAvailable(manager as never,TENANT,{
      source_timetable_id: SLOT,course_id: COURSE,section: 'A',faculty_user_id: OWNER,
      date: '2026-10-27',start_time: '11:00',end_time: '12:00',room: 'R-2',
    })).rejects.toThrow('already has a session on that date');
    expect(manager.query.mock.calls.some(([sql]) =>
      String(sql).includes('FROM academic_calendar_days'))).toBe(false);
  });

  it('treats an approved extra class as occupied for a later move', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM class_adjustments a')
      ? [{ timetable_id: GROUP,course_id: COURSE,faculty_user_id: OWNER,
        date: '2026-10-26',start_time: '11:00:00',end_time: '12:00:00',
        room: 'R-2',section: 'A' }]
      : basic(sql, params));
    await expect(service.propose(OWNER,TENANT,'RESCHEDULE',[move],'Move'))
      .rejects.toThrow('Faculty timetable collision');
  });

  it('fails closed on a faculty collision before inserting a move', async () => {
    const { service, manager } = setup((sql, params) => {
      if (sql.includes('FROM unnest')) return [{ ...slot, date: '2026-10-26',
        timetable_id: '33333333-3333-4333-8333-333333333333',
        start_time: '11:30:00', end_time: '12:30:00' }];
      return basic(sql, params);
    });
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('Faculty timetable collision');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });

  it('rejects a student-group collision even with a different faculty and room', async () => {
    const { service } = setup((sql, params) => {
      if (sql.includes('FROM unnest')) return [{ ...slot, date: '2026-10-26',
        timetable_id: '33333333-3333-4333-8333-333333333333',
        course_id: '44444444-4444-4444-8444-444444444444',
        faculty_user_id: '44444444-4444-4444-8444-444444444444',
        room: 'R-3', start_time: '11:30:00', end_time: '12:30:00' }];
      return basic(sql, params);
    });
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('Student group has another class');
  });

  it('rejects a move onto approved faculty leave', async () => {
    const { service } = setup((sql, params) => sql.includes('FROM staff_leave_requests')
      ? [{ one: 1 }] : basic(sql, params));
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('approved leave');
  });

  it('records both exact swap legs together without altering the recurring timetable', async () => {
    const { service, manager } = setup(basic);
    const result = await service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap');
    expect(result).toMatchObject({ status: 'PENDING_HOD_APPROVAL', legs: 2 });
    expect(manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toHaveLength(2);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE academic_timetables'))).toBe(false);
  });

  it('previews both swap legs together without saving or reserving either class', async () => {
    const { service,manager } = setup(basic);
    await expect(service.previewGroup(OWNER,TENANT,'SWAP',[move,otherMove]))
      .resolves.toMatchObject({ status: 'AVAILABLE' });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });

  it('does not call a group available when a student roster is missing', async () => {
    const { service } = setup((sql,params) => sql.includes('FROM student_course_enrollments e')
      ? [] : basic(sql,params));
    await expect(service.previewGroup(OWNER,TENANT,'SWAP',[move,otherMove]))
      .resolves.toMatchObject({ status: 'REQUIRES_REVIEW' });
  });

  it('rejects a swap that does not exchange exact dated class slots', async () => {
    const { service } = setup(basic);
    await expect(service.propose(OWNER, TENANT, 'SWAP', [
      move, { ...otherMove, target_start_time: '10:00' },
    ], 'Swap')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prevents a proposer from approving their own group', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7, role_name: 'HOD' }];
      if (sql.includes('FROM academic_class_moves m') && sql.includes('FOR UPDATE OF m')) return [{
        ...move, source_date_text: move.source_date, target_date_text: move.target_date,
        original_faculty_id: OWNER, faculty_dept_id: 7, section: 'A',
        requested_by_user_id: HOD, status: 'PENDING_HOD_APPROVAL', course_id: COURSE,
      }];
      return [];
    });
    await expect(service.decide(HOD, TENANT, GROUP, 'APPROVE'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects HOD approval after the source timetable changed without publishing', async () => {
    const { service, manager, notify } = setup((sql, params) => {
      if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7,role_name: 'HOD' }];
      if (sql.includes('FROM academic_class_moves m') && sql.includes('FOR UPDATE OF m')) return [{
        ...move,source_date_text: move.source_date,target_date_text: move.target_date,
        original_faculty_id: OWNER,faculty_dept_id: 7,section: 'A',
        source_section: 'A',source_start_time: '09:00:00',source_end_time: '10:00:00',
        source_room: 'R-1',source_roster_hash: 'snapshot',
        requested_by_user_id: OWNER,status: 'PENDING_HOD_APPROVAL',course_id: COURSE,
      }];
      if (sql.includes('FROM academic_timetables t WHERE')) return [{
        ...slot,start_time: '08:00:00',
      }];
      return basic(sql, params);
    });
    await expect(service.decide(HOD,TENANT,GROUP,'APPROVE'))
      .rejects.toThrow('source timetable changed');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE academic_class_moves'))).toBe(false);
    expect(notify.timetableChanged).not.toHaveBeenCalled();
  });

  it('rejects approval if substitute cover was requested after the move proposal', async () => {
    const rosterHash = createHash('sha256').update(STUDENT).digest('hex');
    const { service,manager } = setup((sql,params) => {
      if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7,role_name: 'HOD' }];
      if (sql.includes('FROM academic_class_moves m') && sql.includes('FOR UPDATE OF m')) return [{
        ...move,source_date_text: move.source_date,target_date_text: move.target_date,
        original_faculty_id: OWNER,faculty_dept_id: 7,section: 'A',
        source_section: 'A',source_start_time: '09:00:00',source_end_time: '10:00:00',
        source_room: 'R-1',source_roster_hash: rosterHash,
        requested_by_user_id: OWNER,status: 'PENDING_HOD_APPROVAL',course_id: COURSE,
      }];
      if (sql.includes('FROM academic_timetables t WHERE')) return [slot];
      if (sql.includes('SELECT 1 FROM academic_proxy_requests')) return [{ one: 1 }];
      return basic(sql,params);
    });
    await expect(service.decide(HOD,TENANT,GROUP,'APPROVE'))
      .rejects.toThrow('Substitute arrangement changed');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE academic_class_moves'))).toBe(false);
  });

  it('does not let a Dean propose changes in another school', async () => {
    const { service, manager } = setup((sql, params) => {
      if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 2, role_name: 'Dean' }];
      if (sql.includes('FROM departments d JOIN schools s')) return [];
      return basic(sql, params);
    });
    await expect(service.propose(HOD, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('only classes in their school');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });
});
