import { createHash } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';

@Injectable()
export class OfficialTranscriptPdfService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  async generate(
    tenantId: string,
    transcriptId: string,
  ): Promise<{ buffer: Buffer; verificationCode: string; url: string }> {
    const rows = await this.db.query(
      `SELECT t.transcript_id, t.semester, t.student_user_id,
              u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
              COALESCE(sp.branch_name, sp.batch) AS program_name
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE t.transcript_id = $1 AND t.tenant_id = $2`,
      [transcriptId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Transcript not found');

    const row = rows[0] as Record<string, unknown>;
    const verificationCode = createHash('sha256')
      .update(`${transcriptId}:${row.student_user_id}:${row.semester}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const marks = await this.db.query(
      `SELECT c.course_code, c.course_name, am.marks_obtained, am.max_marks,
              COALESCE(e.grade, '—') AS grade
       FROM student_course_enrollments e
       JOIN academic_courses c ON c.course_id = e.course_id
       LEFT JOIN academic_marks am
         ON am.tenant_id = e.tenant_id
        AND am.student_user_id = e.student_user_id
        AND am.course_id = e.course_id
       WHERE e.tenant_id = $1 AND e.student_user_id = $2 AND e.semester = $3
       ORDER BY c.course_code`,
      [tenantId, row.student_user_id, row.semester],
    );

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595, 842]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    page.drawText('OFFICIAL TRANSCRIPT', {
      x: width / 2 - 100,
      y: height - 60,
      size: 20,
      font: bold,
      color: rgb(0.1, 0.15, 0.35),
    });

    page.drawText(`Name: ${String(row.student_name ?? '')}`, {
      x: 50,
      y: height - 100,
      size: 12,
      font,
    });
    page.drawText(`Enrollment: ${String(row.enrollment_no ?? '—')}`, {
      x: 50,
      y: height - 120,
      size: 12,
      font,
    });
    page.drawText(`Semester: ${String(row.semester ?? '')}`, {
      x: 50,
      y: height - 140,
      size: 12,
      font,
    });

    let y = height - 180;
    for (const m of marks as Array<Record<string, unknown>>) {
      if (y < 120) break;
      const line = `${m.course_code ?? ''} — ${m.course_name ?? ''}: ${m.marks_obtained ?? '—'}/${m.max_marks ?? '—'} (${m.grade ?? '—'})`;
      page.drawText(line.slice(0, 80), { x: 50, y, size: 10, font });
      y -= 16;
    }

    page.drawText(`Verification: ${verificationCode}`, {
      x: 50,
      y: 80,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawText('Verify at /verify/transcript/' + verificationCode, {
      x: 50,
      y: 64,
      size: 8,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const key = this.storage.buildKey(
      tenantId,
      `transcripts/${transcriptId}.pdf`,
    );
    const stored = await this.storage.upload(
      tenantId,
      key,
      buffer,
      'application/pdf',
    );

    return { buffer, verificationCode, url: stored.url };
  }
}
