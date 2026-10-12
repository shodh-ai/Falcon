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
  it('loads the requested weekday and includes historical course memberships in the count', async () => {
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
      ['tenant-1', 'faculty-1', null, 2],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')",
      ),
      ['tenant-1', 'course-1', 'BATCH-A'],
    );
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
