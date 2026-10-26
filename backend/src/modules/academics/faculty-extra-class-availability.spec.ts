import { FacultyWorkspacesService } from './faculty-workspaces.service';

const tenant = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const faculty = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const hod = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const course = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const timetable = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const adjustment = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

const input = {
  course_id: course, adjustment_type: 'EXTRA_CLASS',
  timetable_id: timetable, session_date: '2026-10-27',
  start_time: '11:00', end_time: '12:00', room: 'R-2',
  reason: 'Make-up lecture',
};

function setup(approvedRosterHash = 'current-roster') {
  const row = {
    adjustment_id: adjustment,tenant_id: tenant,course_id: course,
    faculty_user_id: faculty,faculty_dept_id: 7,
    adjustment_type: 'EXTRA_CLASS',status: 'PENDING_HOD_APPROVAL',
    timetable_id: timetable,section: 'A',room: 'R-2',
    session_date: '2026-10-27',session_date_text: '2026-10-27',
    start_time: '11:00:00',end_time: '12:00:00',roster_hash: 'current-roster',
  };
  const query = jest.fn(async (sql: string): Promise<any[]> => {
    if (sql.includes('SELECT COUNT(*)::text AS count')) return [{ count: '0' }];
    if (sql.includes('FROM academic_timetables')) return [{ course_id: course,faculty_user_id: faculty,section: 'A',room: 'R-1' }];
    if (sql.includes('SELECT a.*, u.dept_id')) return [row];
    if (sql.includes('SELECT *,session_date::text AS session_date_text')) return [row];
    if (sql.includes('FROM departments WHERE hod_user_id')) return [{ dept_id: 7 }];
    if (sql.includes('SELECT dept_id FROM users')) return [{ dept_id: 7 }];
    if (sql.includes('SELECT user_id, tenant_id, name FROM users')) return [];
    if (sql.includes('SELECT * FROM class_adjustments WHERE adjustment_id')) return [row];
    if (sql.includes('INSERT INTO class_adjustments')) return [row];
    return [];
  });
  const dataSource = { query,transaction: jest.fn(async (work: (manager: { query: typeof query }) => Promise<unknown>) => work({ query })) };
  const availability = { assertExtraClassAvailable: jest.fn().mockResolvedValue(approvedRosterHash),
    studentsForClass: jest.fn().mockResolvedValue([faculty]) };
  const notify = { approvalRequired: jest.fn(),leaveApproved: jest.fn(),timetableChanged: jest.fn() };
  const service = new FacultyWorkspacesService(dataSource as never,notify as never,
    {} as never,{} as never,availability as never);
  (service as unknown as { assertFacultyOwnsCourse: jest.Mock }).assertFacultyOwnsCourse = jest.fn().mockResolvedValue(undefined);
  return { service,query,availability,notify };
}

describe('extra-class scheduling', () => {
  it('does not create an unscoped extra class without dated section and room data', async () => {
    const { service,query } = setup();
    await expect(service.createClassAdjustment(faculty,tenant,{
      course_id: course,adjustment_type: 'EXTRA_CLASS',new_date: '2026-10-27T11:00',
    })).rejects.toThrow('assigned section');
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO class_adjustments'))).toBe(false);
  });

  it('checks the actual assigned cohort before recording a pending extra class', async () => {
    const { service,query,availability } = setup();
    await expect(service.createClassAdjustment(faculty,tenant,input))
      .resolves.toMatchObject({ status: 'PENDING_HOD_APPROVAL' });
    expect(availability.assertExtraClassAvailable).toHaveBeenCalledWith(expect.anything(),tenant,
      expect.objectContaining({ course_id: course,section: 'A',room: 'R-2' }));
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO class_adjustments'))).toBe(true);
  });

  it('blocks HOD approval when the student roster changed after submission', async () => {
    const { service,query,notify } = setup('new-roster');
    await expect(service.actOnClassAdjustment(hod,tenant,adjustment,'APPROVE'))
      .rejects.toThrow('student group changed');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status='APPROVED'"))).toBe(false);
    expect(notify.leaveApproved).not.toHaveBeenCalled();
  });

  it('notifies affected students only after a successful approved extra class', async () => {
    const { service,query,notify } = setup();
    await service.actOnClassAdjustment(hod,tenant,adjustment,'APPROVE');
    expect(query.mock.calls.some(([sql]) => String(sql).includes("SET status='APPROVED'"))).toBe(true);
    expect(notify.timetableChanged).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: tenant,userId: faculty,actionLink: '/student/timetable',
    }));
  });
});
