import { DataSource } from 'typeorm';
import { AcademicsService } from './academics.service';
import { MarksHistoryService } from './marks-history.service';
import {
  calculateStudentGradeSummary,
  type StudentGradeRow,
} from './student-grade-summary';

const grade = (
  credits: number | string,
  points: number | string | null,
  status = 'COMPLETED',
): StudentGradeRow => ({
  credits,
  grade_points: points,
  status,
});

describe('Student credit-weighted GPA', () => {
  it('uses each course credit weight, not an average of grades or semesters', () => {
    expect(calculateStudentGradeSummary([grade(4, 9), grade(2, 6)])).toEqual({
      gpa: 8,
      attemptedCredits: 6,
      earnedCredits: 6,
    });
  });

  it('counts failed graded credits in the denominator, but never as earned credits', () => {
    expect(
      calculateStudentGradeSummary([grade(4, 9), grade(2, 0, 'FAILED')]),
    ).toEqual({
      gpa: 6,
      attemptedCredits: 6,
      earnedCredits: 4,
    });
  });

  it('distinguishes a real zero GPA from results not yet available', () => {
    expect(calculateStudentGradeSummary([grade(4, 0, 'FAILED')]).gpa).toBe(0);
    expect(
      calculateStudentGradeSummary([grade(4, null, 'ENROLLED')]).gpa,
    ).toBeNull();
    expect(calculateStudentGradeSummary([]).gpa).toBeNull();
  });

  it('does not count in-progress courses even if they contain premature grade points', () => {
    expect(
      calculateStudentGradeSummary([grade(4, 8), grade(20, 10, 'ENROLLED')]),
    ).toEqual({
      gpa: 8,
      attemptedCredits: 4,
      earnedCredits: 4,
    });
  });

  it('uses valid numeric database strings and rounds only the final result', () => {
    expect(
      calculateStudentGradeSummary([grade('4', '9.00'), grade('3', '6.00')])
        .gpa,
    ).toBe(7.71);
  });

  it('does not coerce missing points to zero or let invalid numbers poison the total', () => {
    expect(
      calculateStudentGradeSummary([
        grade(4, null),
        grade(2, ''),
        grade(2, 'NaN'),
        grade(2, -1),
        grade(-1, 9),
        grade(0, 9),
        grade(1, 8),
      ]),
    ).toEqual({ gpa: 8, attemptedCredits: 1, earnedCredits: 11 });
  });
});

describe('Dashboard and Results GPA parity', () => {
  const tenantId = 'test-tenant';
  const studentId = 'test-student';

  function makeEnrollment(
    courseId: string,
    semester: number,
    credits: number,
    points: string | null,
    status: string,
  ) {
    return {
      enrollment_id: `enrollment-${courseId}`,
      tenant_id: tenantId,
      student_user_id: studentId,
      semester,
      grade: points === '9' ? 'A' : 'F',
      grade_points: points,
      status,
      course_id: courseId,
      course_code: courseId,
      course_name: courseId,
      credits,
      is_elective: false,
      attendance_percent: '100',
      course: {
        tenant_id: tenantId,
        course_id: courseId,
        course_code: courseId,
        course_name: courseId,
        credits,
        is_elective: false,
      },
    };
  }

  function services(rows: ReturnType<typeof makeEnrollment>[]) {
    const query = jest.fn().mockResolvedValue([]);
    query.mockResolvedValueOnce(rows);
    const history = new MarksHistoryService({ query } as unknown as DataSource);
    const find = jest.fn().mockResolvedValue(rows);
    const dashboard = Object.create(
      AcademicsService.prototype,
    ) as AcademicsService;
    Object.assign(dashboard, { courseEnrollments: { find } });
    return { query, find, history, dashboard };
  }

  it('returns identical overall GPA and earned credits with failed and ongoing semesters', async () => {
    const { history, dashboard, find, query } = services([
      makeEnrollment('C1', 1, 4, '9', 'COMPLETED'),
      makeEnrollment('C2', 2, 2, '0', 'FAILED'),
      makeEnrollment('C3', 3, 10, null, 'ENROLLED'),
    ]);
    const result = await history.getHistory(tenantId, studentId);
    const metrics = await dashboard.getDashboardMetrics(studentId, tenantId);
    expect(result.cgpa).toBe(6);
    expect(metrics.cgpa).toBe(result.cgpa);
    expect(metrics.credits_completed).toBe(result.total_credits_earned);
    expect(metrics.credits_attempted).toBe(result.total_credits_attempted);
    expect(result.total_credits_earned).toBe(4);
    expect(result.semesters).toEqual([
      expect.objectContaining({
        semester_number: 1,
        sgpa: 9,
        credits_attempted: 4,
        credits_earned: 4,
      }),
      expect.objectContaining({
        semester_number: 2,
        sgpa: 0,
        credits_attempted: 2,
        credits_earned: 0,
      }),
      expect.objectContaining({
        semester_number: 3,
        sgpa: null,
        credits_attempted: 0,
        credits_earned: 0,
      }),
    ]);
    expect(result.semesters[0].courses[0]).toMatchObject({ grade_points: 9 });
    expect(result.semesters[2].courses[0]).toMatchObject({
      grade: '—',
      grade_points: null,
    });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          student_user_id: studentId,
          tenant_id: tenantId,
          course: { tenant_id: tenantId },
        },
      }),
    );
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('e.deleted_at IS NULL AND c.deleted_at IS NULL'),
      [tenantId, studentId],
    );
    expect(query).toHaveBeenLastCalledWith(
      expect.stringContaining(
        "THEN payload ELSE jsonb_build_object('result_stage', payload->>'result_stage')",
      ),
      [tenantId, studentId],
    );
  });

  it('returns null consistently when no completed or failed results exist', async () => {
    const { history, dashboard } = services([
      makeEnrollment('C1', 1, 4, null, 'ENROLLED'),
    ]);
    expect((await history.getHistory(tenantId, studentId)).cgpa).toBeNull();
    expect(
      (await dashboard.getDashboardMetrics(studentId, tenantId)).cgpa,
    ).toBeNull();
  });

  it('preserves the existing seeded result as calculated data, not a hardcoded value', async () => {
    const { history, dashboard } = services([
      makeEnrollment('C1', 1, 4, '9', 'COMPLETED'),
      makeEnrollment('C2', 1, 4, '6', 'COMPLETED'),
    ]);
    const result = await history.getHistory(tenantId, studentId);
    expect(result.cgpa).toBe(7.5);
    expect(result.total_credits_earned).toBe(8);
    expect(
      (await dashboard.getDashboardMetrics(studentId, tenantId)).cgpa,
    ).toBe(7.5);
  });
});
