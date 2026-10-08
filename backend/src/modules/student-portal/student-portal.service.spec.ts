import { StudentPortalService } from './student-portal.service';

jest.mock('uuid', () => ({
  v4: jest.fn(() => '00000000-0000-4000-8000-000000000001'),
}));

describe('StudentPortalService.getAttendance', () => {
  it('binds exactly the parameters referenced by the attendance query', async () => {
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([
          {
            course_code: 'CSE101',
            course_name: 'Programming',
            semester: 1,
            attendance_percent: '80',
            status: 'ENROLLED',
            present_count: 8,
            absent_count: 2,
            total_classes: 10,
          },
        ])
        .mockResolvedValueOnce([
          {
            current_semester: 1,
            enrolled_semester: 1,
            max_enrollment_semester: 1,
          },
        ]),
    };

    const unused = {} as never;
    const service = new StudentPortalService(
      dataSource as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );

    const result = await service.getAttendance('tenant-1', 'student-1');

    const [attendanceSql, attendanceParams] = dataSource.query.mock.calls[0];
    expect(attendanceSql).not.toContain('$3');
    expect(attendanceParams).toEqual(['student-1', 'tenant-1']);
    expect(result.overall_percent).toBe(80);
    expect(result.current_semester).toBe(1);
  });
});
