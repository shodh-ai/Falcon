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
    const enrollmentRepo = { find: jest.fn().mockResolvedValue([]) };
    const dataSource = {
      query: jest.fn().mockResolvedValue([{ section: 'B', is_practical: true }]),
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

    await service.getCourseStudents(
      'course-1',
      'faculty-1',
      'tenant-1',
      'timetable-1',
    );

    const where = enrollmentRepo.find.mock.calls[0][0].where;
    expect(where.section_code).toBe('B');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('timetable_id = $2::uuid'),
      ['tenant-1', 'timetable-1', 'course-1', 'faculty-1'],
    );
  });
});
