import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicSessionChangesService } from './academic-session-changes.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECOND_SLOT = '22222222-2222-4222-8222-222222222222';
const COURSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STUDENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GROUP = '11111111-1111-4111-8111-111111111111';

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

  it.each(['RESCHEDULE', 'RESHUFFLE'] as const)('rejects new %s requests before touching the database', async (type) => {
    const { service, manager } = setup(basic);
    await expect(service.propose(OWNER, TENANT, type, [move, otherMove], 'Move'))
      .rejects.toThrow('Only an exact two-class swap');
    expect(manager.query).not.toHaveBeenCalled();
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
