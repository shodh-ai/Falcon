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
      'assigned.dept_id = ANY($2::int[])',
    );
    expect(query.mock.calls[1][1]).toEqual(['tenant-1', [17], null]);
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
