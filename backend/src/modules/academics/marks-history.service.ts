import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const COMPONENT_LABELS: Record<string, string> = {
  DA1: 'Digital Assignment 1 (DA-1)',
  DA2: 'Digital Assignment 2 (DA-2)',
  CAT1: 'Mid-Term (CAT-1)',
  CAT2: 'Mid-Term (CAT-2)',
  QUIZ: 'Quiz',
  INTERNAL: 'Internal Assessment',
  END_TERM: 'End-Term',
  ASSIGNMENT: 'Digital Assignment 1 (DA-1)',
};

@Injectable()
export class MarksHistoryService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getHistory(tenantId: string, studentUserId: string) {
    const enrollments = await this.dataSource.query(
      `SELECT e.enrollment_id, e.semester, e.grade, e.grade_points, e.status,
              c.course_id, c.course_code, c.course_name, c.credits, c.is_elective
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1 AND e.student_user_id = $2
       ORDER BY e.semester, c.course_code`,
      [tenantId, studentUserId],
    );

    const publishedMarks = await this.dataSource
      .query(
        `SELECT m.course_id, m.exam_type, m.marks_obtained, m.max_marks, e.semester
         FROM academic_marks m
         JOIN student_course_enrollments e
           ON e.course_id = m.course_id AND e.student_user_id = m.student_user_id
         WHERE m.student_user_id = $1 AND m.tenant_id = $2 AND m.status = 'PUBLISHED'
         ORDER BY e.semester, m.course_id, m.exam_type`,
        [studentUserId, tenantId],
      )
      .catch(() => []);

    const assignmentMarks = await this.dataSource
      .query(
        `SELECT a.course_id, a.title, s.marks_awarded, a.max_marks, e.semester, s.submitted_at
         FROM assignment_submissions s
         JOIN academic_assignments a ON a.assignment_id = s.assignment_id
         JOIN student_course_enrollments e
           ON e.course_id = a.course_id AND e.student_user_id = s.student_user_id
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
        points: number;
        completedCredits: number;
        courses: unknown[];
      }
    >();

    for (const row of enrollments) {
      const sem = Number(row.semester);
      if (!semesterMap.has(sem)) {
        semesterMap.set(sem, {
          semester_number: sem,
          credits: 0,
          points: 0,
          completedCredits: 0,
          courses: [],
        });
      }
      const bucket = semesterMap.get(sem)!;
      const credits = Number(row.credits);
      bucket.credits += credits;

      const grade = row.grade ?? '—';
      const status = row.status === 'FAILED' ? 'FAIL' : row.status === 'COMPLETED' ? 'PASS' : 'IN_PROGRESS';

      if (row.status === 'COMPLETED' && row.grade_points != null) {
        bucket.points += Number(row.grade_points) * credits;
        bucket.completedCredits += credits;
      }

      bucket.courses.push({
        course_id: row.course_id,
        course_code: row.course_code,
        course_name: row.course_name,
        course_type: this.inferCourseType(row),
        credits,
        grade,
        status,
      });
    }

    const semesters = [...semesterMap.values()]
      .sort((a, b) => a.semester_number - b.semester_number)
      .map((sem) => ({
        semester_number: sem.semester_number,
        sgpa:
          sem.completedCredits > 0
            ? Number((sem.points / sem.completedCredits).toFixed(2))
            : 0,
        credits: sem.credits,
        courses: sem.courses,
      }));

    const totalCreditsEarned = semesters.reduce((s, sem) => {
      return (
        s +
        (sem.courses as { status: string; credits: number }[])
          .filter((c) => c.status === 'PASS')
          .reduce((sum, c) => sum + c.credits, 0)
      );
    }, 0);

    let cgpaPoints = 0;
    let cgpaCredits = 0;
    for (const row of enrollments) {
      if (row.status === 'COMPLETED' && row.grade_points != null) {
        cgpaPoints += Number(row.grade_points) * Number(row.credits);
        cgpaCredits += Number(row.credits);
      }
    }
    const cgpa = cgpaCredits > 0 ? Number((cgpaPoints / cgpaCredits).toFixed(2)) : 0;

    const componentBySemester = this.buildComponentMarks(
      enrollments,
      publishedMarks,
      assignmentMarks,
    );

    const uncleared = enrollments
      .filter((r: { status: string }) => r.status === 'FAILED')
      .map((r: { course_id: string; course_code: string; course_name: string }) => ({
        course_id: r.course_id,
        course_code: r.course_code,
        course_name: r.course_name,
      }));

    const failedCodes = new Set(uncleared.map((b) => b.course_code));
    const cleared = enrollments
      .filter(
        (r: { status: string; course_code: string }) =>
          r.status === 'COMPLETED' && failedCodes.has(r.course_code),
      )
      .map((r: { course_code: string; course_name: string }) => ({
        course_code: r.course_code,
        course_name: r.course_name,
      }));

    return {
      cgpa,
      total_credits_earned: totalCreditsEarned,
      semesters,
      component_marks_by_semester: componentBySemester,
      backlogs: {
        uncleared,
        cleared,
      },
    };
  }

  private inferCourseType(row: { course_code: string; credits: number; is_elective: boolean }) {
    const code = row.course_code.toUpperCase();
    if (code.includes('LAB') || Number(row.credits) <= 1) return 'Lab';
    if (code.includes('PROJ') || code.includes('MINI')) return 'Project';
    return 'Theory';
  }

  private buildComponentMarks(
    enrollments: { course_id: string; course_code: string; course_name: string; semester: number }[],
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
    const semesters = [...new Set(enrollments.map((e) => Number(e.semester)))].sort((a, b) => a - b);

    return semesters.map((semesterNumber) => {
      const coursesInSem = enrollments.filter((e) => Number(e.semester) === semesterNumber);
      const subjects = coursesInSem.map((course) => {
        const examRows = publishedMarks.filter(
          (m) => m.course_id === course.course_id && Number(m.semester) === semesterNumber,
        );
        const assignRows = assignmentMarks.filter(
          (m) => m.course_id === course.course_id && Number(m.semester) === semesterNumber,
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

        const order = ['DA1', 'DA2', 'ASSIGNMENT', 'CAT1', 'CAT2', 'QUIZ', 'INTERNAL', 'END_TERM'];
        components.sort((a, b) => {
          const ai = order.findIndex((k) => a.key.startsWith(k));
          const bi = order.findIndex((k) => b.key.startsWith(k));
          return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        });

        const totalObtained = components.reduce((s, c) => s + c.marks_obtained, 0);
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
