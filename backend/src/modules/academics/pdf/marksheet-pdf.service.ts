import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { StudentProfile } from '../../../entities/student-profile.entity';
import { StudentCourseEnrollment } from '../../../entities/student-course-enrollment.entity';
import { FeeDemand } from '../../../entities/fee-demand.entity';

@Injectable()
export class MarksheetPdfService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StudentProfile)
    private readonly profiles: Repository<StudentProfile>,
    @InjectRepository(StudentCourseEnrollment)
    private readonly enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(FeeDemand)
    private readonly feeDemands: Repository<FeeDemand>,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async validateDownloadAllowed(studentUserId: string) {
    const demands = await this.feeDemands.find({
      where: { student_user_id: studentUserId },
    });
    const pending = demands.filter((d) => {
      const status = String(d.status ?? '').toUpperCase();
      if (status === 'PAID' || status === 'WAIVED') return false;
      return Number(d.total_amount) - Number(d.paid_amount) > 0;
    });
    const library = pending.filter((d) =>
      d.fee_head.toLowerCase().includes('library'),
    );
    if (library.length) {
      throw new ForbiddenException('Clear Library dues to download marksheet');
    }
    const finance = pending.filter(
      (d) => !d.fee_head.toLowerCase().includes('library'),
    );
    if (finance.length) {
      throw new ForbiddenException(
        'Clear pending fee dues to download marksheet',
      );
    }
  }

  async generate(
    studentUserId: string,
    tenantId: string,
    semester: number,
    type: 'provisional' | 'final' = 'provisional',
  ): Promise<Buffer> {
    await this.validateDownloadAllowed(studentUserId);

    const user = await this.users.findOne({
      where: { user_id: studentUserId, tenant_id: tenantId },
    });
    if (!user) throw new NotFoundException('Student not found');

    const profile = await this.profiles.findOne({
      where: { user_id: studentUserId },
    });
    const gradeCard = await this.loadGradeCard(
      studentUserId,
      tenantId,
      semester,
    );
    if (gradeCard?.status === 'WITHHELD') {
      throw new ForbiddenException(
        String(gradeCard.payload?.withheld_reason ?? 'Marksheet is withheld'),
      );
    }
    if (type === 'final' && gradeCard?.payload?.result_stage !== 'FINAL') {
      throw new ForbiddenException('Final marksheet is not published yet');
    }
    if (
      type === 'provisional' &&
      gradeCard &&
      gradeCard.payload?.result_stage === 'DRAFT'
    ) {
      throw new ForbiddenException(
        'Provisional marksheet is not published yet',
      );
    }

    const rows = await this.enrollments.find({
      where: { tenant_id: tenantId, student_user_id: studentUserId, semester },
      relations: ['course'],
    });
    rows.sort((a, b) =>
      a.course.course_code.localeCompare(b.course.course_code),
    );
    if (!rows.length)
      throw new NotFoundException(`No grade records for semester ${semester}`);

    const payload = gradeCard?.payload ?? null;
    const displayRows = payload?.courses?.length
      ? payload.courses.map((row) => ({
          code: String(row.course_code),
          name: String(row.course_name),
          credits: String(row.credits),
          grade: row.grade == null ? '—' : String(row.grade),
          points: row.grade_points == null ? '—' : String(row.grade_points),
          status: String(row.status),
        }))
      : rows.map((row) => ({
          code: row.course.course_code,
          name: row.course.course_name,
          credits: String(row.course.credits),
          grade: row.grade ?? '—',
          points: row.grade_points != null ? String(row.grade_points) : '—',
          status: row.status,
        }));
    const sgpa =
      payload?.sgpa != null
        ? Number(payload.sgpa).toFixed(2)
        : this.calculateSgpa(rows);
    const cgpa = payload?.cgpa != null ? Number(payload.cgpa).toFixed(2) : null;
    const rank = payload?.rank ?? null;

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const isFinal = type === 'final';
    page.drawText(
      isFinal
        ? 'Falcon Campus OS - Final'
        : 'Generated via Falcon Campus OS - Provisional',
      {
        x: isFinal ? 160 : 120,
        y: height / 2,
        size: isFinal ? 34 : 36,
        font: bold,
        color: rgb(0.88, 0.88, 0.88),
      },
    );

    let y = height - 50;
    page.drawText('SURESH GYAN VIHAR UNIVERSITY', {
      x: 50,
      y,
      size: 14,
      font: bold,
    });
    y -= 22;
    page.drawText(isFinal ? 'Final Marksheet' : 'Provisional Marksheet', {
      x: 50,
      y,
      size: 18,
      font: bold,
    });
    y -= 28;
    page.drawText(`Student: ${user.name}`, { x: 50, y, size: 11, font });
    y -= 16;
    page.drawText(`Enrollment: ${profile?.enrollment_no ?? '—'}`, {
      x: 50,
      y,
      size: 11,
      font,
    });
    y -= 16;
    page.drawText(`Semester: ${semester}`, { x: 50, y, size: 11, font });
    y -= 24;

    const cols = [50, 120, 320, 380, 440, 500];
    ['Code', 'Course', 'Credits', 'Grade', 'Points', 'Status'].forEach(
      (h, i) => {
        page.drawText(h, { x: cols[i], y, size: 10, font: bold });
      },
    );
    y -= 14;

    for (const row of displayRows) {
      const vals = [
        row.code,
        row.name.slice(0, 32),
        row.credits,
        row.grade,
        row.points,
        row.status,
      ];
      vals.forEach((v, i) =>
        page.drawText(v, { x: cols[i], y, size: 9, font }),
      );
      y -= 12;
      if (y < 120) break;
    }

    y -= 10;
    page.drawText(`SGPA (Semester ${semester}): ${sgpa}`, {
      x: 50,
      y,
      size: 12,
      font: bold,
    });
    if (cgpa) {
      page.drawText(`CGPA: ${cgpa}`, { x: 230, y, size: 12, font: bold });
    }
    if (rank) {
      page.drawText(`Semester Rank: ${rank}`, {
        x: 360,
        y,
        size: 12,
        font: bold,
      });
    }

    y -= 18;
    page.drawText(
      'Formula: SGPA/CGPA = sum(credits x grade points) / sum(attempted credits)',
      {
        x: 50,
        y,
        size: 8,
        font,
      },
    );

    const verifyId = String(
      payload?.verification_id ??
        `FALCON-${studentUserId.slice(0, 8)}-S${semester}`,
    );
    page.drawText(`Digital verification ID: ${verifyId}`, {
      x: 50,
      y: 70,
      size: 9,
      font,
    });
    page.drawText(
      isFinal
        ? 'Digitally issued by Controller of Examinations'
        : 'Subject to final verification by Controller of Examinations',
      { x: 50, y: 55, size: 8, font },
    );

    return Buffer.from(await pdfDoc.save());
  }

  private calculateSgpa(rows: StudentCourseEnrollment[]) {
    let weighted = 0;
    let credits = 0;
    for (const row of rows) {
      if (
        (row.status === 'COMPLETED' || row.status === 'FAILED') &&
        row.grade_points != null
      ) {
        weighted += Number(row.grade_points) * row.course.credits;
        credits += row.course.credits;
      }
    }
    return credits > 0 ? (weighted / credits).toFixed(2) : '—';
  }

  private async loadGradeCard(
    studentUserId: string,
    tenantId: string,
    semester: number,
  ) {
    const rows = await this.db.query<
      Array<{ status: string; payload: Record<string, any> | null }>
    >(
      `SELECT status, payload
       FROM grade_cards
       WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId, semester],
    );
    return rows[0] ?? null;
  }
}
