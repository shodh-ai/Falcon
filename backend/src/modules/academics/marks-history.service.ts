import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  calculateStudentGradeSummary,
  studentGradePoints,
  type StudentGradeRow,
} from './student-grade-summary';

type HistoryEnrollment = StudentGradeRow & {
  enrollment_id: string;
  semester: number;
  grade: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  is_elective: boolean;
};

const COMPONENT_LABELS: Record<string, string> = {
  DA1: 'Digital Assignment 1 (DA-1)',
  DA2: 'Digital Assignment 2 (DA-2)',
  CAT1: 'Mid-Term (CAT-1)',
  CAT2: 'Mid-Term (CAT-2)',
  QUIZ: 'Quiz',
  INTERNAL: 'Internal Assessment',
  END_TERM: 'End-Term',
  ASSIGNMENT: 'Digital Assignment 1 (DA-1)',
  WT1: 'Weekly Test 1 (WT-1)',
  WT2: 'Weekly Test 2 (WT-2)',
  GA1: 'Graded Assignment 1 (GA-1)',
  GA2: 'Graded Assignment 2 (GA-2)',
  MTE1: 'Mid Term Exam 1 (MTE-1)',
  MTE2: 'Mid Term Exam 2 (MTE-2)',
  ETE: 'End Term Exam (ETE)',
};

@Injectable()
export class MarksHistoryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getPublishedExamReports(tenantId: string, studentUserId: string) {
    return this.dataSource.query(
      `SELECT r.report_id AS result_id, r.session_id, r.student_user_id, r.course_id,
              r.exam_type, r.marks_obtained, r.max_marks, r.percent,
              r.grade, r.grade AS grade_letter, r.grade_points, r.result_status,
              r.report_summary, r.declared_at,
              sub.subject_id, c.course_code, c.course_name,
              s.declaration_note, s.semester
       FROM student_exam_reports r
       JOIN academic_courses c
         ON c.course_id = r.course_id AND c.tenant_id = r.tenant_id
       JOIN exam_result_sessions s
         ON s.session_id = r.session_id AND s.tenant_id = r.tenant_id
       LEFT JOIN LATERAL (
         SELECT subject_id
         FROM academic_subjects
         WHERE subject_code = c.course_code
            OR c.course_name ILIKE subject_name
         ORDER BY CASE WHEN subject_code = c.course_code THEN 0 ELSE 1 END
         LIMIT 1
       ) sub ON TRUE
       WHERE r.tenant_id = $1 AND r.student_user_id = $2
         AND r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL
       ORDER BY r.declared_at DESC`,
      [tenantId, studentUserId],
    );
  }

  async getHistory(tenantId: string, studentUserId: string) {
    const enrollments = await this.dataSource.query<HistoryEnrollment[]>(
      `SELECT e.enrollment_id, e.semester, e.grade, e.grade_points, e.status,
              c.course_id, c.course_code, c.course_name, c.credits, c.is_elective
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.student_user_id = $2
         AND e.deleted_at IS NULL AND c.deleted_at IS NULL
       ORDER BY e.semester, c.course_code`,
      [tenantId, studentUserId],
    );

    const publishedMarks = await this.dataSource
      .query(
        `SELECT m.course_id, m.exam_type, m.marks_obtained, m.max_marks, e.semester
         FROM academic_marks m
         JOIN student_course_enrollments e
           ON e.course_id = m.course_id AND e.student_user_id = m.student_user_id AND e.tenant_id = m.tenant_id
         WHERE m.student_user_id = $1 AND m.tenant_id = $2 AND m.status = 'PUBLISHED'
         ORDER BY e.semester, m.course_id, m.exam_type`,
        [studentUserId, tenantId],
      )
      .catch(() => []);

    const assignmentMarks = await this.dataSource
      .query(
        `SELECT a.course_id, a.title, s.marks_awarded, a.max_marks, e.semester, s.submitted_at
         FROM assignment_submissions s
         JOIN academic_assignments a ON a.assignment_id = s.assignment_id AND a.tenant_id = s.tenant_id
         JOIN student_course_enrollments e
           ON e.course_id = a.course_id AND e.student_user_id = s.student_user_id AND e.tenant_id = s.tenant_id
         WHERE s.student_user_id = $1 AND s.tenant_id = $2 AND s.marks_awarded IS NOT NULL
         ORDER BY e.semester, a.course_id, s.submitted_at`,
        [studentUserId, tenantId],
      )
      .catch(() => []);

    const semesterMap = new Map<
      number,
      {
        semester_number: number;
        credits: number;
        enrollments: HistoryEnrollment[];
        courses: unknown[];
      }
    >();

    for (const row of enrollments) {
      const sem = Number(row.semester);
      if (!semesterMap.has(sem)) {
        semesterMap.set(sem, {
          semester_number: sem,
          credits: 0,
          enrollments: [],
          courses: [],
        });
      }
      const bucket = semesterMap.get(sem)!;
      const credits = Number(row.credits);
      bucket.credits += credits;

      const grade = row.status === 'ENROLLED' ? '—' : (row.grade ?? '—');
      const status =
        row.status === 'FAILED'
          ? 'FAIL'
          : row.status === 'COMPLETED'
            ? 'PASS'
            : 'IN_PROGRESS';

      bucket.enrollments.push(row);

      bucket.courses.push({
        course_id: row.course_id,
        course_code: row.course_code,
        course_name: row.course_name,
        course_type: this.inferCourseType(row),
        credits,
        grade,
        grade_points: studentGradePoints(row),
        status,
      });
    }

    const semesters = [...semesterMap.values()]
      .sort((a, b) => a.semester_number - b.semester_number)
      .map((sem) => {
        const grades = calculateStudentGradeSummary(sem.enrollments);
        return {
          semester_number: sem.semester_number,
          sgpa: grades.gpa,
          credits: sem.credits,
          credits_attempted: grades.attemptedCredits,
          credits_earned: grades.earnedCredits,
          courses: sem.courses,
        };
      });
    const grades = calculateStudentGradeSummary(enrollments);

    const componentBySemester = this.buildComponentMarks(
      enrollments,
      publishedMarks,
      assignmentMarks,
    );

    const uncleared = enrollments
      .filter((r: { status: string }) => r.status === 'FAILED')
      .map(
        (r: {
          course_id: string;
          course_code: string;
          course_name: string;
          semester: number;
        }) => ({
          course_id: r.course_id,
          course_code: r.course_code,
          course_name: r.course_name,
          semester: Number(r.semester),
        }),
      );

    const failedCodes = new Set(uncleared.map((b) => b.course_code));
    const cleared = enrollments
      .filter(
        (r: { status: string; course_code: string }) =>
          r.status === 'COMPLETED' && failedCodes.has(r.course_code),
      )
      .map(
        (r: {
          course_code: string;
          course_name: string;
          semester: number;
        }) => ({
          course_code: r.course_code,
          course_name: r.course_name,
          semester: Number(r.semester),
        }),
      );

    const examReports = await this.getPublishedExamReports(
      tenantId,
      studentUserId,
    );

    const gradeCards = await this.dataSource
      .query(
        `SELECT grade_card_id, semester,
                CASE WHEN status = 'PUBLISHED' AND COALESCE(payload->>'result_stage', '') <> 'DRAFT'
                  THEN cgpa ELSE NULL END AS cgpa,
                status, published_at,
                CASE WHEN status = 'PUBLISHED' AND COALESCE(payload->>'result_stage', '') <> 'DRAFT'
                  THEN payload ELSE jsonb_build_object('result_stage', payload->>'result_stage') END AS payload
         FROM grade_cards
         WHERE tenant_id = $1 AND student_user_id = $2
         ORDER BY semester DESC, created_at DESC`,
        [tenantId, studentUserId],
      )
      .catch(() => []);

    return {
      cgpa: grades.gpa,
      total_credits_earned: grades.earnedCredits,
      total_credits_attempted: grades.attemptedCredits,
      semesters,
      component_marks_by_semester: componentBySemester,
      exam_reports: examReports,
      grade_cards: gradeCards,
      backlogs: {
        uncleared,
        cleared,
      },
    };
  }

  private inferCourseType(row: {
    course_code: string;
    credits: number | string | null;
    is_elective: boolean;
  }) {
    const code = row.course_code.toUpperCase();
    if (code.includes('LAB') || Number(row.credits) <= 1) return 'Lab';
    if (code.includes('PROJ') || code.includes('MINI')) return 'Project';
    return 'Theory';
  }

  private buildComponentMarks(
    enrollments: {
      course_id: string;
      course_code: string;
      course_name: string;
      semester: number;
    }[],
    publishedMarks: {
      course_id: string;
      exam_type: string;
      marks_obtained: string;
      max_marks: number;
      semester: number;
    }[],
    assignmentMarks: {
      course_id: string;
      title: string;
      marks_awarded: string;
      max_marks: number;
      semester: number;
    }[],
  ) {
    const semesters = [
      ...new Set(enrollments.map((e) => Number(e.semester))),
    ].sort((a, b) => a - b);

    return semesters.map((semesterNumber) => {
      const coursesInSem = enrollments.filter(
        (e) => Number(e.semester) === semesterNumber,
      );
      const subjects = coursesInSem.map((course) => {
        const examRows = publishedMarks.filter(
          (m) =>
            m.course_id === course.course_id &&
            Number(m.semester) === semesterNumber,
        );
        const assignRows = assignmentMarks.filter(
          (m) =>
            m.course_id === course.course_id &&
            Number(m.semester) === semesterNumber,
        );

        const components: {
          key: string;
          label: string;
          marks_obtained: number;
          max_marks: number;
        }[] = [];

        let daIndex = 1;
        for (const m of examRows) {
          let label = COMPONENT_LABELS[m.exam_type] ?? m.exam_type;
          if (m.exam_type === 'ASSIGNMENT') {
            label = `Digital Assignment ${daIndex} (DA-${daIndex})`;
            daIndex += 1;
          }
          components.push({
            key: `${m.exam_type}-${components.length}`,
            label,
            marks_obtained: Number(m.marks_obtained),
            max_marks: Number(m.max_marks),
          });
        }

        for (const a of assignRows) {
          if (components.some((c) => c.label.includes(a.title))) continue;
          const idx = daIndex;
          components.push({
            key: `da-sub-${idx}`,
            label: a.title?.match(/DA|Assignment/i)
              ? a.title
              : `Digital Assignment ${idx} (DA-${idx})`,
            marks_obtained: Number(a.marks_awarded),
            max_marks: Number(a.max_marks) || 20,
          });
          daIndex += 1;
        }

        const order = [
          'DA1',
          'DA2',
          'ASSIGNMENT',
          'CAT1',
          'CAT2',
          'QUIZ',
          'INTERNAL',
          'END_TERM',
          'WT1',
          'WT2',
          'GA1',
          'GA2',
          'MTE1',
          'MTE2',
          'ETE',
        ];
        components.sort((a, b) => {
          const ai = order.findIndex((k) => a.key.startsWith(k));
          const bi = order.findIndex((k) => b.key.startsWith(k));
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        const totalObtained = components.reduce(
          (s, c) => s + c.marks_obtained,
          0,
        );
        const totalMax = components.reduce((s, c) => s + c.max_marks, 0);

        return {
          course_id: course.course_id,
          course_code: course.course_code,
          course_name: course.course_name,
          components,
          total_internal_obtained: totalObtained,
          total_internal_max: totalMax,
        };
      });

      return {
        semester_number: semesterNumber,
        subjects,
      };
    });
  }
}
