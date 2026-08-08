import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  knowledgeContextBlock,
  matchCampusKnowledge,
} from './student-campus-knowledge';

@Injectable()
export class IntegrationsService {
  private readonly logger = new Logger(IntegrationsService.name);
  private genai: GoogleGenerativeAI | null = null;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.genai = this.createGenAiClient();
  }

  private createGenAiClient(): GoogleGenerativeAI | null {
    const raw = this.config.get<string>('GEMINI_API_KEY');
    const key = (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (!key) return null;
    return new GoogleGenerativeAI(key);
  }

  private ensureGenAi(): GoogleGenerativeAI | null {
    if (this.genai) return this.genai;
    this.genai = this.createGenAiClient();
    return this.genai;
  }

  private modelCandidates(): string[] {
    const configured = (
      this.config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash'
    )
      .replace(/^models\//, '')
      .trim();
    return [configured, 'gemini-2.0-flash', 'gemini-flash-latest', 'gemini-1.5-flash'].filter(
      (m, i, arr) => !!m && arr.indexOf(m) === i,
    );
  }

  jobs() {
    return this.dataSource.query(
      'SELECT * FROM integration_jobs ORDER BY created_at DESC LIMIT 50',
    );
  }

  queueGovernmentPush(
    type: 'DIGILOCKER' | 'NAD' | 'ABC',
    entityType: string,
    entityId?: string,
  ) {
    return this.dataSource.query(
      `INSERT INTO integration_jobs (tenant_id, integration_type, entity_type, entity_id, payload)
       VALUES ('a0000000-0000-4000-8000-000000000001', $1, $2, $3, '{}'::jsonb)
       RETURNING *`,
      [type, entityType, entityId ?? null],
    );
  }

  moodleSsoToken(userId: string, email: string) {
    const base = this.config.get(
      'MOODLE_SSO_URL',
      'https://lms.example.edu/auth/oauth2/login.php',
    );
    const token = Buffer.from(
      JSON.stringify({ sub: userId, email, ts: Date.now() }),
    ).toString('base64url');
    return {
      redirect_url: `${base}?falcon_token=${token}`,
      expires_in: 300,
      note: 'Configure MOODLE_SSO_URL and OAuth client in production',
    };
  }

  private async studentAcademicFacts(
    tenantId: string | undefined,
    userId: string,
  ): Promise<{
    text: string;
    name: string;
    enrollment: string;
    semester: number | null;
    cgpa: number | null;
    sgpa: number | null;
    attendance: number | null;
    feeOutstanding: number;
  } | null> {
    try {
      const profileRows = await this.dataSource.query(
        `SELECT
           COALESCE(u.name, 'Student') AS name,
           COALESCE(sp.enrollment_no, sp.enrollment_number) AS enrollment,
           sp.current_semester,
           d.dept_name,
           sp.program_name
         FROM users u
         LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.user_id = $1
           AND ($2::uuid IS NULL OR u.tenant_id = $2::uuid)
         LIMIT 1`,
        [userId, tenantId ?? null],
      );
      const profile = profileRows[0] as
        | {
            name?: string;
            enrollment?: string;
            current_semester?: number | null;
            dept_name?: string;
            program_name?: string;
          }
        | undefined;
      if (!profile) return null;

      const [gradeRows, attRows, feeRows] = await Promise.all([
        this.dataSource
          .query(
            `SELECT semester, cgpa
             FROM grade_cards
             WHERE student_user_id = $1
               AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
             ORDER BY semester DESC
             LIMIT 8`,
            [userId, tenantId ?? null],
          )
          .catch(() => []),
        this.dataSource
          .query(
            `SELECT AVG(attendance_percent)::float AS pct
             FROM student_course_enrollments
             WHERE student_user_id = $1
               AND attendance_percent IS NOT NULL
               AND ($2::uuid IS NULL OR tenant_id = $2::uuid)`,
            [userId, tenantId ?? null],
          )
          .catch(() => []),
        this.dataSource
          .query(
            `SELECT COALESCE(SUM(
               GREATEST(COALESCE(total_amount, 0) - COALESCE(paid_amount, 0), 0)
             ), 0)::float AS outstanding
             FROM finance_fee_demands
             WHERE student_user_id = $1
               AND UPPER(COALESCE(status, '')) NOT IN ('PAID', 'WAIVED')`,
            [userId],
          )
          .catch(() => [{ outstanding: 0 }]),
      ]);

      const grades = gradeRows as Array<{ semester: number; cgpa: string | number | null }>;
      const latestSgpa =
        grades.length && grades[0]?.cgpa != null ? Number(grades[0].cgpa) : null;
      const cgpaValues = grades
        .map((g) => (g.cgpa == null ? null : Number(g.cgpa)))
        .filter((n): n is number => n != null && !Number.isNaN(n));
      const cgpa =
        cgpaValues.length > 0
          ? Number(
              (
                cgpaValues.reduce((s, n) => s + n, 0) / cgpaValues.length
              ).toFixed(2),
            )
          : null;
      const attendanceRaw = Number(
        (attRows[0] as { pct?: number } | undefined)?.pct ?? NaN,
      );
      const attendance = Number.isFinite(attendanceRaw)
        ? Number(attendanceRaw.toFixed(1))
        : null;
      const feeOutstanding = Number(
        (feeRows[0] as { outstanding?: number } | undefined)?.outstanding ?? 0,
      );

      const name = profile.name || 'Student';
      const enrollment = profile.enrollment || 'N/A';
      const semester =
        profile.current_semester != null ? Number(profile.current_semester) : null;

      const text = [
        `Student facts (authoritative — use these numbers in answers):`,
        `name=${name}`,
        `enrollment=${enrollment}`,
        `department=${profile.dept_name ?? 'N/A'}`,
        `program=${profile.program_name ?? 'N/A'}`,
        `current_semester=${semester ?? 'N/A'}`,
        `overall_cgpa=${cgpa ?? 'N/A'}`,
        `latest_sgpa=${latestSgpa ?? 'N/A'}`,
        `overall_attendance_percent=${attendance ?? 'N/A'}`,
        `fee_outstanding_inr=${feeOutstanding}`,
      ].join('; ');

      return {
        text,
        name,
        enrollment,
        semester,
        cgpa,
        sgpa: latestSgpa,
        attendance,
        feeOutstanding,
      };
    } catch (err) {
      this.logger.debug(
        `studentAcademicFacts skipped: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  private personalizeCampusAnswer(
    topicId: string | undefined,
    baseAnswer: string,
    facts: Awaited<ReturnType<IntegrationsService['studentAcademicFacts']>>,
  ): string {
    if (!facts) return baseAnswer;
    const inr = (n: number) =>
      new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
      }).format(n);

    if (topicId === 'grades') {
      const cgpa =
        facts.cgpa != null
          ? `Your overall CGPA is ${facts.cgpa.toFixed(2)}.`
          : 'Your overall CGPA is not published yet.';
      const sgpa =
        facts.sgpa != null
          ? ` Latest semester SGPA is ${facts.sgpa.toFixed(2)}.`
          : '';
      return `${facts.name}, ${cgpa}${sgpa} Open Marks & Grade Cards for the full grade sheet and credits.`;
    }
    if (topicId === 'fees') {
      if (facts.feeOutstanding <= 0) {
        return `${facts.name}, your fee account is clear — no outstanding dues right now. You can still download receipts from My Financial Ledger.`;
      }
      return `${facts.name}, your pending fee amount is ${inr(facts.feeOutstanding)}. Pay online from My Financial Ledger to avoid blocks on admit card or registration.`;
    }
    if (topicId === 'attendance') {
      if (facts.attendance == null) {
        return `${facts.name}, ${baseAnswer}`;
      }
      const status =
        facts.attendance >= 75
          ? 'You are above the 75% minimum.'
          : 'You are below the 75% minimum — attend upcoming classes to protect exam eligibility.';
      return `${facts.name}, your overall attendance is ${facts.attendance}%. ${status} Open Attendance & Progression for subject-wise details.`;
    }
    return baseAnswer;
  }

  private async askGemini(prompt: string): Promise<string | null> {
    const client = this.ensureGenAi();
    if (!client) return null;

    let lastErr: unknown = null;
    for (const modelName of this.modelCandidates()) {
      try {
        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(prompt);
        const text = result.response.text()?.trim();
        if (text) return text;
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        const retryable =
          msg.includes('404') ||
          msg.toLowerCase().includes('not found') ||
          msg.toLowerCase().includes('not supported');
        this.logger.warn(`Gemini model ${modelName} failed: ${msg}`);
        if (!retryable) break;
      }
    }
    if (lastErr) {
      this.logger.warn(
        `Gemini chat unavailable: ${lastErr instanceof Error ? lastErr.message : lastErr}`,
      );
    }
    return null;
  }

  async studentFaqChat(
    question: string,
    opts?: { userId?: string; tenantId?: string },
  ) {
    const trimmed = (question ?? '').trim();
    if (!trimmed) {
      return {
        answer:
          'Please type a question about academics, fees, exams, timetable, or campus services.',
        source: 'faq' as const,
        href: '/student/helpdesk',
      };
    }

    const matched = matchCampusKnowledge(trimmed);
    const facts = opts?.userId
      ? await this.studentAcademicFacts(opts.tenantId, opts.userId)
      : null;
    const snapshot = facts?.text ?? '';

    // Conversational intents (no Gemini required).
    const lower = trimmed.toLowerCase();
    if (
      /^(hi|hello|hey|good\s*(morning|afternoon|evening)|namaste)\b/.test(lower) ||
      lower === 'help' ||
      lower === 'help me'
    ) {
      const personal = facts
        ? ` Hello ${facts.name.split(' ')[0]}! Your CGPA is ${facts.cgpa != null ? facts.cgpa.toFixed(2) : 'N/A'}, attendance ${facts.attendance != null ? `${facts.attendance}%` : 'N/A'}, pending fees ₹${Math.round(facts.feeOutstanding)}.`
        : '';
      return {
        answer: `Hello! I'm Falcon AI, your campus guide.${personal} Ask about your CGPA, fees, attendance, admit cards, timetable, registration, or placements.`,
        source: 'faq' as const,
        href: '/student/dashboard',
        topic: 'greeting',
      };
    }
    if (/^(thanks|thank you|thx|ok|okay|cool)\b/.test(lower)) {
      return {
        answer:
          "You're welcome. If you need anything else — fees, exams, attendance, or helpdesk — just ask.",
        source: 'faq' as const,
        href: null,
        topic: 'thanks',
      };
    }
    if (/who are you|what can you do|your name/.test(lower)) {
      return {
        answer: facts
          ? `I'm Falcon AI for ${facts.name}. I answer with your real portal figures — CGPA, fees, attendance — and link the right Student Portal page when you need full details.`
          : "I'm Falcon AI Assistant for the Student Portal. Ask about your CGPA, fees, attendance, exams, registration, or placements.",
        source: 'faq' as const,
        href: '/student/ai-assistant',
        topic: 'about',
      };
    }

    // Strong FAQ hit → personalize with live student facts when available.
    if (matched && matched.score >= 2) {
      return {
        answer: this.personalizeCampusAnswer(
          matched.article.id,
          matched.article.answer,
          facts,
        ),
        source: 'faq' as const,
        href: matched.article.href ?? null,
        topic: matched.article.id,
      };
    }

    const knowledge = knowledgeContextBlock();
    const prompt = `You are Falcon Campus AI Assistant for university students.
Answer clearly in 2-5 short sentences.
When Student facts include numbers (CGPA, SGPA, attendance %, fee outstanding), you MUST quote those exact values in the answer. Do not invent different numbers.
If a fact is N/A, say it is not published yet and point to the correct portal page.
Also mention the relevant Student Portal page when useful
(/student/attendance, /student/finance, /student/exams, /student/marks, /student/timetable, /student/registration, /student/courses, /student/placements, /student/library, /student/campus-life, /student/helpdesk).
Never mention API keys or internal configuration.

Campus knowledge:
${knowledge}

${snapshot ? `${snapshot}\n` : ''}Student question: ${trimmed}`;

    const geminiAnswer = await this.askGemini(prompt);
    if (geminiAnswer) {
      return {
        answer: geminiAnswer,
        source: 'gemini' as const,
        href: matched?.article.href ?? null,
        topic: matched?.article.id ?? null,
      };
    }

    if (matched) {
      return {
        answer: this.personalizeCampusAnswer(
          matched.article.id,
          matched.article.answer,
          facts,
        ),
        source: 'faq' as const,
        href: matched.article.href ?? null,
        topic: matched.article.id,
      };
    }

    if (facts) {
      return {
        answer: `${facts.name}, I can share your CGPA (${facts.cgpa != null ? facts.cgpa.toFixed(2) : 'N/A'}), attendance (${facts.attendance != null ? `${facts.attendance}%` : 'N/A'}), and pending fees (₹${Math.round(facts.feeOutstanding)}). Ask one of those topics, or open Helpdesk for human support.`,
        source: 'faq' as const,
        href: '/student/dashboard',
      };
    }

    return {
      answer:
        'I can help with attendance (75% rule), fees, exams/admit cards, SGPA vs CGPA, timetable, CBCS registration, assignments, placements, library, hostel/gate pass, and helpdesk. Try asking one of those topics, or open Helpdesk for human support.',
      source: 'faq' as const,
      href: '/student/helpdesk',
    };
  }
}
