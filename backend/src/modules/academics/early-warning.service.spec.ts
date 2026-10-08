import { EarlyWarningService } from './early-warning.service';

describe('EarlyWarningService', () => {
  it('uses the canonical course-enrollment attendance projection and published marks', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        user_id: 'student-1',
        name: 'Student One',
        official_email: 'student@example.edu',
        enrollment_no: 'REG-1',
        dept_name: 'Pharmacy',
        batch: '2026',
        attendance_percent: '50.00',
        total_obtained: '30',
        total_max: '100',
      },
    ]);
    const service = new EarlyWarningService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getFacultyAtRiskStudents({
      userId: 'faculty-1',
      tenantId: 'tenant-1',
      roles: ['Faculty'],
    });

    const sql = String(query.mock.calls[0][0]);
    expect(sql).toContain('student_course_enrollments');
    expect(sql).toContain('sce.attendance_percent');
    expect(sql).toContain('academic_course_allocations');
    expect(sql).toContain('academic_marks');
    expect(sql).not.toContain('academic_attendance_records');
    expect(result).toHaveLength(1);
    expect(result[0].metrics).toEqual({
      attendance_percent: 50,
      grades_percent: 30,
    });
    expect(result[0].risk_level).toBe('HIGH');
  });

  it('does not invent attendance risk before any course attendance is recorded', async () => {
    const query = jest.fn().mockResolvedValue([
      {
        user_id: 'student-2',
        name: 'Student Two',
        attendance_percent: null,
        total_obtained: null,
        total_max: null,
      },
    ]);
    const service = new EarlyWarningService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.getFacultyAtRiskStudents({
        userId: 'faculty-1',
        tenantId: 'tenant-1',
        roles: ['Faculty'],
      }),
    ).resolves.toEqual([]);
  });
});
