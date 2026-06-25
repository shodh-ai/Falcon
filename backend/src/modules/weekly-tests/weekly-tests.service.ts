import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class WeeklyTestsService {
  private readonly logger = new Logger(WeeklyTestsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createTest(
    tenantId: string,
    facultyId: string,
    data: {
      course_id: string;
      test_type: 'WT1' | 'WT2';
      question_paper_url: string;
      answer_key: string[]; // ['A', 'B', 'C', 'D', ...] 10 items
      start_time: string;
      end_time: string;
    },
  ) {
    const res = await this.dataSource.query(
      `INSERT INTO weekly_tests (tenant_id, course_id, test_type, question_paper_url, answer_key, start_time, end_time, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED')
       RETURNING test_id`,
      [
        tenantId,
        data.course_id,
        data.test_type,
        data.question_paper_url,
        JSON.stringify(data.answer_key),
        data.start_time,
        data.end_time,
        facultyId,
      ],
    );
    return { success: true, test_id: res[0].test_id };
  }

  async getFacultyTests(tenantId: string, facultyId: string) {
    return this.dataSource.query(
      `SELECT t.test_id, t.course_id, c.course_code, c.course_name, t.test_type, t.start_time, t.end_time, t.status
       FROM weekly_tests t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.tenant_id = $1 AND t.created_by = $2
       ORDER BY t.created_at DESC`,
      [tenantId, facultyId]
    );
  }

  async deleteTest(tenantId: string, facultyId: string, testId: string) {
    const test = await this.dataSource.query(
      `SELECT start_time FROM weekly_tests WHERE test_id = $1 AND tenant_id = $2 AND created_by = $3`,
      [testId, tenantId, facultyId]
    );
    if (!test.length) {
      throw new NotFoundException('Test not found or unauthorized');
    }
    if (new Date(test[0].start_time) <= new Date()) {
      throw new BadRequestException('Cannot delete a test that has already started');
    }
    await this.dataSource.query(
      `DELETE FROM weekly_tests WHERE test_id = $1`,
      [testId]
    );
    return { success: true };
  }

  async getAvailableTests(tenantId: string, studentId: string) {
    // Return ACTIVE and SCHEDULED tests for courses the student is enrolled in
    return this.dataSource.query(
      `SELECT t.test_id, t.course_id, c.course_code, c.course_name, t.test_type, t.start_time, t.end_time, t.status,
              r.submitted_at
       FROM weekly_tests t
       -- JOIN student_course_enrollments e ON e.course_id = t.course_id AND e.student_user_id = $2
       JOIN academic_courses c ON c.course_id = t.course_id
       LEFT JOIN weekly_test_responses r ON r.test_id = t.test_id AND r.student_user_id = $2
       WHERE t.tenant_id = $1 AND t.status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')
       ORDER BY t.start_time ASC`,
      [tenantId, studentId],
    );
  }

  async getTestForAttempt(tenantId: string, studentId: string, testId: string) {
    const test = await this.dataSource.query(
      `SELECT t.test_id, t.course_id, t.test_type, t.question_paper_url, t.start_time, t.end_time, t.status
       FROM weekly_tests t
       JOIN student_course_enrollments e ON e.course_id = t.course_id AND e.student_user_id = $2
       WHERE t.test_id = $3 AND t.tenant_id = $1`,
      [tenantId, studentId, testId],
    );

    if (!test.length) {
      throw new NotFoundException('Test not found or unauthorized');
    }

    const testData = test[0];
    const now = new Date();
    if (new Date(testData.start_time) > now) {
      throw new BadRequestException('Test has not started yet');
    }
    if (new Date(testData.end_time) < now || testData.status === 'COMPLETED') {
      throw new BadRequestException('Test has ended');
    }

    const resp = await this.dataSource.query(
      `SELECT submitted_at FROM weekly_test_responses WHERE test_id = $1 AND student_user_id = $2`,
      [testId, studentId],
    );

    if (resp.length && resp[0].submitted_at) {
      throw new BadRequestException('Test already submitted');
    }

    return test[0];
  }

  async submitTest(
    tenantId: string,
    studentId: string,
    testId: string,
    data: { answers: string[]; violation_count: number },
  ) {
    const test = await this.dataSource.query(
      `SELECT answer_key, end_time FROM weekly_tests WHERE test_id = $1 AND tenant_id = $2`,
      [testId, tenantId],
    );

    if (!test.length) throw new Error('Test not found');

    const answerKey = test[0].answer_key as string[];
    let score = 0;
    for (let i = 0; i < answerKey.length; i++) {
      if (data.answers[i] === answerKey[i]) {
        score++;
      }
    }

    await this.dataSource.query(
      `INSERT INTO weekly_test_responses (test_id, student_user_id, answers, score, submitted_at, violation_count)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (test_id, student_user_id) DO UPDATE SET
         answers = EXCLUDED.answers,
         score = EXCLUDED.score,
         submitted_at = NOW(),
         violation_count = EXCLUDED.violation_count`,
      [testId, studentId, JSON.stringify(data.answers), score, data.violation_count],
    );

    return { success: true, score };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async handleAutoGradeAndPublish() {
    try {
      const tableExists = await this.dataSource.query(
        `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'weekly_tests') AS exists`,
      );
      if (!tableExists[0]?.exists) return;

      // 1. Update tests whose end_time has passed to COMPLETED
      await this.dataSource.query(
        `UPDATE weekly_tests SET status = 'COMPLETED' WHERE status IN ('SCHEDULED', 'ACTIVE') AND end_time < NOW()`
      );

      // 2. Fetch all COMPLETED tests to auto-submit 0s for missing responses and push marks
      const testsToPublish = await this.dataSource.query(
        `SELECT test_id, tenant_id, course_id, test_type FROM weekly_tests WHERE status = 'COMPLETED'`
      );

      for (const t of testsToPublish) {
        // Find enrolled students missing a response
        const missingStudents = await this.dataSource.query(
          `SELECT e.student_user_id FROM student_course_enrollments e
           WHERE e.course_id = $1
             AND NOT EXISTS (SELECT 1 FROM weekly_test_responses r WHERE r.test_id = $2 AND r.student_user_id = e.student_user_id)`,
          [t.course_id, t.test_id]
        );

        for (const s of missingStudents) {
          await this.dataSource.query(
            `INSERT INTO weekly_test_responses (test_id, student_user_id, answers, score, submitted_at, violation_count)
             VALUES ($1, $2, '[]'::jsonb, 0, NOW(), 0)`,
            [t.test_id, s.student_user_id]
          );
        }

        // Push all scores to academic_marks
        await this.dataSource.query(
          `INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at)
           SELECT t.tenant_id, r.student_user_id, t.course_id, t.test_type, r.score, 10, 'PUBLISHED', NOW()
           FROM weekly_test_responses r
           JOIN weekly_tests t ON t.test_id = r.test_id
           WHERE r.test_id = $1 AND r.submitted_at IS NOT NULL
           ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
             marks_obtained = EXCLUDED.marks_obtained,
             status = 'PUBLISHED',
             published_at = NOW()`,
          [t.test_id]
        );
      }
    } catch (e) {
      this.logger.error('Error in auto-grade cron', e);
    }
  }
}
