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
      ['tenant-1', 'timetable-1', 'course-1', 'faculty-1'],
    );
  });
});
