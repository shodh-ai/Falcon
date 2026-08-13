import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class WeeklyTestsService {
  private readonly logger = new Logger(WeeklyTestsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  async createTest(
    tenantId: string,
    facultyId: string,
    data: {
      course_id: string;
      test_type: 'WT1' | 'WT2';
      question_paper_url: string;
      answer_key: string[];
      start_time: string;
      end_time: string;
    },
  ) {
    const res = await this.dataSource.query(
      `INSERT INTO weekly_tests (tenant_id, course_id, test_type, question_paper_url, answer_key, start_time, end_time, created_by, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'SCHEDULED')
       RETURNING test_id, course_id, test_type, start_time, end_time`,
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
    const row = res[0] as {
      test_id: string;
      course_id: string;
      test_type: string;
      start_time: string;
      end_time: string;
    };

    const notified_count = await this.notifyEnrolledStudents(tenantId, {
      testId: row.test_id,
      courseId: row.course_id,
      testType: row.test_type,
      startTime: new Date(row.start_time).toISOString(),
      endTime: new Date(row.end_time).toISOString(),
    });

    return { success: true, test_id: row.test_id, notified_count };
  }

  async getFacultyTests(tenantId: string, facultyId: string) {
    return this.dataSource.query(
      `SELECT t.test_id, t.course_id, c.course_code, c.course_name, t.test_type, t.start_time, t.end_time, t.status, t.is_active,
              (SELECT COUNT(*)::int FROM weekly_test_responses r WHERE r.test_id = t.test_id) AS response_count,
              (SELECT ROUND(AVG(r.score)::numeric, 2) FROM weekly_test_responses r WHERE r.test_id = t.test_id) AS avg_score
       FROM weekly_tests t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.tenant_id = $1 AND t.created_by = $2
       ORDER BY t.created_at DESC`,
      [tenantId, facultyId],
    );
  }

  async getFacultyTestResults(
    tenantId: string,
    facultyId: string,
    testId: string,
  ) {
    const test = await this.dataSource.query(
      `SELECT t.test_id, t.course_id, t.test_type, t.start_time, t.end_time, t.status, t.is_active,
              c.course_code, c.course_name
       FROM weekly_tests t
       JOIN academic_courses c ON c.course_id = t.course_id
       WHERE t.test_id = $1 AND t.tenant_id = $2 AND t.created_by = $3`,
      [testId, tenantId, facultyId],
    );
    if (!test.length) {
      throw new NotFoundException('Test not found or unauthorized');
    }

    const responses = await this.dataSource.query(
      `SELECT r.student_user_id, u.name AS student_name, u.official_email AS student_email,
              r.score, r.submitted_at, r.violation_count
       FROM weekly_test_responses r
       JOIN users u ON u.user_id = r.student_user_id
       WHERE r.test_id = $1
       ORDER BY r.submitted_at ASC NULLS LAST, u.name ASC`,
      [testId],
    );

    return { test: test[0], responses };
  }

  async deleteTest(tenantId: string, facultyId: string, testId: string) {
    const test = await this.dataSource.query(
      `SELECT start_time FROM weekly_tests WHERE test_id = $1 AND tenant_id = $2 AND created_by = $3`,
      [testId, tenantId, facultyId],
    );
    if (!test.length) {
      throw new NotFoundException('Test not found or unauthorized');
    }
    if (new Date(test[0].start_time) <= new Date()) {
      throw new BadRequestException(
        'Cannot delete a test that has already started',
      );
    }
    await this.dataSource.query(`DELETE FROM weekly_tests WHERE test_id = $1`, [
      testId,
    ]);
    return { success: true };
  }

  async toggleTestStatus(
    tenantId: string,
    facultyId: string,
    testId: string,
    isActive: boolean,
  ) {
    const test = await this.dataSource.query(
      `SELECT test_id, course_id, test_type, start_time, end_time
       FROM weekly_tests WHERE test_id = $1 AND tenant_id = $2 AND created_by = $3`,
      [testId, tenantId, facultyId],
    );
    if (!test.length) {
      throw new NotFoundException('Test not found or unauthorized');
    }
    await this.dataSource.query(
      `UPDATE weekly_tests SET is_active = $1 WHERE test_id = $2`,
      [isActive, testId],
    );

    let notified_count = 0;
    if (isActive) {
      const row = test[0] as {
        test_id: string;
        course_id: string;
        test_type: string;
        start_time: string;
        end_time: string;
      };
      notified_count = await this.notifyEnrolledStudents(tenantId, {
        testId: row.test_id,
        courseId: row.course_id,
        testType: row.test_type,
        startTime: new Date(row.start_time).toISOString(),
        endTime: new Date(row.end_time).toISOString(),
      });
    }

    return { success: true, notified_count };
  }

  async getAvailableTests(tenantId: string, studentId: string) {
    return this.dataSource.query(
      `SELECT t.test_id, t.course_id, c.course_code, c.course_name, t.test_type, t.start_time, t.end_time, t.status, t.is_active,
              r.submitted_at
       FROM weekly_tests t
       JOIN student_course_enrollments e ON e.course_id = t.course_id AND e.student_user_id = $2
       JOIN academic_courses c ON c.course_id = t.course_id
       LEFT JOIN weekly_test_responses r ON r.test_id = t.test_id AND r.student_user_id = $2
       WHERE t.tenant_id = $1 AND t.status IN ('SCHEDULED', 'ACTIVE', 'COMPLETED')
       ORDER BY t.start_time ASC`,
      [tenantId, studentId],
    );
  }

  async getTestForAttempt(tenantId: string, studentId: string, testId: string) {
    const test = await this.dataSource.query(
      `SELECT t.test_id, t.course_id, t.test_type, t.question_paper_url, t.start_time, t.end_time, t.status, t.is_active
       FROM weekly_tests t
       JOIN student_course_enrollments e ON e.course_id = t.course_id AND e.student_user_id = $2
       WHERE t.test_id = $3 AND t.tenant_id = $1`,
      [tenantId, studentId, testId],
    );

    if (!test.length) throw new NotFoundException('Test not found');
    const testData = test[0];
    if (!testData.is_active) {
      throw new BadRequestException('Test is currently inactive');
    }
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

    return testData;
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
    if (!test.length) throw new NotFoundException('Test not found');

    const answerKey = Array.isArray(test[0].answer_key)
      ? (test[0].answer_key as string[])
      : (JSON.parse(test[0].answer_key ?? '[]') as string[]);
    let score = 0;
    for (let i = 0; i < answerKey.length; i += 1) {
      if (data.answers[i] === answerKey[i]) score += 1;
    }

    await this.dataSource.query(
      `INSERT INTO weekly_test_responses (test_id, student_user_id, answers, score, submitted_at, violation_count)
       VALUES ($1, $2, $3, $4, NOW(), $5)
       ON CONFLICT (test_id, student_user_id) DO UPDATE SET
         answers = EXCLUDED.answers,
         score = EXCLUDED.score,
         submitted_at = NOW(),
         violation_count = EXCLUDED.violation_count`,
      [
        testId,
        studentId,
        JSON.stringify(data.answers),
        score,
        data.violation_count,
      ],
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

      await this.dataSource.query(
        `UPDATE weekly_tests SET status = 'COMPLETED' WHERE status IN ('SCHEDULED', 'ACTIVE') AND end_time < NOW()`,
      );

      const testsToPublish = await this.dataSource.query(
        `SELECT test_id, tenant_id, course_id, test_type FROM weekly_tests WHERE status = 'COMPLETED'`,
      );

      for (const t of testsToPublish) {
        const missingStudents = await this.dataSource.query(
          `SELECT e.student_user_id FROM student_course_enrollments e
           WHERE e.course_id = $1
             AND NOT EXISTS (SELECT 1 FROM weekly_test_responses r WHERE r.test_id = $2 AND r.student_user_id = e.student_user_id)`,
          [t.course_id, t.test_id],
        );

        for (const s of missingStudents) {
          await this.dataSource.query(
            `INSERT INTO weekly_test_responses (test_id, student_user_id, answers, score, submitted_at, violation_count)
             VALUES ($1, $2, '[]'::jsonb, 0, NOW(), 0)`,
            [t.test_id, s.student_user_id],
          );
        }

        await this.dataSource.query(
          `INSERT INTO academic_marks (tenant_id, student_user_id, course_id, exam_type, marks_obtained, max_marks, status, published_at)
           SELECT t.tenant_id, r.student_user_id, t.course_id, t.test_type, r.score, 5, 'PUBLISHED', NOW()
           FROM weekly_test_responses r
           JOIN weekly_tests t ON t.test_id = r.test_id
           WHERE r.test_id = $1 AND r.submitted_at IS NOT NULL
           ON CONFLICT (tenant_id, student_user_id, course_id, exam_type) DO UPDATE SET
             marks_obtained = EXCLUDED.marks_obtained,
             status = 'PUBLISHED',
             published_at = NOW()`,
          [t.test_id],
        );
      }
    } catch (e) {
      this.logger.error('Error in auto-grade cron', e);
    }
  }

  private async notifyEnrolledStudents(
    tenantId: string,
    input: {
      testId: string;
      courseId: string;
      testType: string;
      startTime: string;
      endTime: string;
    },
  ): Promise<number> {
    try {
      const courseRows = await this.dataSource.query(
        `SELECT course_code, course_name FROM academic_courses
         WHERE tenant_id = $1 AND course_id = $2 LIMIT 1`,
        [tenantId, input.courseId],
      );
      const course = courseRows[0] as
        | { course_code: string; course_name: string }
        | undefined;

      const enrolled = await this.dataSource.query(
        `SELECT student_user_id FROM student_course_enrollments
         WHERE tenant_id = $1 AND course_id = $2 AND status = 'ENROLLED'`,
        [tenantId, input.courseId],
      );

      let count = 0;
      for (const row of enrolled as Array<{ student_user_id: string }>) {
        this.notificationEmitter.weeklyTestPublished({
          tenantId,
          userId: row.student_user_id,
          testId: input.testId,
          courseId: input.courseId,
          courseName: course?.course_name ?? 'Course',
          courseCode: course?.course_code,
          testType: input.testType,
          startTime: input.startTime,
          endTime: input.endTime,
        });
        count += 1;
      }
      return count;
    } catch (err) {
      this.logger.error(
        `Weekly test notify failed for ${input.testId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return 0;
    }
  }
}
