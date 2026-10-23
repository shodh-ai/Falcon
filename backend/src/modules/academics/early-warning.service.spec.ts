import { EarlyWarningService } from './early-warning.service';

describe('EarlyWarningService', () => {
  const ctx = {
    userId: 'faculty-1',
    tenantId: 'tenant-1',
    roles: ['Faculty'],
  };

  const student = {
    user_id: 'student-1',
    name: 'Student One',
    official_email: 'student@example.edu',
    enrollment_no: 'REG-1',
    dept_name: 'Pharmacy',
    batch: '2026',
  };

  function setup(rows: Record<string, unknown>[]) {
    const query = jest.fn().mockResolvedValue(rows);
    const service = new EarlyWarningService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { query, service };
  }

  it('reads real attendance and valid published marks within the current faculty and tenant scope', async () => {
    const { query, service } = setup([]);

    await service.getFacultyAtRiskStudents(ctx);

    const [statement, parameters] = query.mock.calls[0];
    const sql = String(statement);
    expect(parameters).toEqual(['faculty-1', 'tenant-1']);
    expect(sql).toContain('academic_course_allocations');
    expect(sql).toContain('academic_timetables');
    expect(sql).toContain('student_course_enrollments');
    expect(sql).toContain('course_attendance_logs');
    expect(sql).not.toContain('sce.attendance_percent');
    expect(sql).not.toContain('academic_attendance_records');
    expect(sql).toMatch(/a\.faculty_user_id\s*=\s*\$1/);
    expect(sql).toMatch(/a\.tenant_id\s*=\s*\$2/);
    expect(sql).toMatch(/tt\.faculty_user_id\s*=\s*\$1/);
    expect(sql).toMatch(/tt\.tenant_id\s*=\s*\$2/);
    expect(sql).toMatch(/sce\.tenant_id\s*=\s*\$2/);
    expect(sql).toMatch(/sce\.status\s*=\s*'ENROLLED'/);
    expect(sql).toMatch(/m\.tenant_id\s*=\s*\$2/);
    expect(sql).toMatch(/m\.status\s*=\s*'PUBLISHED'/);
    expect(sql).toMatch(/\(to_jsonb\(m\)->>'deleted_at'\)\s+IS\s+NULL/i);
    expect(sql).toMatch(/m\.max_marks\s*>\s*0/);
    expect(sql).toMatch(/m\.marks_obtained\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/u\.tenant_id\s*=\s*\$2/);
  });

  it('does not flag students when neither attendance nor published marks are recorded', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '0',
        attendance_percent: null,
        published_assessment_count: '0',
        total_obtained: null,
        total_max: null,
      },
    ]);

    await expect(service.getFacultyAtRiskStudents(ctx)).resolves.toEqual([]);
  });

  it('ignores stale zero percentages when no supporting records exist', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '0',
        attendance_percent: '0',
        published_assessment_count: '0',
        total_obtained: '0',
        total_max: '100',
      },
    ]);

    await expect(service.getFacultyAtRiskStudents(ctx)).resolves.toEqual([]);
  });

  it('treats recorded zero attendance as critical while keeping missing marks unknown', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '4',
        attendance_percent: '0.00',
        published_assessment_count: '0',
        total_obtained: null,
        total_max: null,
      },
    ]);

    await expect(service.getFacultyAtRiskStudents(ctx)).resolves.toEqual([
      expect.objectContaining({
        user_id: 'student-1',
        risk_score: 50,
        risk_level: 'MEDIUM',
        risk_factors: ['Critical Attendance (0%)'],
        metrics: {
          attendance_percent: 0,
          grades_percent: null,
          attendance_record_count: 4,
          published_assessment_count: 0,
        },
      }),
    ]);
  });

  it('flags genuine zero published marks without inventing attendance', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '0',
        attendance_percent: null,
        published_assessment_count: '2',
        total_obtained: '0',
        total_max: '100',
      },
    ]);

    await expect(service.getFacultyAtRiskStudents(ctx)).resolves.toEqual([
      expect.objectContaining({
        risk_score: 50,
        risk_level: 'MEDIUM',
        risk_factors: ['Failing Grades (0%)'],
        metrics: {
          attendance_percent: null,
          grades_percent: 0,
          attendance_record_count: 0,
          published_assessment_count: 2,
        },
      }),
    ]);
  });

  it('keeps marks unknown when published components have no valid maximum', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '2',
        attendance_percent: '50',
        published_assessment_count: '1',
        total_obtained: '0',
        total_max: '0',
      },
    ]);

    const result = await service.getFacultyAtRiskStudents(ctx);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      risk_score: 50,
      risk_factors: ['Critical Attendance (50%)'],
      metrics: { attendance_percent: 50, grades_percent: null },
    });
  });

  it('keeps an absent obtained mark unknown even if a maximum is present', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '2',
        attendance_percent: '50',
        published_assessment_count: '1',
        total_obtained: null,
        total_max: '100',
      },
    ]);

    const result = await service.getFacultyAtRiskStudents(ctx);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      risk_score: 50,
      risk_factors: ['Critical Attendance (50%)'],
      metrics: { attendance_percent: 50, grades_percent: null },
    });
  });

  it('calculates grades from the aggregated obtained and maximum marks', async () => {
    const { service } = setup([
      {
        ...student,
        attendance_record_count: '2',
        attendance_percent: '50',
        published_assessment_count: '2',
        total_obtained: '30',
        total_max: '200',
      },
    ]);

    const result = await service.getFacultyAtRiskStudents(ctx);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      risk_score: 100,
      risk_level: 'HIGH',
      metrics: { attendance_percent: 50, grades_percent: 15 },
      risk_factors: ['Critical Attendance (50%)', 'Failing Grades (15%)'],
    });
  });

  it.each([
    {
      attendance: '74', marks: '40', score: 75, level: 'HIGH',
      attendanceFactor: 'Critical Attendance (74%)', gradesFactor: 'Poor Grades (40%)',
    },
    {
      attendance: '75', marks: '0', score: 70, level: 'MEDIUM',
      attendanceFactor: 'Low Attendance (75%)', gradesFactor: 'Failing Grades (0%)',
    },
    {
      attendance: '85', marks: '0', score: 50, level: 'MEDIUM',
      attendanceFactor: null, gradesFactor: 'Failing Grades (0%)',
    },
    {
      attendance: '50', marks: '60', score: 50, level: 'MEDIUM',
      attendanceFactor: 'Critical Attendance (50%)', gradesFactor: null,
    },
  ])(
    'preserves risk thresholds for attendance $attendance and published marks $marks',
    async ({ attendance, marks, score, level, attendanceFactor, gradesFactor }) => {
      const { service } = setup([
        {
          ...student,
          attendance_record_count: '100',
          attendance_percent: attendance,
          published_assessment_count: '1',
          total_obtained: marks,
          total_max: '100',
        },
      ]);

      const result = await service.getFacultyAtRiskStudents(ctx);

      expect(result).toHaveLength(1);
      expect(result[0].risk_score).toBe(score);
      expect(result[0].risk_level).toBe(level);
      expect(result[0].risk_factors).toEqual(
        [attendanceFactor, gradesFactor].filter((factor) => factor !== null),
      );
    },
  );
});
