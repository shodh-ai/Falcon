import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class LmsExtendedService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async createQuiz(
    tenantId: string,
    userId: string,
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
    const quizRows = await this.dataSource.query(
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
      const qRows = await this.dataSource.query(
        `INSERT INTO lms_questions (quiz_id, question_type, prompt, points, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING question_id`,
        [quiz.quiz_id, q.question_type ?? 'MCQ', q.prompt, q.points ?? 1, idx],
      );
      for (const opt of q.options ?? []) {
        await this.dataSource.query(
          `INSERT INTO lms_question_options (question_id, option_text, is_correct) VALUES ($1, $2, $3)`,
          [qRows[0].question_id, opt.option_text, opt.is_correct ?? false],
        );
      }
    }
    return quiz;
  }

  async startAttempt(quizId: string, studentUserId: string) {
    const quizRows = await this.dataSource.query(`SELECT * FROM lms_quizzes WHERE quiz_id = $1`, [quizId]);
    const quiz = quizRows[0];
    if (!quiz) throw new NotFoundException('Quiz not found');

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM lms_student_attempts WHERE quiz_id = $1 AND student_user_id = $2`,
      [quizId, studentUserId],
    );
    if (countRows[0].c >= quiz.max_attempts) {
      throw new BadRequestException('Maximum attempts reached');
    }

    const rows = await this.dataSource.query(
      `INSERT INTO lms_student_attempts (quiz_id, student_user_id) VALUES ($1, $2) RETURNING *`,
      [quizId, studentUserId],
    );
    return rows[0];
  }

  async submitAttempt(
    attemptId: string,
    studentUserId: string,
    answers: Array<{ question_id: string; selected_option_id?: string; descriptive_answer?: string }>,
    antiCheatEvents?: unknown[],
  ) {
    const attemptRows = await this.dataSource.query(
      `SELECT * FROM lms_student_attempts WHERE attempt_id = $1 AND student_user_id = $2`,
      [attemptId, studentUserId],
    );
    const attempt = attemptRows[0];
    if (!attempt) throw new NotFoundException('Attempt not found');
    if (attempt.status !== 'IN_PROGRESS') throw new BadRequestException('Attempt already submitted');

    let total = 0;
    for (const ans of answers) {
      let isCorrect: boolean | null = null;
      let points = 0;
      if (ans.selected_option_id) {
        const optRows = await this.dataSource.query(
          `SELECT is_correct, q.points FROM lms_question_options o
           JOIN lms_questions q ON q.question_id = o.question_id
           WHERE o.option_id = $1`,
          [ans.selected_option_id],
        );
        isCorrect = optRows[0]?.is_correct ?? false;
        points = isCorrect ? Number(optRows[0]?.points ?? 0) : 0;
        total += points;
      }
      await this.dataSource.query(
        `INSERT INTO lms_attempt_answers (attempt_id, question_id, selected_option_id, descriptive_answer, is_correct, points_awarded)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [attemptId, ans.question_id, ans.selected_option_id ?? null, ans.descriptive_answer ?? null, isCorrect, points],
      );
    }

    await this.dataSource.query(
      `UPDATE lms_student_attempts
       SET submitted_at = NOW(), status = 'SUBMITTED', score = $2,
           anti_cheat_events = COALESCE(anti_cheat_events, '[]'::jsonb) || $3::jsonb
       WHERE attempt_id = $1`,
      [attemptId, total, JSON.stringify(antiCheatEvents ?? [])],
    );
    return { attempt_id: attemptId, score: total };
  }

  listCourseQuizzes(courseId: string) {
    return this.dataSource.query(
      `SELECT quiz_id, title, time_limit_mins, max_attempts, browser_lock, is_published
       FROM lms_quizzes WHERE course_id = $1 ORDER BY created_at DESC`,
      [courseId],
    );
  }

  createLiveClass(tenantId: string, userId: string, dto: {
    course_id: string; title: string; provider?: string; meeting_url: string; starts_at: string; ends_at: string;
  }) {
    return this.dataSource.query(
      `INSERT INTO lms_live_classes (tenant_id, course_id, title, provider, meeting_url, starts_at, ends_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [tenantId, dto.course_id, dto.title, dto.provider ?? 'GOOGLE_MEET', dto.meeting_url, dto.starts_at, dto.ends_at, userId],
    ).then((r) => r[0]);
  }

  listLiveClasses(courseId: string) {
    return this.dataSource.query(
      `SELECT * FROM lms_live_classes WHERE course_id = $1 ORDER BY starts_at DESC`,
      [courseId],
    );
  }

  listActiveLiveClasses(studentUserId: string) {
    return this.dataSource.query(
      `SELECT lc.* FROM lms_live_classes lc
       JOIN student_course_enrollments e ON e.course_id = lc.course_id
       WHERE e.student_user_id = $1 AND lc.starts_at <= NOW() + INTERVAL '15 minutes' AND lc.ends_at >= NOW()
       ORDER BY lc.starts_at ASC`,
      [studentUserId],
    );
  }

  createThread(tenantId: string, userId: string, dto: { course_id: string; title: string; body: string }) {
    return this.dataSource.query(
      `INSERT INTO lms_forum_threads (tenant_id, course_id, author_user_id, title, body)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, dto.course_id, userId, dto.title, dto.body],
    ).then((r) => r[0]);
  }

  listThreads(courseId: string) {
    return this.dataSource.query(
      `SELECT t.*, u.name AS author_name FROM lms_forum_threads t
       JOIN users u ON u.user_id = t.author_user_id
       WHERE t.course_id = $1 ORDER BY t.is_pinned DESC, t.upvotes DESC, t.created_at DESC`,
      [courseId],
    );
  }

  replyToThread(threadId: string, userId: string, body: string) {
    return this.dataSource.query(
      `INSERT INTO lms_forum_posts (thread_id, author_user_id, body) VALUES ($1, $2, $3) RETURNING *`,
      [threadId, userId, body],
    ).then((r) => r[0]);
  }

  upvote(userId: string, targetType: 'THREAD' | 'POST', targetId: string) {
    return this.dataSource.query(
      `INSERT INTO lms_forum_votes (user_id, target_type, target_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, target_type, target_id) DO NOTHING`,
      [userId, targetType, targetId],
    ).then(async () => {
      const table = targetType === 'THREAD' ? 'lms_forum_threads' : 'lms_forum_posts';
      const col = targetType === 'THREAD' ? 'thread_id' : 'post_id';
      await this.dataSource.query(
        `UPDATE ${table} SET upvotes = upvotes + 1 WHERE ${col} = $1`,
        [targetId],
      );
      return { upvoted: true };
    });
  }
}
