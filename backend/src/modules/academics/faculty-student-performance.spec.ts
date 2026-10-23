import { ForbiddenException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';
import { facultyAttendanceStatsCte } from './faculty-attendance-sql';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty student performance data contract', () => {
  const tenantId = '10000000-0000-4000-8000-000000000001';
  const facultyId = '20000000-0000-4000-8000-000000000001';
  const courseId = '30000000-0000-4000-8000-000000000001';
  const studentId = '40000000-0000-4000-8000-000000000001';
  const query = jest.fn();
  const assertFacultyOwnsCourse = jest.fn();
  const student = { student_user_id: studentId, name: 'Student One' };
  let stats: Record<string, unknown>;
  let academic: Record<string, unknown>[];
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.resetAllMocks();
    stats = {
      course_id: courseId, course_code: 'COURSE1', course_name: 'Course One',
      internal_avg_percent: null, published_assessment_count: 0,
      attendance_percent: null, attendance_record_count: 0,
      class_average_percent: null, class_rank: null, class_size: 3, graded_student_count: 0,
      assignments_total: 0, assignments_submitted: 0, assignments_graded: 0,
      graded_assignment_avg_percent: null, marks: [],
    };
    academic = [];
    query.mockImplementation(async (sql: string) => {
      if (sql.includes('ranked AS')) return [stats];
      if (sql.startsWith('SELECT u.user_id AS student_user_id')) return [student];
      if (sql.includes('FROM academic_records')) return academic;
      return [];
    });
    assertFacultyOwnsCourse.mockResolvedValue(undefined);
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query }, assertFacultyOwnsCourse,
      loadStudentGpaHistory: jest.fn().mockResolvedValue([]),
    });
  });

  it('keeps missing marks and attendance unknown without inventing failure or rank', async () => {
    const result = await service.getFacultySubjectStudentReport(facultyId, tenantId, courseId, studentId);
    expect(result.summary).toEqual(expect.objectContaining({
      internal_avg_percent: null, published_assessment_count: 0,
      attendance_percent: null, attendance_record_count: 0,
      class_average_percent: null, class_rank: null, class_size: 3, graded_student_count: 0,
      graded_assignment_avg_percent: null,
    }));
    expect(result.risk_flags).toEqual([]);
  });

  it('retains recorded zero marks and attendance as real academic risks', async () => {
    Object.assign(stats, {
      internal_avg_percent: 0, published_assessment_count: 1,
      attendance_percent: 0, attendance_record_count: 2,
      class_average_percent: 0, class_rank: 1,
      graded_assignment_avg_percent: 0, assignments_graded: 1,
    });
    const result = await service.getFacultySubjectStudentReport(facultyId, tenantId, courseId, studentId);
    expect(result.summary.internal_avg_percent).toBe(0);
    expect(result.summary.attendance_percent).toBe(0);
    expect(result.summary.class_rank).toBe(1);
    expect(result.summary.graded_assignment_avg_percent).toBe(0);
    expect(result.risk_flags.map(flag => flag.label)).toEqual(['Low published marks', 'Critical attendance']);
  });

  it('does not label an ungraded student below a measured class average', async () => {
    stats.class_average_percent = 80;
    const result = await service.getFacultySubjectStudentReport(facultyId, tenantId, courseId, studentId);
    expect(result.summary.class_average_percent).toBe(80);
    expect(result.summary.class_rank).toBeNull();
    expect(result.risk_flags).toEqual([]);
  });

  it('preserves weighted score precision and nullable GPA while retaining actual GPA zero', async () => {
    Object.assign(stats, { internal_avg_percent: '41.90', published_assessment_count: 2 });
    academic = [{ semester: 1, sgpa: null, cgpa: 0, backlog_count: 0 }];
    const result = await service.getFacultySubjectStudentReport(facultyId, tenantId, courseId, studentId);
    expect(result.summary.internal_avg_percent).toBe(41.9);
    expect(result.academic?.sgpa).toBeNull();
    expect(result.academic?.cgpa).toBe(0);
    expect(result.gpa_history[0]).toEqual(expect.objectContaining({ sgpa: null, cgpa: 0 }));
  });

  it('keeps detail access checks before reading student data', async () => {
    assertFacultyOwnsCourse.mockRejectedValue(new ForbiddenException());
    await expect(service.getFacultySubjectStudentReport(facultyId, tenantId, courseId, studentId))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });

  it('uses the same weighted, valid published marks and recorded attendance in subject search', async () => {
    await service.searchFacultySubjectStudents(facultyId, tenantId, courseId, 'Student');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('SUM(m.marks_obtained)::numeric / NULLIF(SUM(m.max_marks), 0)');
    expect(sql).toContain("m.status = 'PUBLISHED'");
    expect(sql).toContain("(to_jsonb(m)->>'deleted_at') IS NULL");
    expect(sql).toContain('m.marks_obtained BETWEEN 0 AND m.max_marks');
    expect(sql).toContain('published_assessment_count');
    expect(sql).toContain('attendance_record_count');
    expect(sql).not.toContain('e.attendance_percent');
    expect(sql).toContain("(to_jsonb(e)->>'deleted_at') IS NULL");
    expect(sql).toContain("(to_jsonb(enrolled)->>'deleted_at') IS NULL");
    expect(params).toEqual([tenantId, facultyId, courseId, '%student%', 25]);
  });

  it('preserves department-only student search scope', async () => {
    query.mockResolvedValueOnce([{ dept_id: 17 }]).mockResolvedValueOnce([]);
    await service.searchDepartmentStudents(facultyId, tenantId, 'Student');
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain('u.dept_id = $2');
    expect(sql).toContain('u.tenant_id = e.tenant_id');
    expect(sql).not.toContain('e.attendance_percent');
    expect(sql).toContain("(to_jsonb(e)->>'deleted_at') IS NULL");
    expect(params).toEqual([tenantId, 17, '%student%', 25]);
  });

  it('uses nullable measured marks and attendance in the general analytics endpoint too', async () => {
    await service.getStudentAnalytics(facultyId, tenantId, courseId);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('published_mark_stats AS');
    expect(sql).toContain('attendance_stats AS');
    expect(sql).not.toContain('e.attendance_percent');
    expect(sql).toContain('NULLS LAST');
    expect(params).toEqual([tenantId, facultyId, courseId]);
  });
});

describe('Faculty student GPA history missing values', () => {
  const query = jest.fn();
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query },
    });
  });

  it('does not replace a missing grade card GPA with zero', async () => {
    query.mockResolvedValueOnce([{ semester: 1, sgpa: null, cgpa: '0', source: 'grade_card' }]);
    const result = await (service as any).loadStudentGpaHistory('tenant', 'student');
    expect(result[0]).toEqual(expect.objectContaining({ sgpa: null, cgpa: 0 }));
    expect(query.mock.calls[0][0]).not.toContain('g.cgpa, 0');
  });

  it('does not replace a missing academic record GPA with zero', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ semester: 1, sgpa: null, cgpa: null }]);
    const result = await (service as any).loadStudentGpaHistory('tenant', 'student');
    expect(result[0]).toEqual(expect.objectContaining({ sgpa: null, cgpa: null }));
  });

  it.each([
    [0, null],
    [3, 0],
  ])('preserves undefined GPA and genuine zero with %s credits', async (credits, expected) => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ semester: 1, grade_points: 0, credits }]);
    const result = await (service as any).loadStudentGpaHistory('tenant', 'student');
    expect(result[0]).toEqual(expect.objectContaining({ sgpa: expected, cgpa: expected }));
  });
});

describe('Shared faculty attendance SQL', () => {
  it('exposes consistent course/student counts and excludes deleted or invalid status entries', () => {
    const sql = facultyAttendanceStatsCte('$1', '$3');
    expect(sql).toContain('cal.tenant_id = $1');
    expect(sql).toContain('cal.course_id = $3');
    expect(sql).toContain('attendance_present_count');
    expect(sql).toContain("('PRESENT', 'ABSENT', 'LATE', 'EXCUSED')");
    expect(sql).toContain('cal.deleted_at IS NULL');
  });
});
