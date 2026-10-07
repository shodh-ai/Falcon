import { ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

describe('Faculty course visibility', () => {
  function service(query: jest.Mock, teachingDepartments: any = {}) {
    return new FacultyWorkspacesService(
      { query } as any,
      {} as any,
      teachingDepartments,
      {} as any,
    );
  }

  it('does not expose historical marks as a current My Courses allocation', async () => {
    const query = jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const result = await service(query).listFacultyCourses(
      'faculty-id',
      'tenant-id',
      12,
    );

    expect(result).toEqual([]);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('t.deleted_at IS NULL');
  });

  it('requires an active allocation or non-deleted timetable for direct access', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const target = service(query) as any;

    await expect(
      target.assertFacultyOwnsCourse('faculty-id', 'tenant-id', 'course-id'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const sql = query.mock.calls[0][0] as string;
    expect(sql).toContain("status = 'ACTIVE'");
    expect(sql).toContain('deleted_at IS NULL');
    expect(sql).not.toContain('academic_marks');
  });

  it('limits directory lookup to the faculty department and published marks', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 17 }])
      .mockResolvedValueOnce([]);
    const target = service(query);

    await target.searchDepartmentStudents('faculty-id', 'tenant-id', 'PH2026');

    const sql = query.mock.calls[1][0] as string;
    expect(sql).toContain('u.dept_id = $2');
    expect(sql).toContain("m.status = 'PUBLISHED'");
    expect(query.mock.calls[1][1]).toEqual(['tenant-id', 17, '%ph2026%', 25]);
  });

  it('keeps completed and failed course memberships visible in student analytics', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ ok: 1 }])
      .mockResolvedValueOnce([]);
    const target = service(query);

    await target.getStudentAnalytics('faculty-id', 'tenant-id', 'course-id');

    expect(query.mock.calls[1][0]).toContain(
      "e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')",
    );
  });

  it('keeps active course allocations visible when the department has not scheduled a slot yet', async () => {
    const allocation = {
      allocation_id: 'allocation-1',
      course_id: 'course-neeraj-bp105',
      course_code: 'BP105T',
      course_name: 'Introduction to Pharmacognosy',
      faculty_user_id: 'faculty-neeraj',
      faculty_name: 'Neeraj Patel',
    };
    const query = jest
      .fn()
      // resolveHodDepartmentIds: this account is a regular faculty member
      .mockResolvedValueOnce([])
      // active allocation remains the source of truth for the course pool
      .mockResolvedValueOnce([allocation])
      // no timetable row exists yet; this must not erase the allocation
      .mockResolvedValueOnce([])
      // faculty identity lookup
      .mockResolvedValueOnce([{ user_id: 'faculty-neeraj', name: 'Neeraj Patel' }]);

    const result = await service(query, {
      facultyCoursesCte: () => `faculty_courses AS (SELECT 'course-neeraj-bp105'::uuid AS course_id)`,
    }).getFacultyScheduleData(
      'faculty-neeraj',
      'tenant-sgvu',
    );

    expect(result.allocations).toEqual([allocation]);
    expect(result.timetables).toEqual([]);
  });
});
