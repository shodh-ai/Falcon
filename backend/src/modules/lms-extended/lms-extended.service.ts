import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class LmsExtendedService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationEmitter: NotificationEmitterService,
  ) {}

  private async assertCourseAccess(
    tenantId: string,
    courseId: string,
    userId: string,
    roles: string[],
    mode: 'READ' | 'TEACH',
    executor: { query: Function } = this.dataSource,
  ) {
    const [course] = await executor.query(
      `SELECT course_id FROM academic_courses WHERE tenant_id=$1 AND course_id=$2`,
      [tenantId, courseId],
    );
    if (!course) throw new NotFoundException('Course not found');
    if (roles.includes('SuperAdmin')) return;

    if (roles.includes('Student') && mode === 'READ') {
      const [enrollment] = await executor.query(
        `SELECT 1 FROM student_course_enrollments
          WHERE tenant_id=$1 AND course_id=$2 AND student_user_id=$3 AND status='ENROLLED'`,
        [tenantId, courseId, userId],
      );
      if (enrollment) return;
    }

    if (roles.includes('Faculty')) {
      const [allocation] = await executor.query(
        `SELECT 1
           FROM academic_courses c
          WHERE c.tenant_id=$1 AND c.course_id=$2
            AND (EXISTS (
              SELECT 1 FROM academic_course_allocations a
               WHERE a.tenant_id=c.tenant_id AND a.course_id=c.course_id
                 AND a.faculty_user_id=$3 AND a.status='ACTIVE'
            ) OR EXISTS (
              SELECT 1 FROM academic_timetables t
               WHERE t.tenant_id=c.tenant_id AND t.course_id=c.course_id
                 AND t.faculty_user_id=$3
            ))`,
        [tenantId, courseId, userId],
      );
      if (allocation) return;
    }

    if (roles.some((role) => role === 'HOD' || role === 'Dean')) {
      const [managed] = await executor.query(
        `SELECT 1
           FROM users actor
           JOIN departments actor_dept ON actor_dept.dept_id=actor.dept_id
          WHERE actor.tenant_id=$1 AND actor.user_id=$3
            AND EXISTS (
              SELECT 1
                FROM academic_course_allocations a
                JOIN users faculty ON faculty.user_id=a.faculty_user_id AND faculty.tenant_id=a.tenant_id
                JOIN departments course_dept ON course_dept.dept_id=faculty.dept_id
               WHERE a.tenant_id=$1 AND a.course_id=$2 AND a.status='ACTIVE'
                 AND (course_dept.dept_id=actor_dept.dept_id
                   OR ($4::boolean AND course_dept.school_id=actor_dept.school_id))
            )`,
        [tenantId, courseId, userId, roles.includes('Dean')],
      );
      if (managed) return;
    }

    throw new ForbiddenException('You do not have access to this course');
  }

  async createQuiz(
    tenantId: string,
    userId: string,
    roles: string[],
    dto: {
      course_id: string;
      title: string;
      time_limit_mins?: number;
      max_attempts?: number;
      browser_lock?: boolean;
      questions?: Array<{
        prompt: string;
        question_type?: string;
        points?: number;
        options?: Array<{ option_text: string; is_correct?: boolean }>;
      }>;
    },
  ) {
    return this.dataSource.transaction(async (manager) => {
      await this.assertCourseAccess(
        tenantId,
        dto.course_id,
        userId,
        roles,
        'TEACH',
        manager,
      );
      const quizRows = await manager.query(
        `INSERT INTO lms_quizzes (tenant_id, course_id, title, time_limit_mins, max_attempts, browser_lock, created_by, is_published)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING *`,
        [
          tenantId,
          dto.course_id,
          dto.title,
          dto.time_limit_mins ?? null,
          dto.max_attempts ?? 1,
          dto.browser_lock ?? false,
          userId,
        ],
      );
      const quiz = quizRows[0];
      for (const [idx, q] of (dto.questions ?? []).entries()) {
        const qRows = await manager.query(
          `INSERT INTO lms_questions (quiz_id, question_type, prompt, points, sort_order)
           VALUES ($1, $2, $3, $4, $5) RETURNING question_id`,
          [
            quiz.quiz_id,
            q.question_type ?? 'MCQ',
            q.prompt,
            q.points ?? 1,
            idx,
          ],
        );
        for (const opt of q.options ?? []) {
          await manager.query(
            `INSERT INTO lms_question_options (question_id, option_text, is_correct) VALUES ($1, $2, $3)`,
            [qRows[0].question_id, opt.option_text, opt.is_correct ?? false],
          );
        }
      }
      return quiz;
    });
  }

  async startAttempt(tenantId: string, quizId: string, studentUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`lms-attempt:${quizId}:${studentUserId}`],
      );
      const [quiz] = await manager.query(
        `SELECT q.* FROM lms_quizzes q
          WHERE q.tenant_id=$1 AND q.quiz_id=$2 AND q.is_published=true FOR UPDATE`,
        [tenantId, quizId],
      );
      if (!quiz) throw new NotFoundException('Quiz not found');
      await this.assertCourseAccess(
        tenantId,
        quiz.course_id,
        studentUserId,
        ['Student'],
        'READ',
        manager,
      );
      const [count] = await manager.query(
        `SELECT COUNT(*)::int AS c FROM lms_student_attempts WHERE quiz_id=$1 AND student_user_id=$2`,
        [quizId, studentUserId],
      );
      if (count.c >= quiz.max_attempts)
        throw new BadRequestException('Maximum attempts reached');
      const rows = await manager.query(
        `INSERT INTO lms_student_attempts (quiz_id, student_user_id) VALUES ($1, $2) RETURNING *`,
        [quizId, studentUserId],
      );
      return rows[0];
    });
  }

  async submitAttempt(
    attemptId: string,
    tenantId: string,
    studentUserId: string,
    answers: Array<{
      question_id: string;
      selected_option_id?: string;
      descriptive_answer?: string;
    }>,
    antiCheatEvents?: unknown[],
  ) {
    return this.dataSource.transaction(async (manager) => {
      const [attempt] = await manager.query(
        `SELECT a.*, q.tenant_id, q.course_id
           FROM lms_student_attempts a JOIN lms_quizzes q ON q.quiz_id=a.quiz_id
          WHERE a.attempt_id=$1 AND a.student_user_id=$2 AND q.tenant_id=$3 FOR UPDATE OF a`,
        [attemptId, studentUserId, tenantId],
      );
      if (!attempt) throw new NotFoundException('Attempt not found');
      if (attempt.status !== 'IN_PROGRESS')
        throw new BadRequestException('Attempt already submitted');
      await this.assertCourseAccess(
        tenantId,
        attempt.course_id,
        studentUserId,
        ['Student'],
        'READ',
        manager,
      );
      let total = 0;
      const seen = new Set<string>();
      for (const ans of answers) {
        if (seen.has(ans.question_id))
          throw new BadRequestException('Duplicate question answer');
        seen.add(ans.question_id);
        let isCorrect: boolean | null = null;
        let points = 0;
        if (ans.selected_option_id) {
          const optRows = await manager.query(
            `SELECT is_correct, q.points FROM lms_question_options o
           JOIN lms_questions q ON q.question_id = o.question_id
           WHERE o.option_id=$1 AND q.question_id=$2 AND q.quiz_id=$3`,
            [ans.selected_option_id, ans.question_id, attempt.quiz_id],
          );
          if (!optRows[0]) throw new BadRequestException('Invalid quiz answer');
          isCorrect = optRows[0].is_correct;
          points = isCorrect ? Number(optRows[0]?.points ?? 0) : 0;
          total += points;
        } else {
          const [question] = await manager.query(
            `SELECT 1 FROM lms_questions WHERE question_id=$1 AND quiz_id=$2`,
            [ans.question_id, attempt.quiz_id],
          );
          if (!question) throw new BadRequestException('Invalid quiz question');
        }
        await manager.query(
          `INSERT INTO lms_attempt_answers (attempt_id, question_id, selected_option_id, descriptive_answer, is_correct, points_awarded)
         VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            attemptId,
            ans.question_id,
            ans.selected_option_id ?? null,
            ans.descriptive_answer ?? null,
            isCorrect,
            points,
          ],
        );
      }
      await manager.query(
        `UPDATE lms_student_attempts
       SET submitted_at = NOW(), status = 'SUBMITTED', score = $2,
           anti_cheat_events = COALESCE(anti_cheat_events, '[]'::jsonb) || $3::jsonb
       WHERE attempt_id = $1`,
        [attemptId, total, JSON.stringify(antiCheatEvents ?? [])],
      );
      return { attempt_id: attemptId, score: total };
    });
  }

  async listCourseQuizzes(
    tenantId: string,
    courseId: string,
    userId: string,
    roles: string[],
  ) {
    await this.assertCourseAccess(tenantId, courseId, userId, roles, 'READ');
    return this.dataSource.query(
      `SELECT quiz_id, title, time_limit_mins, max_attempts, browser_lock, is_published
       FROM lms_quizzes WHERE tenant_id=$1 AND course_id=$2
         AND (is_published=true OR created_by=$3)
       ORDER BY created_at DESC`,
      [tenantId, courseId, userId],
    );
  }

  async createLiveClass(
    tenantId: string,
    userId: string,
    roles: string[],
    dto: {
      course_id: string;
      title: string;
      provider?: string;
      meeting_url: string;
      starts_at: string;
      ends_at: string;
    },
  ) {
    await this.assertCourseAccess(
      tenantId,
      dto.course_id,
      userId,
      roles,
      'TEACH',
    );
    const rows = await this.dataSource.query(
      `INSERT INTO lms_live_classes (tenant_id, course_id, title, provider, meeting_url, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        tenantId,
        dto.course_id,
        dto.title,
        dto.provider ?? 'GOOGLE_MEET',
        dto.meeting_url,
        dto.starts_at,
        dto.ends_at,
        userId,
      ],
    );
    const liveClass = rows[0];

    const [course] = await this.dataSource.query<
      Array<{ course_code: string; course_name: string }>
    >(
      `SELECT course_code, course_name FROM academic_courses
       WHERE course_id = $1 AND tenant_id = $2`,
      [dto.course_id, tenantId],
    );

    const enrolled = await this.dataSource.query<
      Array<{ student_user_id: string }>
    >(
      `SELECT student_user_id FROM student_course_enrollments
       WHERE tenant_id = $1 AND course_id = $2 AND status = 'ENROLLED'`,
      [tenantId, dto.course_id],
    );

    const courseName = course?.course_name ?? course?.course_code ?? 'Course';
    for (const row of enrolled) {
      this.notificationEmitter.liveClassScheduled({
        tenantId,
        userId: row.student_user_id,
        courseId: dto.course_id,
        courseName,
        courseCode: course?.course_code,
        liveClassTitle: dto.title,
        startsAt: dto.starts_at,
        actionLink: `/student/courses/${dto.course_id}?tab=live`,
      });
    }

    return liveClass;
  }

  async listLiveClasses(
    courseId: string,
    tenantId: string,
    userId: string,
    roles: string[],
  ) {
    await this.assertCourseAccess(tenantId, courseId, userId, roles, 'READ');

    return this.dataSource.query(
      `SELECT live_class_id, course_id, title, provider, meeting_url, starts_at, ends_at, created_at
       FROM lms_live_classes
       WHERE tenant_id = $1 AND course_id = $2
       ORDER BY starts_at DESC`,
      [tenantId, courseId],
    );
  }

  listStudentLiveClassUpdates(studentUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT
         lc.live_class_id,
         lc.course_id,
         lc.title,
         lc.meeting_url,
         lc.starts_at,
         lc.ends_at,
         lc.created_at,
         c.course_code,
         c.course_name
       FROM lms_live_classes lc
       INNER JOIN student_course_enrollments e
         ON e.course_id = lc.course_id
        AND e.student_user_id = $1
        AND e.status = 'ENROLLED'
        AND e.tenant_id = lc.tenant_id
       INNER JOIN academic_courses c
         ON c.course_id = lc.course_id
        AND c.tenant_id = lc.tenant_id
       WHERE lc.tenant_id = $2
         AND lc.ends_at >= NOW() - INTERVAL '14 days'
       ORDER BY
         CASE
           WHEN lc.starts_at <= NOW() AND lc.ends_at >= NOW() THEN 0
           WHEN lc.starts_at > NOW() THEN 1
           ELSE 2
         END,
         lc.starts_at DESC
       LIMIT 30`,
      [studentUserId, tenantId],
    );
  }

  listActiveLiveClasses(studentUserId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT lc.* FROM lms_live_classes lc
       JOIN student_course_enrollments e
         ON e.course_id = lc.course_id
        AND e.student_user_id = $1
        AND e.status = 'ENROLLED'
        AND e.tenant_id = lc.tenant_id
       WHERE lc.tenant_id = $2
         AND lc.starts_at <= NOW() + INTERVAL '15 minutes'
         AND lc.ends_at >= NOW()
       ORDER BY lc.starts_at ASC`,
      [studentUserId, tenantId],
    );
  }

  async createThread(
    tenantId: string,
    userId: string,
    roles: string[],
    dto: { course_id: string; title: string; body: string },
  ) {
    await this.assertCourseAccess(
      tenantId,
      dto.course_id,
      userId,
      roles,
      'READ',
    );
    return this.dataSource
      .query(
        `INSERT INTO lms_forum_threads (tenant_id, course_id, author_user_id, title, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [tenantId, dto.course_id, userId, dto.title, dto.body],
      )
      .then((r) => r[0]);
  }

  async listThreads(
    tenantId: string,
    courseId: string,
    userId: string,
    roles: string[],
  ) {
    await this.assertCourseAccess(tenantId, courseId, userId, roles, 'READ');
    return this.dataSource.query(
      `SELECT t.*, u.name AS author_name FROM lms_forum_threads t
       JOIN users u ON u.user_id=t.author_user_id AND u.tenant_id=t.tenant_id
       WHERE t.tenant_id=$1 AND t.course_id=$2
       ORDER BY t.is_pinned DESC, t.upvotes DESC, t.created_at DESC`,
      [tenantId, courseId],
    );
  }

  async replyToThread(
    tenantId: string,
    threadId: string,
    userId: string,
    roles: string[],
    body: string,
  ) {
    const [thread] = await this.dataSource.query(
      `SELECT course_id FROM lms_forum_threads WHERE tenant_id=$1 AND thread_id=$2`,
      [tenantId, threadId],
    );
    if (!thread) throw new NotFoundException('Forum thread not found');
    await this.assertCourseAccess(
      tenantId,
      thread.course_id,
      userId,
      roles,
      'READ',
    );
    return this.dataSource
      .query(
        `INSERT INTO lms_forum_posts (thread_id, author_user_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [threadId, userId, body],
      )
      .then((r) => r[0]);
  }

  async upvote(
    tenantId: string,
    userId: string,
    roles: string[],
    targetType: 'THREAD' | 'POST',
    targetId: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const targetSql =
        targetType === 'THREAD'
          ? `SELECT t.course_id FROM lms_forum_threads t WHERE t.tenant_id=$1 AND t.thread_id=$2`
          : `SELECT t.course_id FROM lms_forum_posts p JOIN lms_forum_threads t ON t.thread_id=p.thread_id WHERE t.tenant_id=$1 AND p.post_id=$2`;
      const [target] = await manager.query(targetSql, [tenantId, targetId]);
      if (!target) throw new NotFoundException('Forum item not found');
      await this.assertCourseAccess(
        tenantId,
        target.course_id,
        userId,
        roles,
        'READ',
        manager,
      );
      const inserted = await manager.query(
        `INSERT INTO lms_forum_votes (user_id, target_type, target_id) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, target_type, target_id) DO NOTHING RETURNING vote_id`,
        [userId, targetType, targetId],
      );
      if (inserted[0]) {
        const table =
          targetType === 'THREAD' ? 'lms_forum_threads' : 'lms_forum_posts';
        const col = targetType === 'THREAD' ? 'thread_id' : 'post_id';
        await manager.query(
          `UPDATE ${table} SET upvotes = upvotes + 1 WHERE ${col} = $1`,
          [targetId],
        );
      }
      return { upvoted: true, duplicate: !inserted[0] };
    });
  }
}
