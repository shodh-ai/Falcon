jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-id') }));

import { AcademicsFacultyService } from './academics-faculty.service';

describe('AcademicsFacultyService course roster', () => {
  it('includes completed and failed memberships in the faculty roster', async () => {
    const enrollmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          student_user_id: 'student-1',
          student: { name: 'Student One', email: 'student@example.test' },
        },
      ]),
    };
    const service = new AcademicsFacultyService(
      { query: jest.fn().mockResolvedValue([]) } as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ timetable_id: 'timetable-1' }) } as any,
      enrollmentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.getCourseStudents('course-1', 'faculty-1', 'tenant-1');

    const where = enrollmentRepo.find.mock.calls[0][0].where;
    expect(where.status._value).toEqual(['ENROLLED', 'COMPLETED', 'FAILED']);
  });

  it('scopes a practical roster to the selected timetable batch', async () => {
    const enrollmentRepo = { find: jest.fn().mockResolvedValue([
      { student_user_id: 'student-a', section_code: 'A', student: { name: 'A' } },
      { student_user_id: 'student-b', section_code: 'B', student: { name: 'B' } },
    ]) };
    const dataSource = {
      query: jest.fn((sql: string) => {
        if (sql.includes('SELECT t.section')) return Promise.resolve([{ section: 'B', is_practical: true }]);
        if (sql.includes('SELECT batch_id')) return Promise.resolve([{ batch_id: 'batch-1' }]);
        if (sql.includes('SELECT student_user_id FROM academic_practical_batch_members')) {
          return Promise.resolve([{ student_user_id: 'student-b' }]);
        }
        return Promise.resolve([]);
      }),
    };
    const service = new AcademicsFacultyService(
      dataSource as any,
      {} as any,
      { findOne: jest.fn().mockResolvedValue({ timetable_id: 'timetable-1' }) } as any,
      enrollmentRepo as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    const roster = await service.getCourseStudents(
      'course-1',
      'faculty-1',
      'tenant-1',
      'timetable-1',
    );

    expect(roster.map((student) => student.student_id)).toEqual(['student-b']);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('timetable_id = $2::uuid'),
      ['tenant-1', 'timetable-1', 'course-1', 'faculty-1', expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/)],
    );
  });

  it('does not show another programme sharing the same course identity', async () => {
    const enrollmentRepo = { find: jest.fn().mockResolvedValue([
      { student_user_id: 'btech-student', semester: 3, section_code: 'A', status: 'ENROLLED', student: { name: 'B.Tech Student' } },
      { student_user_id: 'mtech-student', semester: 3, section_code: null, status: 'ENROLLED', student: { name: 'M.Tech Student' } },
      { student_user_id: 'other-section', semester: 3, section_code: 'B', status: 'ENROLLED', student: { name: 'Other Section' } },
    ]) };
    const dataSource = { query: jest.fn((sql: string) => {
      if (sql.includes('FROM academic_course_allocations')) {
        return Promise.resolve([{ program_name: 'BTECH CSE', semester: 'III-A', academic_year: '2026-2027' }]);
      }
      if (sql.includes('FROM student_profiles')) {
        return Promise.resolve([
          { user_id: 'btech-student', program: 'B.Tech Computer Science', status: 'ACTIVE' },
          { user_id: 'mtech-student', program: 'MTECH CSE', status: 'ACTIVE' },
          { user_id: 'other-section', program: 'BTECH CSE', status: 'ACTIVE' },
        ]);
      }
      return Promise.resolve([]);
    }) };
    const service = new AcademicsFacultyService(
      dataSource as any, {} as any,
      { findOne: jest.fn().mockResolvedValue({ timetable_id: 'timetable-1' }) } as any,
      enrollmentRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const roster = await service.getCourseStudents('course-1', 'faculty-1', 'tenant-1', undefined, '2026-10-13');
    expect(roster.map((student) => student.student_id)).toEqual(['btech-student']);
  });

  it('scopes a theory timetable slot when the faculty teaches two sections', async () => {
    const enrollmentRepo = { find: jest.fn().mockResolvedValue([
      { student_user_id: 'student-a', semester: 3, section_code: 'A', status: 'ENROLLED', student: { name: 'A' } },
      { student_user_id: 'student-b', semester: 3, section_code: 'B', status: 'ENROLLED', student: { name: 'B' } },
    ]) };
    const dataSource = { query: jest.fn((sql: string) => {
      if (sql.includes('SELECT t.section')) return Promise.resolve([{ section: 'B', is_practical: false }]);
      if (sql.includes('FROM academic_course_allocations')) return Promise.resolve([
        { program_name: 'BTECH CSE', semester: 'III-A', academic_year: '2026-2027' },
        { program_name: 'BTECH CSE', semester: 'III-B', academic_year: '2026-2027' },
      ]);
      if (sql.includes('FROM student_profiles')) return Promise.resolve([
        { user_id: 'student-a', program: 'BTECH CSE', status: 'ACTIVE' },
        { user_id: 'student-b', program: 'BTECH CSE', status: 'ACTIVE' },
      ]);
      return Promise.resolve([]);
    }) };
    const service = new AcademicsFacultyService(
      dataSource as any, {} as any,
      { findOne: jest.fn().mockResolvedValue({ timetable_id: 'slot-b' }) } as any,
      enrollmentRepo as any, {} as any, {} as any, {} as any, {} as any, {} as any,
    );

    const roster = await service.getCourseStudents('shared-course', 'faculty-1', 'tenant-1', 'slot-b', '2026-10-13');
    expect(roster.map((student) => student.student_id)).toEqual(['student-b']);
  });
});
