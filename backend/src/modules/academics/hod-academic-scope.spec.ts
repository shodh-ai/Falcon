import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { WeeklyTestsService } from '../weekly-tests/weekly-tests.service';

describe('HOD academic department scope', () => {
  it('lists all active department courses, not only courses assigned to the HOD', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 17 }])
      .mockResolvedValueOnce([
        {
          allocation_id: 'allocation-1',
          course_id: 'course-1',
          course_code: 'BP501T',
        },
      ]);
    const service = new FacultyWorkspacesService(
      { query } as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.listFacultyCourses('hod-user', 'tenant-1', null, true),
    ).resolves.toHaveLength(1);
    expect(query.mock.calls[1][0]).toContain(
      'p.dept_id = ANY($2::int[])',
    );
    expect(query.mock.calls[1][1]).toEqual(['tenant-1', [17], null]);
  });

  it('does not fall back to personal courses for an unappointed department viewer', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new FacultyWorkspacesService({ query } as any, {} as any, {} as any, {} as any);
    await expect(service.listFacultyCourses('outsider', 'tenant-1', null, true)).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][1]).toEqual(['outsider', 'tenant-1']);
  });

  it('rejects a department filter outside the HOD appointments', async () => {
    const query = jest.fn().mockResolvedValue([{ dept_id: 17 }]);
    const service = new FacultyWorkspacesService({ query } as any, {} as any, {} as any, {} as any);
    await expect(service.listFacultyCourses('hod', 'tenant-1', 99, true)).rejects.toThrow('outside your oversight scope');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps an HOD personal timetable scoped to their own faculty ID', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new FacultyWorkspacesService({ query } as any, {} as any,
      { facultyCoursesCte: () => 'faculty_courses AS (SELECT NULL::uuid AS course_id)' } as any, {} as any);
    await service.getWeeklyTimetable('hod', 'tenant-1');
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('t.faculty_user_id = $2');
    expect(query.mock.calls[0][0]).toContain('$2::uuid=ANY(e.faculty_user_ids)');
    expect(query.mock.calls[0][1]).toEqual(['tenant-1', 'hod', null]);
  });

  it('lists weekly tests for department courses created by another lecturer', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ dept_id: 17 }])
      .mockResolvedValueOnce([
        { test_id: 'test-1', course_id: 'course-1', course_code: 'BP501T' },
      ]);
    const service = new WeeklyTestsService({ query } as any, {} as any);

    await expect(
      service.getFacultyTests('tenant-1', 'hod-user'),
    ).resolves.toEqual([
      { test_id: 'test-1', course_id: 'course-1', course_code: 'BP501T' },
    ]);
    expect(query.mock.calls[1][0]).toContain('academic_course_allocations');
    expect(query.mock.calls[1][1]).toEqual(['tenant-1', [17]]);
  });
});
