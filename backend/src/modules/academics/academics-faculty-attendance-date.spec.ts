jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AcademicsFacultyService } from './academics-faculty.service';

function createService(options?: {
  timetableRows?: Record<string, unknown>[];
  slotRows?: Record<string, unknown>[];
}) {
  const dataSource = {
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('SELECT t.section'))
        return Promise.resolve(options?.slotRows ?? []);
      if (sql.includes('SELECT count(*)::int AS student_count'))
        return Promise.resolve([{ student_count: 2 }]);
      if (sql.includes('SELECT b.batch_id')) return Promise.resolve([]);
      return Promise.resolve(options?.timetableRows ?? []);
    }),
  };
  const enrollmentRepo = {
    count: jest.fn().mockResolvedValue(2),
    find: jest.fn().mockResolvedValue([]),
  };
  const service = new AcademicsFacultyService(
    dataSource as never,
    {} as never,
    {
      findOne: jest.fn().mockResolvedValue({ timetable_id: 'slot-1' }),
    } as never,
    enrollmentRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {
      facultyCoursesCte: jest.fn(() => 'faculty_courses AS (SELECT 1)'),
    } as never,
  );
  return { service, dataSource, enrollmentRepo };
}

describe('Faculty attendance date and practical batch safety', () => {
  it('rejects a held session before authorization, casting or any database write', async () => {
    const {service,dataSource}=createService();
    await expect(service.saveCourseAttendanceLog('f','t',{course_id:'c',timetable_id:'held:p2-d2-5',attendance_data:[{student_id:'s',status:'PRESENT'}]})).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
  it('does not allow published or held source courses through the legacy slotless write path', async () => {
    const {service,dataSource}=createService({timetableRows:[{requires_published_slot:true}]});
    await expect(service.saveCourseAttendanceLog('f','t',{course_id:'c',attendance_data:[{student_id:'s',status:'PRESENT'}]})).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
  it('uses one bounded week query without fetching any student roster', async () => {
    const { service, dataSource } = createService({ timetableRows: [
      {date:'2026-10-12',timetable_id:'slot-1',has_saved_attendance:true},
      {date:'2026-10-12',timetable_id:'slot-2',has_saved_attendance:false},
      {date:'2026-10-13',timetable_id:'held:p2-d2-5',has_saved_attendance:false},
    ] });
    const roster = jest.spyOn(service,'getCourseStudents');
    const week=await service.getFacultyAttendanceWeek('faculty-1','tenant-1',43,'2026-10-12');
    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(week).toHaveLength(7);
    expect(week[0].sessions.map(s=>s.has_saved_attendance)).toEqual([true,false]);
    expect(week[1].sessions[0].awaiting_confirmation).toBe(true);
    expect(week[6].date).toBe('2026-10-18');
    expect(roster).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledWith(expect.stringContaining('generate_series(0, 6)'),['tenant-1','faculty-1',43,'2026-10-12']);
  });
  it('rejects invalid week input before querying', async () => {
    const {service,dataSource}=createService();
    await expect(service.getFacultyAttendanceWeek('f','t',null,'2026-02-30')).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });
  it('loads the requested weekday and counts only the scoped visible roster', async () => {
    const { service, dataSource } = createService({
      timetableRows: [
        {
          timetable_id: 'slot-1',
          course_id: 'course-1',
          course_code: 'ER2013P',
          course_name: 'Pharmacognosy Practical',
          room: 'LT-24',
          start_time: '13:30',
          end_time: '16:50',
          section: 'BATCH-A',
          is_practical: true,
        },
      ],
    });

    const rosterSpy = jest.spyOn(service, 'getCourseStudents').mockResolvedValue([
      { student_id: 'student-a', name: 'A', roll_number: 'A', email: '', section_code: null },
      { student_id: 'student-b', name: 'B', roll_number: 'B', email: '', section_code: null },
    ]);
    const rows = await service.getFacultyAcademicTimetableToday(
      'faculty-1',
      'tenant-1',
      null,
      '2026-10-13',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].student_count).toBe(2);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('t.day_of_week = $4'),
      ['tenant-1', 'faculty-1', null, 2, '2026-10-13'],
    );
    expect(rosterSpy).toHaveBeenCalledWith('course-1', 'faculty-1', 'tenant-1', 'slot-1', '2026-10-13');
  });

  it('rejects invalid dates instead of looking up an unrelated class day', async () => {
    const { service, dataSource } = createService();
    await expect(
      service.getFacultyAcademicTimetableToday(
        'faculty-1',
        'tenant-1',
        null,
        '2026-02-30',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('reports persisted per-session attendance without leaking another faculty or batch record', async () => {
    const { service, dataSource } = createService({ timetableRows: [
      { timetable_id: 'slot-1', course_id: 'course-1', is_practical: true, section: null, has_saved_attendance: true },
      { timetable_id: 'slot-2', course_id: 'course-1', is_practical: true, section: null, has_saved_attendance: false },
    ] });
    const rows = await service.getFacultyAcademicTimetableToday('faculty-1', 'tenant-1', 43, '2000-01-03');
    expect(rows.map(row => row.has_saved_attendance)).toEqual([true, false]);
    expect(rows.every(row => row.attendance_locked)).toBe(true);
    const sql = dataSource.query.mock.calls[0][0];
    for (const condition of ['cal.tenant_id = t.tenant_id', 'cal.course_id = t.course_id',
      'cal.faculty_user_id = t.faculty_user_id', 'cal.timetable_id = t.timetable_id', 'cal.date = $5::date']) {
      expect(sql).toContain(condition);
    }
  });

  it('does not count the whole course as the roster of an unmapped practical batch', async () => {
    const { service, enrollmentRepo } = createService({
      timetableRows: [
        {
          timetable_id: 'slot-1',
          course_id: 'course-1',
          course_code: 'ER2013P',
          course_name: 'Pharmacognosy Practical',
          room: 'LT-24',
          start_time: '13:30',
          end_time: '16:50',
          section: null,
          is_practical: true,
        },
      ],
    });
    const rows = await service.getFacultyAcademicTimetableToday(
      'faculty-1',
      'tenant-1',
      null,
      '2026-10-13',
    );
    expect(rows[0].student_count).toBe(0);
    expect(enrollmentRepo.count).not.toHaveBeenCalled();
  });

  it('does not expose an unmapped practical batch as a markable roster', async () => {
    const { service, enrollmentRepo } = createService({
      slotRows: [{ section: null, is_practical: true }],
    });
    const students = await service.getCourseStudents(
      'course-1',
      'faculty-1',
      'tenant-1',
      'slot-1',
    );
    expect(students).toEqual([]);
    expect(enrollmentRepo.find).not.toHaveBeenCalled();
  });

  it('blocks attendance writes to an unmapped practical batch', async () => {
    const { service } = createService({
      slotRows: [
        { section: null, is_practical: true, faculty_user_id: 'faculty-1' },
      ],
    });
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await expect(
      service.saveCourseAttendanceLog('faculty-1', 'tenant-1', {
        course_id: 'course-1',
        date,
        timetable_id: 'slot-1',
        attendance_data: [{ student_id: 'student-1', status: 'PRESENT' }],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
