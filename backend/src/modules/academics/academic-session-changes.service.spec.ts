import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicSessionChangesService } from './academic-session-changes.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const COURSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const STUDENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const GROUP = '11111111-1111-4111-8111-111111111111';

const move = { timetable_id: SLOT, source_date: '2026-10-26', target_date: '2026-10-27',
  target_start_time: '11:00', target_end_time: '12:00', target_room: 'R-1' };
const slot = { timetable_id: SLOT, course_id: COURSE, faculty_user_id: OWNER,
  faculty_dept_id: 7, day_of_week: 1, start_time: '09:00:00', end_time: '10:00:00',
  room: 'R-1', section: 'A' };

function setup(respond: (sql: string) => unknown[]) {
  const manager = { query: jest.fn(async (sql: string) => respond(sql)) };
  const dataSource = {
    transaction: jest.fn(async (run: (db: typeof manager) => Promise<unknown>) => run(manager)),
    query: jest.fn(async (sql: string) => respond(sql)),
  };
  const notify = { approvalRequired: jest.fn(), timetableChanged: jest.fn() };
  return { service: new AcademicSessionChangesService(dataSource as never, notify as never),
    manager, dataSource, notify };
}

const basic = (sql: string): unknown[] => {
  if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7, role_name: 'Faculty' }];
  if (sql.includes('FROM academic_timetables t JOIN users u')) return [slot];
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
    await expect(service.propose(OWNER, TENANT, 'RESCHEDULE', [{ ...move, source_date: '2026-10-27' }], 'Room change'))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('fails closed on a faculty collision before inserting a move', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('FROM unnest')) return [{ ...slot, date: '2026-10-27',
        timetable_id: '22222222-2222-4222-8222-222222222222',
        start_time: '11:30:00', end_time: '12:30:00' }];
      return basic(sql);
    });
    await expect(service.propose(OWNER, TENANT, 'RESCHEDULE', [move], 'Room change'))
      .rejects.toThrow('Faculty timetable collision');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });

  it('rejects a student-group collision even with a different faculty and room', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('FROM unnest')) return [{ ...slot, date: '2026-10-27',
        timetable_id: '22222222-2222-4222-8222-222222222222',
        course_id: '33333333-3333-4333-8333-333333333333',
        faculty_user_id: '44444444-4444-4444-8444-444444444444',
        room: 'R-2', start_time: '11:30:00', end_time: '12:30:00' }];
      return basic(sql);
    });
    await expect(service.propose(OWNER, TENANT, 'RESCHEDULE', [move], 'Room change'))
      .rejects.toThrow('Student group has another class');
  });

  it('creates a pending dated move without altering the recurring timetable', async () => {
    const { service, manager } = setup(basic);
    const result = await service.propose(OWNER, TENANT, 'RESCHEDULE', [move], 'Room change');
    expect(result).toMatchObject({ status: 'PENDING_HOD_APPROVAL', legs: 1 });
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(true);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE academic_timetables'))).toBe(false);
  });

  it('rejects a swap that does not exchange exact dated class slots', async () => {
    const { service } = setup((sql) => {
      if (sql.includes('SELECT start_time,end_time,room FROM academic_timetables')) return [slot];
      return basic(sql);
    });
    await expect(service.propose(OWNER, TENANT, 'SWAP', [
      move, { ...move, timetable_id: '22222222-2222-4222-8222-222222222222', source_date: '2026-11-02' },
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
});
