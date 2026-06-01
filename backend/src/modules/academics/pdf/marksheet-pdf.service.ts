import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Repository } from 'typeorm';
import { User } from '../../../entities/user.entity';
import { StudentProfile } from '../../../entities/student-profile.entity';
import { StudentCourseEnrollment } from '../../../entities/student-course-enrollment.entity';
import { FeeDemand } from '../../../entities/fee-demand.entity';

@Injectable()
export class MarksheetPdfService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(StudentProfile) private readonly profiles: Repository<StudentProfile>,
    @InjectRepository(StudentCourseEnrollment) private readonly enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(FeeDemand) private readonly feeDemands: Repository<FeeDemand>,
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
    const library = pending.filter((d) => d.fee_head.toLowerCase().includes('library'));
    if (library.length) {
      throw new ForbiddenException('Clear Library dues to download marksheet');
    }
    const finance = pending.filter((d) => !d.fee_head.toLowerCase().includes('library'));
    if (finance.length) {
      throw new ForbiddenException('Clear pending fee dues to download marksheet');
    }
  }

  async generate(studentUserId: string, tenantId: string, semester: number): Promise<Buffer> {
    await this.validateDownloadAllowed(studentUserId);

    const user = await this.users.findOne({ where: { user_id: studentUserId, tenant_id: tenantId } });
    if (!user) throw new NotFoundException('Student not found');

    const profile = await this.profiles.findOne({ where: { user_id: studentUserId } });
    const rows = await this.enrollments.find({
      where: { tenant_id: tenantId, student_user_id: studentUserId, semester },
      relations: ['course'],
    });
    rows.sort((a, b) => a.course.course_code.localeCompare(b.course.course_code));
    if (!rows.length) throw new NotFoundException(`No grade records for semester ${semester}`);

    let weighted = 0;
    let credits = 0;
    for (const row of rows) {
      if (row.status === 'COMPLETED' && row.grade_points != null) {
        weighted += Number(row.grade_points) * row.course.credits;
        credits += row.course.credits;
      }
    }
    const sgpa = credits > 0 ? (weighted / credits).toFixed(2) : '—';

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText('Generated via Falcon Campus OS - Provisional', {
      x: 120,
      y: height / 2,
      size: 36,
      font: bold,
      color: rgb(0.88, 0.88, 0.88),
    });

    let y = height - 50;
    page.drawText('SURESH GYAN VIHAR UNIVERSITY', { x: 50, y, size: 14, font: bold });
    y -= 22;
    page.drawText('Provisional Marksheet', { x: 50, y, size: 18, font: bold });
    y -= 28;
    page.drawText(`Student: ${user.name}`, { x: 50, y, size: 11, font });
    y -= 16;
    page.drawText(`Enrollment: ${profile?.enrollment_no ?? '—'}`, { x: 50, y, size: 11, font });
    y -= 16;
    page.drawText(`Semester: ${semester}`, { x: 50, y, size: 11, font });
    y -= 24;

    const cols = [50, 120, 320, 380, 440, 500];
    ['Code', 'Course', 'Credits', 'Grade', 'Points', 'Status'].forEach((h, i) => {
      page.drawText(h, { x: cols[i], y, size: 10, font: bold });
    });
    y -= 14;

    for (const row of rows) {
      const vals = [
        row.course.course_code,
        row.course.course_name.slice(0, 32),
        String(row.course.credits),
        row.grade ?? '—',
        row.grade_points != null ? String(row.grade_points) : '—',
        row.status,
      ];
      vals.forEach((v, i) => page.drawText(v, { x: cols[i], y, size: 9, font }));
      y -= 12;
      if (y < 120) break;
    }

    y -= 10;
    page.drawText(`SGPA (Semester ${semester}): ${sgpa}`, { x: 50, y, size: 12, font: bold });

    const verifyId = `FALCON-${studentUserId.slice(0, 8)}-S${semester}`;
    page.drawText(`Digital verification ID: ${verifyId}`, { x: 50, y: 70, size: 9, font });
    page.drawText('Scan QR at iqac.mygyanvihar.com/verify (coming soon)', { x: 50, y: 55, size: 8, font });

    return Buffer.from(await pdfDoc.save());
  }
}
