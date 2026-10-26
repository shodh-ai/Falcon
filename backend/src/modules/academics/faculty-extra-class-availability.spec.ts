import { BadRequestException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const faculty = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const course = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const student = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const room = 'Main - 101';

function setup(options: { timetable?: unknown[]; changes?: unknown[]; exams?: unknown[]; calendar?: string | null; memberships?: unknown[]; missingRoom?: boolean } = {}) {
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('SELECT course_name FROM academic_courses')) return [{ course_name: 'Organic Chemistry' }];
    if (sql.includes('count(DISTINCT student_user_id)::int AS count FROM student_course_enrollments')) return [{ count: 1 }];
    if (sql.includes('FROM admin_academic_calendar_events')) return [];
    if (sql.includes('FROM academic_calendar_days')) return [{ kind_of_day: options.calendar === undefined ? 'ACADEMIC_DAY' : options.calendar }];
    if (sql.includes('FROM academic_timetables WHERE tenant_id')) return options.timetable ?? [];
    if (sql.includes('FROM class_adjustments WHERE tenant_id=$1 AND status')) return options.changes ?? [];
    if (sql.includes('SELECT source_timetable_id FROM academic_class_moves')) return [];
    if (sql.includes('SELECT course_id,student_user_id FROM student_course_enrollments')) return options.memberships ?? [{ course_id: course, student_user_id: student }];
    if (sql.includes('SELECT course_id,original_faculty_id,target_room FROM academic_class_moves')) return [];
    if (sql.includes('FROM exam_schedules x')) return options.exams ?? [];
    if (sql.includes('FROM academic_proxy_requests p') || sql.includes('FROM staff_leave_requests')) return [];
    if (sql.includes('SELECT capacity FROM campus_spaces')) return options.missingRoom ? [] : [{ capacity: 30 }];
    return [];
  });
  const dataSource = { query, transaction: jest.fn(async (fn: (db: { query: typeof query }) => Promise<unknown>) => fn({ query })) };
  const notify = { leaveApproved: jest.fn(), approvalRequired: jest.fn() };
  const service = new FacultyWorkspacesService(dataSource as never, notify as never, {} as never, {} as never);
  const check = () => (service as any).evaluateExtraClassSlot(dataSource,tenant,faculty,course,'2026-10-27','09:00',room);
  return { service, dataSource, notify, check };
}

describe('extra class availability', () => {
  it('releases a cancelled hour', async () => {
    const { check } = setup({
      timetable: [{ timetable_id: '11111111-1111-4111-8111-111111111111', course_id: course, faculty_user_id: faculty, room, start_time: '09:00', end_time: '10:00' }],
      changes: [{ adjustment_id: '22222222-2222-4222-8222-222222222222', adjustment_type: 'CANCEL', course_id: course, faculty_user_id: faculty, proposed_room: null }],
    });
    await expect(check()).resolves.toMatchObject({ status: 'AVAILABLE' });
  });
  it('blocks student overlaps across courses', async () => {
    const otherCourse = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const { check } = setup({
      timetable: [{ timetable_id: '11111111-1111-4111-8111-111111111111', course_id: otherCourse, faculty_user_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', room: 'Other - 202', start_time: '09:00', end_time: '10:00' }],
      memberships: [{ course_id: course, student_user_id: student }, { course_id: otherCourse, student_user_id: student }],
    });
    await expect(check()).resolves.toMatchObject({ status: 'CONFLICT', reasons: expect.arrayContaining(['Enrolled students have another class at this time']) });
  });
  it('never confirms missing calendar and room data', async () => {
    await expect(setup({ calendar: null, missingRoom: true }).check()).resolves.toMatchObject({ status: 'REQUIRES_REVIEW' });
  });
  it('blocks an affected student exam', async () => {
    await expect(setup({ exams: [{ exam_schedule_id: '1', affected_count: 1, seated_count: 1 }] }).check())
      .resolves.toMatchObject({ status: 'CONFLICT' });
  });
  it('rechecks at HOD approval and does not approve a newly occupied slot', async () => {
    const { service, dataSource, notify } = setup();
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('INNER JOIN users u ON u.user_id = a.faculty_user_id')) return [{ status: 'PENDING_HOD_APPROVAL', adjustment_type: 'EXTRA_CLASS', faculty_dept_id: 7, faculty_user_id: faculty }];
      if (sql.includes('SELECT dept_id FROM departments WHERE hod_user_id')) return [{ dept_id: 7 }];
      if (sql.includes('SELECT dept_id FROM users')) return [{ dept_id: 7 }];
      if (sql.includes('FOR UPDATE')) return [{ status: 'PENDING_HOD_APPROVAL', new_date: '2026-10-27T09:00', proposed_room: room, course_id: course, faculty_user_id: faculty }];
      return [];
    });
    jest.spyOn(service as any, 'evaluateExtraClassSlot').mockResolvedValue({ status: 'CONFLICT', reasons: ['Faculty already has a class at this time'], room });
    await expect(service.actOnClassAdjustment(faculty,tenant,'11111111-1111-4111-8111-111111111111','APPROVE'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query.mock.calls.some(([sql]) => String(sql).includes("SET status='APPROVED'"))).toBe(false);
    expect(notify.leaveApproved).not.toHaveBeenCalled();
  });
});
