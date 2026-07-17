import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';

type GradeCardStage = 'DRAFT' | 'PROVISIONAL' | 'FINAL';

type EnrollmentRow = {
  student_user_id: string;
  student_name: string;
  student_email: string;
  enrollment_number: string | null;
  course_id: string;
  course_code: string;
  course_name: string;
  credits: string | number;
  grade: string | null;
  grade_points: string | number | null;
  status: string;
};

type CgpaRow = {
  student_user_id: string;
  points: string | null;
  credits: string | null;
};

type GradeCardPayload = {
  result_stage: GradeCardStage;
  semester: number;
  generated_at: string;
  formula: string;
  sgpa: number;
  cgpa: number;
  rank: number | null;
  credits_attempted: number;
  credits_earned: number;
  verification_id: string;
  provisional_published_at?: string;
  final_published_at?: string;
  withheld_reason?: string;
  courses: Array<{
    course_id: string;
    course_code: string;
    course_name: string;
    credits: number;
    grade: string | null;
    grade_points: number | null;
    status: string;
  }>;
};

@Injectable()
export class SemesterResultsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async generateGradeCards(tenantId: string, semester: number) {
    if (!Number.isFinite(semester) || semester < 1) {
      throw new BadRequestException('Valid semester is required');
    }

    const rows = await this.loadEnrollmentRows(tenantId, semester);
    if (!rows.length)
      throw new BadRequestException(
        `No enrollments found for semester ${semester}`,
      );

    const cgpaByStudent = await this.loadCgpaMap(tenantId);
    const openUfm = await this.loadOpenUfmSet(tenantId);
    const grouped = this.groupByStudent(rows);
    const generatedAt = new Date().toISOString();

    const cards = [...grouped.entries()].map(([studentId, studentRows]) => {
      const first = studentRows[0];
      const semesterCalc = this.calculateSemester(studentRows);
      const cgpaCalc = cgpaByStudent.get(studentId) ?? {
        points: 0,
        credits: 0,
      };
      const cgpa =
        cgpaCalc.credits > 0
          ? this.round2(cgpaCalc.points / cgpaCalc.credits)
          : 0;
      const withheldReason = openUfm.has(studentId)
        ? 'Open UFM case'
        : undefined;
      const payload: GradeCardPayload = {
        result_stage: 'DRAFT',
        semester,
        generated_at: generatedAt,
        formula:
          'SGPA/CGPA = sum(credits * grade points) / sum(attempted credits)',
        sgpa: semesterCalc.sgpa,
        cgpa,
        rank: null,
        credits_attempted: semesterCalc.creditsAttempted,
        credits_earned: semesterCalc.creditsEarned,
        verification_id: `FALCON-${studentId.slice(0, 8)}-S${semester}`,
        withheld_reason: withheldReason,
        courses: studentRows.map((row) => ({
          course_id: row.course_id,
          course_code: row.course_code,
          course_name: row.course_name,
          credits: Number(row.credits),
          grade: row.grade,
          grade_points:
            row.grade_points == null ? null : Number(row.grade_points),
          status: row.status,
        })),
      };
      return {
        student_user_id: studentId,
        student_name: first.student_name,
        student_email: first.student_email,
        enrollment_number: first.enrollment_number,
        status: withheldReason ? 'WITHHELD' : 'DRAFT',
        payload,
      };
    });

    const ranked = this.assignRanks(cards);
    for (const card of ranked) {
      await this.upsertGradeCard(
        tenantId,
        semester,
        card.student_user_id,
        card.status,
        card.payload,
      );
    }

    return {
      semester,
      generated_count: ranked.length,
      top_students: ranked
        .filter((card) => card.status !== 'WITHHELD')
        .slice(0, 10)
        .map((card) => this.toResponseCard(card)),
      cards: ranked.map((card) => this.toResponseCard(card)),
    };
  }

  async listGradeCards(tenantId: string, semester?: number) {
    const params: unknown[] = [tenantId];
    const semesterFilter = semester ? 'AND g.semester = $2' : '';
    if (semester) params.push(semester);
    return this.db.query(
      `SELECT g.grade_card_id, g.student_user_id, g.semester, g.cgpa, g.status, g.published_at, g.payload,
              u.name AS student_name, u.official_email AS student_email,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number
       FROM grade_cards g
       JOIN users u ON u.user_id = g.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = g.student_user_id
       WHERE g.tenant_id = $1 ${semesterFilter}
       ORDER BY g.semester DESC,
                COALESCE((g.payload->>'rank')::int, 999999),
                COALESCE((g.payload->>'sgpa')::numeric, 0) DESC,
                u.name ASC`,
      params,
    );
  }

  async publishProvisional(tenantId: string, semester: number) {
    return this.transitionStage(tenantId, semester, 'PROVISIONAL');
  }

  async finalize(tenantId: string, semester: number) {
    return this.transitionStage(tenantId, semester, 'FINAL');
  }

  async topStudents(tenantId: string, semester: number, limit = 10) {
    return this.db.query(
      `SELECT g.student_user_id, u.name AS student_name,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number,
              (g.payload->>'rank')::int AS rank,
              (g.payload->>'sgpa')::numeric AS sgpa,
              (g.payload->>'cgpa')::numeric AS cgpa,
              g.payload->>'result_stage' AS result_stage
       FROM grade_cards g
       JOIN users u ON u.user_id = g.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = g.student_user_id
       WHERE g.tenant_id = $1 AND g.semester = $2 AND g.status <> 'WITHHELD'
       ORDER BY COALESCE((g.payload->>'rank')::int, 999999), u.name ASC
       LIMIT $3`,
      [tenantId, semester, Math.min(Math.max(Number(limit) || 10, 1), 100)],
    );
  }

  async exportGradeCardPdf(tenantId: string, gradeCardId: string) {
    const rows = await this.db.query<
      Array<{
        grade_card_id: string;
        student_name: string;
        enrollment_number: string | null;
        semester: number;
        cgpa: string | number | null;
        status: string;
        payload: GradeCardPayload & {
          courses?: Array<{
            course_code: string;
            course_name: string;
            credits: number;
            grade: string | null;
            grade_points: number | null;
          }>;
        };
      }>
    >(
      `SELECT g.grade_card_id, g.semester, g.cgpa, g.status, g.payload,
              u.name AS student_name,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number
       FROM grade_cards g
       JOIN users u ON u.user_id = g.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = g.student_user_id
       WHERE g.tenant_id = $1 AND g.grade_card_id = $2
       LIMIT 1`,
      [tenantId, gradeCardId],
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Grade card not found');

    const payload = row.payload ?? ({} as GradeCardPayload);
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.12, 0.23, 0.37);
    const gold = rgb(0.79, 0.66, 0.28);
    let y = 800;

    page.drawText('Suresh Gyan Vihar University', {
      x: 50,
      y,
      size: 14,
      font: bold,
      color: navy,
    });
    y -= 22;
    page.drawText('Examination Cell — Semester Grade Card', {
      x: 50,
      y,
      size: 11,
      font,
      color: navy,
    });
    y -= 28;
    page.drawText(`Student: ${row.student_name}`, { x: 50, y, size: 10, font });
    y -= 16;
    page.drawText(
      `Enrollment: ${row.enrollment_number ?? '—'} · Semester ${row.semester}`,
      { x: 50, y, size: 10, font },
    );
    y -= 16;
    page.drawText(
      `SGPA: ${payload.sgpa ?? '—'} · CGPA: ${row.cgpa ?? payload.cgpa ?? '—'} · Rank: ${payload.rank ?? '—'}`,
      { x: 50, y, size: 10, font: bold, color: gold },
    );
    y -= 24;
    page.drawText('Course', { x: 50, y, size: 9, font: bold, color: navy });
    page.drawText('Credits', { x: 280, y, size: 9, font: bold, color: navy });
    page.drawText('Grade', { x: 340, y, size: 9, font: bold, color: navy });
    page.drawText('GP', { x: 400, y, size: 9, font: bold, color: navy });
    y -= 12;
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 1,
      color: gold,
    });
    y -= 16;

    for (const course of payload.courses ?? []) {
      if (y < 120) break;
      page.drawText(
        `${course.course_code} — ${course.course_name}`.slice(0, 42),
        {
          x: 50,
          y,
          size: 8,
          font,
        },
      );
      page.drawText(String(course.credits ?? '—'), {
        x: 290,
        y,
        size: 8,
        font,
      });
      page.drawText(String(course.grade ?? '—'), { x: 350, y, size: 8, font });
      page.drawText(String(course.grade_points ?? '—'), {
        x: 410,
        y,
        size: 8,
        font,
      });
      y -= 14;
    }

    y = Math.min(y, 110);
    page.drawText('[ QR Code Placeholder ]', {
      x: 50,
      y,
      size: 8,
      font,
      color: navy,
    });
    page.drawText('Controller of Examinations', {
      x: 380,
      y: 70,
      size: 8,
      font: bold,
      color: navy,
    });
    page.drawText('Authorized Signatory: ____________________', {
      x: 340,
      y: 54,
      size: 8,
      font,
      color: navy,
    });
    const generatedAt = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
    });
    page.drawText(`Generated: ${generatedAt}`, {
      x: 50,
      y: 40,
      size: 8,
      font,
      color: navy,
    });
    page.drawText(
      `Verification ID: ${payload.verification_id ?? gradeCardId.slice(0, 8)}`,
      {
        x: 50,
        y: 26,
        size: 8,
        font,
        color: navy,
      },
    );

    const buffer = Buffer.from(await pdf.save());
    const safeName = (row.enrollment_number ?? row.student_name)
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .slice(0, 40);
    return {
      contentType: 'application/pdf',
      filename: `grade-card-${safeName}-sem${row.semester}.pdf`,
      buffer,
    };
  }

  private async transitionStage(
    tenantId: string,
    semester: number,
    stage: Exclude<GradeCardStage, 'DRAFT'>,
  ) {
    const rows = await this.listGradeCards(tenantId, semester);
    if (!rows.length)
      throw new BadRequestException('Generate grade cards before publishing');
    const timestampKey =
      stage === 'FINAL' ? 'final_published_at' : 'provisional_published_at';
    const now = new Date().toISOString();

    for (const row of rows) {
      const payload = {
        ...(row.payload ?? {}),
        result_stage: stage,
        [timestampKey]: now,
      };
      await this.db.query(
        `UPDATE grade_cards
         SET status = CASE WHEN status = 'WITHHELD' THEN 'WITHHELD' ELSE 'PUBLISHED' END,
             published_at = COALESCE(published_at, NOW()),
             payload = $4::jsonb
         WHERE tenant_id = $1 AND grade_card_id = $2 AND semester = $3`,
        [tenantId, row.grade_card_id, semester, JSON.stringify(payload)],
      );
    }

    return {
      semester,
      result_stage: stage,
      updated_count: rows.length,
    };
  }

  private async loadEnrollmentRows(tenantId: string, semester: number) {
    return this.db.query<EnrollmentRow[]>(
      `SELECT e.student_user_id, u.name AS student_name, u.official_email AS student_email,
              COALESCE(sp.enrollment_number, sp.enrollment_no) AS enrollment_number,
              e.course_id, c.course_code, c.course_name, c.credits,
              e.grade, e.grade_points, e.status
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = e.student_user_id
       WHERE e.tenant_id = $1 AND e.semester = $2
       ORDER BY u.name ASC, c.course_code ASC`,
      [tenantId, semester],
    );
  }

  private async loadCgpaMap(tenantId: string) {
    const rows = await this.db.query<CgpaRow[]>(
      `SELECT e.student_user_id,
              SUM(CASE WHEN e.status IN ('COMPLETED', 'FAILED') AND e.grade_points IS NOT NULL
                       THEN e.grade_points * c.credits ELSE 0 END) AS points,
              SUM(CASE WHEN e.status IN ('COMPLETED', 'FAILED') AND e.grade_points IS NOT NULL
                       THEN c.credits ELSE 0 END) AS credits
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       WHERE e.tenant_id = $1
       GROUP BY e.student_user_id`,
      [tenantId],
    );
    return new Map(
      rows.map((row) => [
        row.student_user_id,
        { points: Number(row.points ?? 0), credits: Number(row.credits ?? 0) },
      ]),
    );
  }

  private async loadOpenUfmSet(tenantId: string) {
    const rows = await this.db.query<Array<{ student_user_id: string }>>(
      `SELECT DISTINCT student_user_id
       FROM ufm_cases
       WHERE tenant_id = $1 AND status <> 'CLOSED' AND student_user_id IS NOT NULL`,
      [tenantId],
    );
    return new Set(rows.map((row) => row.student_user_id));
  }

  private groupByStudent(rows: EnrollmentRow[]) {
    const grouped = new Map<string, EnrollmentRow[]>();
    for (const row of rows) {
      grouped.set(row.student_user_id, [
        ...(grouped.get(row.student_user_id) ?? []),
        row,
      ]);
    }
    return grouped;
  }

  private calculateSemester(rows: EnrollmentRow[]) {
    let points = 0;
    let creditsAttempted = 0;
    let creditsEarned = 0;
    for (const row of rows) {
      const gradePoints =
        row.grade_points == null ? null : Number(row.grade_points);
      const credits = Number(row.credits);
      if (
        (row.status === 'COMPLETED' || row.status === 'FAILED') &&
        gradePoints != null
      ) {
        points += gradePoints * credits;
        creditsAttempted += credits;
      }
      if (row.status === 'COMPLETED') creditsEarned += credits;
    }
    return {
      sgpa: creditsAttempted > 0 ? this.round2(points / creditsAttempted) : 0,
      creditsAttempted,
      creditsEarned,
    };
  }

  private assignRanks<T extends { status: string; payload: GradeCardPayload }>(
    cards: T[],
  ) {
    const rankable = cards
      .filter(
        (card) =>
          card.status !== 'WITHHELD' && card.payload.credits_attempted > 0,
      )
      .sort(
        (a, b) =>
          b.payload.sgpa - a.payload.sgpa || b.payload.cgpa - a.payload.cgpa,
      );
    rankable.forEach((card, idx) => {
      card.payload.rank = idx + 1;
    });
    return cards.sort(
      (a, b) => (a.payload.rank ?? 999999) - (b.payload.rank ?? 999999),
    );
  }

  private async upsertGradeCard(
    tenantId: string,
    semester: number,
    studentUserId: string,
    status: string,
    payload: GradeCardPayload,
  ) {
    const existing = await this.db.query<Array<{ grade_card_id: string }>>(
      `SELECT grade_card_id FROM grade_cards
       WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId, semester],
    );
    if (existing[0]) {
      await this.db.query(
        `UPDATE grade_cards
         SET cgpa = $4, status = $5, payload = $6::jsonb
         WHERE grade_card_id = $1 AND tenant_id = $2 AND semester = $3`,
        [
          existing[0].grade_card_id,
          tenantId,
          semester,
          payload.cgpa,
          status,
          JSON.stringify(payload),
        ],
      );
      return;
    }
    await this.db.query(
      `INSERT INTO grade_cards (tenant_id, student_user_id, semester, cgpa, status, payload)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [
        tenantId,
        studentUserId,
        semester,
        payload.cgpa,
        status,
        JSON.stringify(payload),
      ],
    );
  }

  private toResponseCard(card: {
    student_user_id: string;
    student_name: string;
    student_email: string;
    enrollment_number: string | null;
    status: string;
    payload: GradeCardPayload;
  }) {
    return {
      student_user_id: card.student_user_id,
      student_name: card.student_name,
      student_email: card.student_email,
      enrollment_number: card.enrollment_number,
      status: card.status,
      ...card.payload,
    };
  }

  private round2(value: number) {
    return Number(value.toFixed(2));
  }
}
