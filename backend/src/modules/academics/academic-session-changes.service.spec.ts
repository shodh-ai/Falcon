import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicSessionChangesService } from './academic-session-changes.service';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const HOD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SECOND_SLOT = '22222222-2222-4222-8222-222222222222';
const COURSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_COURSE = '44444444-4444-4444-8444-444444444444';
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
  if (sql.includes('SELECT course_id,academic_year,program_name,semester')) {
    return [{ course_id: COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI' }];
  }
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
  it('loads pending HOD changes without joining a nonexistent department tenant column', async () => {
    const { service, dataSource } = setup((sql) =>
      sql.includes('FROM users u JOIN roles r')
        ? [{ dept_id: 7, role_name: 'HOD' }] : []);
    await expect(service.listPendingForHod(HOD,TENANT)).resolves.toEqual([]);
    const sql = dataSource.query.mock.calls.find(([query]) =>
      String(query).includes('FROM academic_class_moves m'))?.[0];
    expect(sql).toContain('m.tenant_id=$1');
    expect(sql).toContain('d.dept_id=u.dept_id');
    expect(sql).not.toContain('d.tenant_id');
  });

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

  it('routes a same-cohort cross-faculty swap to the other faculty before HOD approval', async () => {
    const otherFaculty = '55555555-5555-4555-8555-555555555555';
    const { service, manager, notify } = setup((sql, params) => {
      if (sql.includes('FROM academic_timetables t JOIN users u') ||
          sql.includes('SELECT start_time,end_time,room FROM academic_timetables')) {
        return [params?.[1] === SECOND_SLOT ? { ...secondSlot, section: 'B', faculty_user_id: otherFaculty } : slot];
      }
      return basic(sql, params);
    });
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .resolves.toMatchObject({ status: 'PENDING_FACULTY_ACCEPTANCE', counterpart: otherFaculty });
    const inserts = manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'));
    expect(inserts).toHaveLength(2);
    expect(inserts.every(([, params]) => params?.[11] === 'PENDING_FACULTY_ACCEPTANCE')).toBe(true);
    expect(notify.approvalRequired).toHaveBeenCalledWith(expect.objectContaining({ userId: otherFaculty }));
  });

  it('offers another faculty class in the same programme and semester, including another section', async () => {
    const otherFaculty = '55555555-5555-4555-8555-555555555555';
    const { service } = setup((sql, params) => {
      if (sql.startsWith('SELECT dept_id FROM users')) return [{ dept_id: 7 }];
      if (sql.includes('FROM academic_timetables t JOIN users u')) return [slot];
      if (sql.includes('FROM academic_timetables t\n')) return [
        { ...secondSlot, section: 'B', course_id: OTHER_COURSE, faculty_user_id: otherFaculty,
          faculty_name: 'Faculty Two', course_code: 'CSY102', course_name: 'Another course' },
      ];
      if (sql.includes('SELECT course_id,academic_year,program_name,semester')) return [
        { course_id: COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI-A' },
        { course_id: OTHER_COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI-A' },
      ];
      return basic(sql, params);
    });
    await expect(service.swapCandidates(OWNER, TENANT, SLOT, '2026-10-26', '2026-10-26'))
      .resolves.toMatchObject({ candidates: [expect.objectContaining({
        course_code: 'CSY102', faculty_name: 'Faculty Two',
      })] });
  });

  it('rejects a swap between different semesters before creating either leg', async () => {
    const { service, manager } = setup((sql, params) => {
      if (sql.includes('SELECT course_id,academic_year,program_name,semester')) return [
        { course_id: COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI' },
        { course_id: OTHER_COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'III' },
      ];
      if (sql.includes('FROM academic_timetables t JOIN users u')) {
        return [params?.[1] === SECOND_SLOT ? { ...secondSlot, course_id: OTHER_COURSE } : slot];
      }
      return basic(sql, params);
    });
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('same programme and semester');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });

  it('only the other faculty can accept a pending cross-faculty swap', async () => {
    const otherFaculty = '55555555-5555-4555-8555-555555555555';
    const { service, manager, notify } = setup((sql, params) => {
      if (sql.includes('FROM academic_class_moves') && sql.includes('FOR UPDATE')) return [
        { status: 'PENDING_FACULTY_ACCEPTANCE', original_faculty_id: OWNER, requested_by_user_id: OWNER },
        { status: 'PENDING_FACULTY_ACCEPTANCE', original_faculty_id: otherFaculty, requested_by_user_id: OWNER },
      ];
      return basic(sql, params);
    });
    await expect(service.respondToSwap(OWNER, TENANT, GROUP, 'ACCEPT'))
      .rejects.toThrow('Only the other class faculty');
    await expect(service.respondToSwap(otherFaculty, TENANT, GROUP, 'ACCEPT'))
      .resolves.toMatchObject({ status: 'PENDING_HOD_APPROVAL' });
    expect(manager.query.mock.calls.some(([sql, params]) => String(sql).includes('UPDATE academic_class_moves') &&
      params?.[2] === 'PENDING_HOD_APPROVAL')).toBe(true);
    expect(manager.query.mock.calls.some(([sql, params]) =>
      String(sql).includes('counterpart_responded_by_user_id') && params?.[4] === 'ACCEPT')).toBe(true);
    expect(notify.timetableChanged).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER }));
  });

  it('exchanges a room-assigned Wednesday class with a roomless Thursday class', async () => {
    const first = { ...slot, day_of_week: 3, start_time: '11:00:00',
      end_time: '12:00:00', room: 'QA-ROOM-1' };
    const second = { ...secondSlot, day_of_week: 4, start_time: '09:00:00',
      end_time: '10:00:00', room: null };
    const { service, manager } = setup((sql, params) => {
      if (sql.includes('FROM academic_timetables t JOIN users u') ||
          sql.includes('SELECT start_time,end_time,room FROM academic_timetables')) {
        return [params?.[1] === SECOND_SLOT ? second : first];
      }
      return basic(sql, params);
    });
    const result = await service.propose(OWNER, TENANT, 'SWAP', [
      { timetable_id: SLOT, source_date: '2026-10-28', target_date: '2026-10-29',
        target_start_time: '09:00:00', target_end_time: '10:00:00', target_room: null },
      { timetable_id: SECOND_SLOT, source_date: '2026-10-29', target_date: '2026-10-28',
        target_start_time: '11:00:00', target_end_time: '12:00:00', target_room: 'QA-ROOM-1' },
    ], 'Exchange the two dated sessions');
    expect(result).toMatchObject({ status: 'PENDING_HOD_APPROVAL', legs: 2 });
    const inserts = manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'));
    expect(inserts).toHaveLength(2);
    expect(inserts.map(([, params]) => params?.[9])).toEqual([null, 'QA-ROOM-1']);
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('UPDATE academic_timetables'))).toBe(false);
  });

  const unmappedOverlap = {
    ...slot, timetable_id: '33333333-3333-4333-8333-333333333333',
    course_id: OTHER_COURSE, course_code: 'BP102T',
    faculty_user_id: '55555555-5555-4555-8555-555555555555',
    date: '2026-10-26', room: 'OTHER-ROOM',
  };
  const withUnmappedOverlap = (allocation: string | null, activity = false) =>
    setup((sql, params) => {
      if (sql.includes('FROM unnest')) return [unmappedOverlap];
      if (sql.includes('SELECT course_id,academic_year,program_name,semester')) {
        return [
          { course_id: COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI' },
          ...(allocation ? [{ course_id: OTHER_COURSE, academic_year: '2026-2027',
            program_name: allocation, semester: allocation === 'B.Pharm' ? 'I' : 'VI' }] : []),
        ];
      }
      if (sql.includes('FROM student_course_enrollments e') && params?.[1] === OTHER_COURSE) return [];
      if (sql.includes('AS has_enrollment') && sql.includes('AS has_attendance')) {
        return [{ has_enrollment: false, has_attendance: activity }];
      }
      return basic(sql, params);
    });

  it('does not block an exact swap on a different programme with no mapped roster', async () => {
    const { service, manager } = withUnmappedOverlap('B.Pharm');
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .resolves.toMatchObject({ status: 'PENDING_HOD_APPROVAL', legs: 2 });
    expect(manager.query.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toHaveLength(2);
  });

  it('rejects an unmapped overlapping class in the same programme and semester', async () => {
    const { service, manager } = withUnmappedOverlap('BTECH-CSE');
    await expect(service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('Cannot verify student groups for overlapping BP102T');
    expect(manager.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO academic_class_moves'))).toBe(false);
  });

  it('ignores a rosterless unallocated timetable only if it has no enrollment or attendance', async () => {
    const empty = withUnmappedOverlap(null);
    await expect(empty.service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .resolves.toMatchObject({ status: 'PENDING_HOD_APPROVAL' });
    const active = withUnmappedOverlap(null, true);
    await expect(active.service.propose(OWNER, TENANT, 'SWAP', [move, otherMove], 'Swap'))
      .rejects.toThrow('Cannot verify student groups for overlapping BP102T');
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

  it('blocks HOD approval if a course allocation changed to another semester after the request', async () => {
    const { service, manager } = setup((sql) => {
      if (sql.includes('FROM users u JOIN roles r')) return [{ dept_id: 7, role_name: 'HOD' }];
      if (sql.includes('FROM academic_class_moves m') && sql.includes('FOR UPDATE OF m')) return [
        { ...move, timetable_id: SLOT, course_id: COURSE, original_faculty_id: OWNER,
          faculty_dept_id: 7, section: 'A', requested_by_user_id: OWNER,
          status: 'PENDING_HOD_APPROVAL', source_date_text: move.source_date,
          target_date_text: move.target_date },
        { ...otherMove, timetable_id: SECOND_SLOT, course_id: OTHER_COURSE,
          original_faculty_id: '55555555-5555-4555-8555-555555555555',
          faculty_dept_id: 7, section: 'B', requested_by_user_id: OWNER,
          status: 'PENDING_HOD_APPROVAL', source_date_text: otherMove.source_date,
          target_date_text: otherMove.target_date },
      ];
      if (sql.includes('SELECT course_id,academic_year,program_name,semester')) return [
        { course_id: COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'VI' },
        { course_id: OTHER_COURSE, academic_year: '2026-2027', program_name: 'BTECH-CSE', semester: 'V' },
      ];
      return [];
    });
    await expect(service.decide(HOD, TENANT, GROUP, 'APPROVE'))
      .rejects.toThrow('no longer have the same programme and semester');
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
