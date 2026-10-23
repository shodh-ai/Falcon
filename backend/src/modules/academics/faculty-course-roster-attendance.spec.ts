import { ForbiddenException } from '@nestjs/common';
import { AcademicsFacultyService } from './academics-faculty.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty course roster attendance contract', () => {
  const courseId = '10000000-0000-4000-8000-000000000001';
  const tenantId = '20000000-0000-4000-8000-000000000001';
  const facultyId = '30000000-0000-4000-8000-000000000001';
  const studentId = '40000000-0000-4000-8000-000000000001';

  const query = jest.fn();
  const find = jest.fn();
  const assertFacultyTeachesCourse = jest.fn();
  let service: AcademicsFacultyService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(AcademicsFacultyService.prototype), {
      dataSource: { query },
      enrollmentRepo: { find },
      assertFacultyTeachesCourse,
    });
    assertFacultyTeachesCourse.mockResolvedValue(undefined);
    find.mockResolvedValue([{
      student_user_id: studentId,
      attendance_percent: '0.00',
      student: { name: 'Test Student', email: 'test@example.edu' },
    }]);
  });

  it('returns unknown attendance for an enrollment with no recorded sessions', async () => {
    query.mockResolvedValue([{
      user_id: studentId,
      roll_number: 'TEST001',
      attendance_record_count: 0,
      attendance_percent: null,
    }]);

    const [student] = await service.getCourseStudents(courseId, facultyId, tenantId);

    expect(student).toEqual({
      student_id: studentId,
      name: 'Test Student',
      email: 'test@example.edu',
      roll_number: 'TEST001',
      attendance_record_count: 0,
      attendance_percent: null,
    });
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: tenantId, course_id: courseId, status: 'ENROLLED' },
    }));
    expect(query.mock.calls[0][1]).toEqual([[studentId], tenantId, courseId]);
  });

  it.each([
    ['all sessions absent', '2', '0', 0],
    ['some sessions attended', '4', '75.00', 75],
  ])('preserves measured attendance when %s', async (_label, count, percent, expected) => {
    query.mockResolvedValue([{
      user_id: studentId,
      roll_number: 'TEST001',
      attendance_record_count: count,
      attendance_percent: percent,
    }]);

    const [student] = await service.getCourseStudents(courseId, facultyId, tenantId);

    expect(student.attendance_record_count).toBe(Number(count));
    expect(student.attendance_percent).toBe(expected);
  });

  it('does not query attendance for an empty active roster', async () => {
    find.mockResolvedValue([]);

    await expect(service.getCourseStudents(courseId, facultyId, tenantId)).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('checks faculty access before exposing roster or attendance', async () => {
    assertFacultyTeachesCourse.mockRejectedValue(new ForbiddenException());

    await expect(service.getCourseStudents(courseId, facultyId, tenantId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(find).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });
});
