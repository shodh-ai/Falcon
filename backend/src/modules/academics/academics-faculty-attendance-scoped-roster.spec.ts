jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

import { BadRequestException } from '@nestjs/common';
import { AcademicsFacultyService } from './academics-faculty.service';

const qaStudent = '00000000-0000-4000-8000-000000000001';
const unmappedStudent = '11111111-1111-4111-8111-111111111111';
const secondVisibleStudent = '22222222-2222-4222-8222-222222222222';
const extraAdjustment = '33333333-3333-4333-8333-333333333333';

function todayIso() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function academicYear(date: string) {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function setup(includeSecondVisible = false) {
  const date = todayIso();
  const enrollments = [
    { student_user_id: qaStudent, semester: 3, section_code: 'A', status: 'ENROLLED', student: { name: 'QA Student One' } },
    { student_user_id: unmappedStudent, semester: 3, section_code: 'A', status: 'ENROLLED', student: { name: 'Unmapped' } },
    ...(includeSecondVisible
      ? [{ student_user_id: secondVisibleStudent, semester: 3, section_code: 'A', status: 'ENROLLED', student: { name: 'Visible Two' } }]
      : []),
  ];
  const enrollmentRepo = { find: jest.fn().mockResolvedValue(enrollments) };
  const manager = {
    getRepository: jest.fn().mockReturnValue(enrollmentRepo),
    query: jest.fn(async (sql: string): Promise<unknown[]> => {
      if (sql.includes('SELECT t.section')) return [{ section: 'A', is_practical: false }];
      if (sql.includes('SELECT t.day_of_week')) return [{
        day_of_week: new Date(`${date}T00:00:00Z`).getUTCDay() || 7,
        valid_from: null, valid_to: null, source_date: null, target_date: null,
      }];
      if (sql.includes('FROM academic_course_allocations')) {
        return [{ program_name: 'MTECH CSE', semester: 'III', academic_year: academicYear(date) }];
      }
      if (sql.includes('FROM student_profiles')) {
        return [
          { user_id: qaStudent, program: 'MTECH CSE', status: 'ACTIVE' },
          { user_id: unmappedStudent, program: null, status: 'ACTIVE' },
          ...(includeSecondVisible ? [{ user_id: secondVisibleStudent, program: 'MTECH CSE', status: 'ACTIVE' }] : []),
        ];
      }
      if (sql.includes('SELECT u.user_id')) return [];
      return [];
    }),
  };
  const dataSource = {
    query: jest.fn(async (sql: string): Promise<unknown[]> => sql.includes('SELECT t.section')
      ? [{ section: 'A', faculty_user_id: 'faculty-1', is_practical: false }]
      : []),
    transaction: jest.fn(async (work: (tx: typeof manager) => Promise<unknown>) => work(manager)),
  };
  const service = new AcademicsFacultyService(
    dataSource as never,
    {} as never,
    { findOne: jest.fn().mockResolvedValue({ timetable_id: 'slot-1' }) } as never,
    enrollmentRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );
  jest.spyOn(service as never, 'recalculateCourseAttendancePercents' as never).mockResolvedValue([] as never);
  return { service, manager, dataSource, date };
}

describe('Faculty attendance uses the same scoped roster for reading and saving', () => {
  it('saves the complete visible roster without demanding unmapped course enrollments', async () => {
    const { service, manager, date } = setup();
    const result = await service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: 'slot-1', date,
      attendance_data: [{ student_id: qaStudent, status: 'ABSENT' }],
    });

    expect(result.saved).toBe(1);
    expect(manager.getRepository).toHaveBeenCalled();
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_attendance_logs'),
      expect.arrayContaining([JSON.stringify([{ student_id: qaStudent, status: 'ABSENT' }])]),
    );
  });

  it('saves approved extra-class attendance under its own session and reads it back', async () => {
    const { service, manager, dataSource, date } = setup();
    const originalQuery = dataSource.query.getMockImplementation()!;
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT adjustment_id FROM class_adjustments')) return [{ adjustment_id: extraAdjustment }];
      if (sql.includes('SELECT attendance_data FROM course_attendance_logs')) {
        return [{ attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }] }];
      }
      return originalQuery(sql);
    });
    const originalManagerQuery = manager.query.getMockImplementation()!;
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT adjustment_id FROM class_adjustments')) return [{ adjustment_id: extraAdjustment }];
      return originalManagerQuery(sql);
    });

    const result = await service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: `extra:${extraAdjustment}`, date,
      attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }],
    });
    expect(result.saved).toBe(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('class_adjustment_id, attendance_data'),
      expect.arrayContaining([null, extraAdjustment, JSON.stringify([{ student_id: qaStudent, status: 'PRESENT' }])]),
    );
    const reloaded = await service.getCourseAttendanceState('course-1', 'faculty-1', 'tenant-1', date, `extra:${extraAdjustment}`);
    expect(reloaded.attendance_data).toEqual([{ student_id: qaStudent, status: 'PRESENT' }]);
  });

  it('rejects an extra-class session that is not approved for this faculty', async () => {
    const { service, manager, date } = setup();
    await expect(service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: `extra:${extraAdjustment}`, date,
      attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }],
    })).rejects.toThrow('Extra class is not approved');
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_attendance_logs'), expect.anything(),
    );
  });

  it('rejects a submitted student hidden by programme scoping', async () => {
    const { service, manager, date } = setup();
    await expect(service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: 'slot-1', date,
      attendance_data: [
        { student_id: qaStudent, status: 'PRESENT' },
        { student_id: unmappedStudent, status: 'PRESENT' },
      ],
    })).rejects.toThrow('outside this scheduled batch');
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_attendance_logs'),
      expect.anything(),
    );
  });

  it('still requires every visible student in the selected slot', async () => {
    const { service, manager, date } = setup(true);
    await expect(service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: 'slot-1', date,
      attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_attendance_logs'),
      expect.anything(),
    );
  });

  it('records an approved substitute as actor while retaining the original timetable owner', async () => {
    const { service, manager, dataSource, date } = setup();
    const read = dataSource.query.getMockImplementation()!;
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT absent_faculty_id FROM academic_proxy_requests')) {
        return [{ absent_faculty_id: 'faculty-1' }];
      }
      return read(sql);
    });
    const withinTransaction = manager.query.getMockImplementation()!;
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT absent_faculty_id FROM academic_proxy_requests')) {
        return [{ absent_faculty_id: 'faculty-1' }];
      }
      if (sql.includes('SELECT proxy_faculty_id FROM academic_proxy_requests')) {
        return [{ proxy_faculty_id: 'substitute-1' }];
      }
      if (sql.includes('SELECT t.day_of_week')) {
        return [{ day_of_week: 0, valid_from: null, valid_to: null,
          source_date: '2026-10-19', target_date: date }];
      }
      return withinTransaction(sql);
    });
    const result = await service.saveCourseAttendanceLog('substitute-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: 'slot-1', date,
      attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }],
    });
    expect(result.saved).toBe(1);
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('marked_by_user_id'),
      expect.arrayContaining(['faculty-1', 'substitute-1']),
    );
  });

  it('blocks the original owner after an approved substitute takes the session', async () => {
    const { service, manager, date } = setup();
    const read = manager.query.getMockImplementation()!;
    manager.query.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT proxy_faculty_id FROM academic_proxy_requests')) {
        return [{ proxy_faculty_id: 'substitute-1' }];
      }
      return read(sql);
    });
    await expect(service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
      course_id: 'course-1', timetable_id: 'slot-1', date,
      attendance_data: [{ student_id: qaStudent, status: 'PRESENT' }],
    })).rejects.toThrow('assigned to an approved substitute');
    expect(manager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO course_attendance_logs'), expect.anything(),
    );
  });

  it('shows attendance alerts only for the selected class roster', async () => {
    const { service, dataSource, date } = setup();
    jest.spyOn(service, 'getCourseStudents').mockResolvedValue([
      { student_id: qaStudent, name: 'QA Student One', roll_number: 'QA-1', photo_url: null },
    ]);
    dataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('scheduled_classes::text')) return [{ scheduled_classes: '1', conducted_classes: '1' }];
      if (sql.includes('FROM student_course_enrollments e')) return [
        { student_user_id: qaStudent, name: 'QA Student One', attendance_percent: '50' },
        { student_user_id: unmappedStudent, name: 'Outside section', attendance_percent: '20' },
      ];
      if (sql.includes('WITH last_logs')) return [
        { student_user_id: qaStudent, missed_count: 3 },
        { student_user_id: unmappedStudent, missed_count: 3 },
      ];
      return [];
    });
    const result = await service.getAttendanceAnalytics('course-1', 'faculty-1', 'tenant-1', date, 'slot-1');
    expect(result.defaulters.map((row: { student_user_id: string }) => row.student_user_id)).toEqual([qaStudent]);
    expect(result.habitual_absentees.map((row: { student_user_id: string }) => row.student_user_id)).toEqual([qaStudent]);
  });

  it('cannot send a warning to another class roster', async () => {
    const { service, date } = setup();
    jest.spyOn(service, 'getCourseStudents').mockResolvedValue([
      { student_id: qaStudent, name: 'QA Student One', roll_number: 'QA-1', photo_url: null },
    ]);
    await expect(service.sendAttendanceWarnings('course-1', 'faculty-1', 'tenant-1',
      [unmappedStudent], date, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
      .rejects.toThrow('only to students in this scheduled class');
  });
});
