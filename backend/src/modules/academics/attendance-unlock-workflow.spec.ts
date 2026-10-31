jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicsFacultyService } from './academics-faculty.service';

const requestId = '11111111-1111-4111-8111-111111111111';

function setup(actorDept = 7, facultyDept = 7) {
  const query = jest.fn((sql: string): Record<string, unknown>[] => {
    if (sql.includes('SELECT u.dept_id,r.role_name'))
      return [{ dept_id: actorDept, role_name: 'HOD' }];
    if (sql.includes('FROM academic_attendance_unlock_requests r'))
      return [
        {
          request_id: requestId,
          faculty_user_id: 'faculty-1',
          faculty_dept_id: facultyDept,
          course_code: 'DA101',
          course_id: 'course-1',
          timetable_id: '22222222-2222-4222-8222-222222222222',
          class_adjustment_id: null,
          class_date: '2026-10-20',
          status: 'PENDING',
        },
      ];
    if (sql.includes('FROM course_attendance_logs')) return [];
    if (sql.includes('FROM academic_timetables t'))
      return [{ timetable_id: '22222222-2222-4222-8222-222222222222' }];
    if (
      sql.includes('INSERT INTO academic_attendance_unlock_requests') &&
      sql.includes('RETURNING request_id,status')
    ) {
      return [{ request_id: requestId, status: 'PENDING' }];
    }
    if (sql.includes('UPDATE academic_attendance_unlock_requests')) {
      return [{ unlocked_until: new Date('2026-10-30T12:00:00.000Z') }];
    }
    return [];
  });
  const manager = {
    query,
  };
  const dataSource = {
    transaction: jest.fn(
      async (work: (tx: typeof manager) => Promise<unknown>) => work(manager),
    ),
    query: jest.fn().mockResolvedValue([]),
  };
  const notifications = { create: jest.fn().mockResolvedValue({}) };
  const service = new AcademicsFacultyService(
    dataSource as never,
    {} as never,
    { findOne: jest.fn().mockResolvedValue({ timetable_id: 'slot' }) } as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    notifications as never,
  );
  return { service, manager, dataSource, notifications };
}

describe('Attendance unlock approval workflow', () => {
  it('lists HOD requests using the canonical users email column', async () => {
    const { service, dataSource } = setup();
    dataSource.query
      .mockResolvedValueOnce([{ dept_id: 7, role_name: 'HOD' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.listHodAttendanceUnlockRequests('hod-1', 'tenant-1'),
    ).resolves.toEqual([]);

    const calls = dataSource.query.mock.calls as unknown as Array<
      [string, ...unknown[]]
    >;
    const listSql = calls[1]?.[0] ?? '';
    expect(listSql).toContain('f.official_email AS faculty_email');
    expect(listSql).not.toMatch(/\bf\.email\b/);
  });

  it('lets faculty request one exact locked session and records the request audit event', async () => {
    const { service, manager } = setup();
    const result = await service.requestAttendanceUnlock(
      'faculty-1',
      'tenant-1',
      {
        course_id: 'course-1',
        date: '2026-10-20',
        timetable_id: '22222222-2222-4222-8222-222222222222',
        reason: 'Network failure during the normal attendance window',
      },
    );
    expect(result).toEqual({
      request_id: requestId,
      status: 'PENDING',
      created: true,
    });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('class_date,event_type,actor_user_id,details'),
      expect.arrayContaining(['tenant-1', requestId, 'faculty-1', 'course-1']),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("status='APPROVED' AND unlocked_until>NOW()"),
      expect.any(Array),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('EXTRACT(ISODOW FROM $4::date)=t.day_of_week'),
      expect.arrayContaining([
        'tenant-1',
        '22222222-2222-4222-8222-222222222222',
        'course-1',
        '2026-10-20',
        'faculty-1',
      ]),
    );
  });

  it('does not create an unlock request for a date where the slot is not scheduled', async () => {
    const { service, manager } = setup();
    const baseQuery = manager.query.getMockImplementation()!;
    manager.query.mockImplementation((sql: string) => {
      if (
        sql.includes('SELECT t.timetable_id FROM academic_timetables t') &&
        sql.includes('EXTRACT(ISODOW FROM $4::date)=t.day_of_week')
      ) {
        return [];
      }
      return baseQuery(sql);
    });

    await expect(
      service.requestAttendanceUnlock('faculty-1', 'tenant-1', {
        course_id: 'course-1',
        date: '2026-10-20',
        timetable_id: '22222222-2222-4222-8222-222222222222',
        reason: 'Network failure during the normal attendance window',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO academic_attendance_unlock_requests',
      ),
      expect.any(Array),
    );
  });

  it('lets the scoped HOD open one expiring window and notifies the faculty member', async () => {
    const { service, manager, notifications } = setup();
    const result = await service.decideAttendanceUnlock(
      'hod-1',
      'tenant-1',
      requestId,
      'APPROVE',
      'Verified missed class',
    );
    expect(result).toMatchObject({ status: 'APPROVED', request_id: requestId });
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "unlocked_until=CASE WHEN $3::varchar='APPROVED'",
      ),
      expect.arrayContaining(['tenant-1', requestId, 'APPROVED', 'hod-1']),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('m.move_id IS NULL OR NOT'),
      expect.arrayContaining([
        'tenant-1',
        '22222222-2222-4222-8222-222222222222',
        'course-1',
        '2026-10-20',
      ]),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'faculty-1',
        title: 'Attendance marking temporarily unlocked',
        actionLink: '/faculty/attendance',
        intent: 'action_required',
      }),
    );
  });

  it('rejects an HOD decision for faculty outside their department', async () => {
    const { service, notifications } = setup(7, 9);
    await expect(
      service.decideAttendanceUnlock('hod-1', 'tenant-1', requestId, 'APPROVE'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('keeps a rejected request locked and notifies the faculty member', async () => {
    const { service, manager, notifications } = setup();
    const result = await service.decideAttendanceUnlock(
      'hod-1',
      'tenant-1',
      requestId,
      'REJECT',
      'Reason is not supported by the class record',
    );
    expect(result.status).toBe('REJECTED');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "unlocked_until=CASE WHEN $3::varchar='APPROVED'",
      ),
      expect.arrayContaining(['tenant-1', requestId, 'REJECTED', 'hod-1']),
    );
    expect(notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'faculty-1',
        title: 'Attendance unlock request rejected',
      }),
    );
  });

  it('refuses a stale approval after attendance has already been submitted', async () => {
    const { service, manager, notifications } = setup();
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.dept_id,r.role_name'))
        return [{ dept_id: 7, role_name: 'HOD' }];
      if (sql.includes('FROM academic_attendance_unlock_requests r'))
        return [
          {
            request_id: requestId,
            faculty_user_id: 'faculty-1',
            faculty_dept_id: 7,
            course_id: 'course-1',
            timetable_id: '22222222-2222-4222-8222-222222222222',
            class_adjustment_id: null,
            course_code: 'DA101',
            class_date: '2026-10-20',
            status: 'PENDING',
          },
        ];
      if (sql.includes('FROM course_attendance_logs'))
        return [{ log_id: 'log-1' }];
      return [];
    });
    await expect(
      service.decideAttendanceUnlock('hod-1', 'tenant-1', requestId, 'APPROVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.create).not.toHaveBeenCalled();
  });

  it('refuses a stale approval after the regular class is cancelled', async () => {
    const { service, manager, notifications } = setup();
    manager.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.dept_id,r.role_name'))
        return [{ dept_id: 7, role_name: 'HOD' }];
      if (sql.includes('FROM academic_attendance_unlock_requests r'))
        return [
          {
            request_id: requestId,
            faculty_user_id: 'faculty-1',
            faculty_dept_id: 7,
            course_id: 'course-1',
            timetable_id: '22222222-2222-4222-8222-222222222222',
            class_adjustment_id: null,
            course_code: 'DA101',
            class_date: '2026-10-20',
            status: 'PENDING',
          },
        ];
      return [];
    });
    await expect(
      service.decideAttendanceUnlock('hod-1', 'tenant-1', requestId, 'APPROVE'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.create).not.toHaveBeenCalled();
  });
});
