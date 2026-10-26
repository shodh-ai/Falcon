import { createHash } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { requireTenantId } from '../../common/utils/require-tenant-id';

type TranscriptPdfRecord = {
  transcript_id: string;
  semester: number;
  student_user_id: string;
  status: string;
  student_name: string | null;
  enrollment_no: string | null;
};

type TranscriptReport = {
  course_code: string;
  course_name: string;
  exam_type: string;
  marks_obtained: number | string;
  max_marks: number | string;
  grade: string | null;
  result_status: string;
};

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
    tenantId = requireTenantId(typeof tenantId === 'string' ? tenantId : null);
    if (!isUUID(tenantId)) {
      throw new ForbiddenException('Invalid tenant context');
    }
    if (!isUUID(transcriptId)) {
      throw new BadRequestException('Invalid transcript identifier');
    }
    const rows = await this.db.query<TranscriptPdfRecord[]>(
      `SELECT t.transcript_id, t.semester, t.student_user_id, t.status,
              u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id AND u.tenant_id = t.tenant_id
       LEFT JOIN student_profiles sp
         ON sp.user_id = t.student_user_id AND sp.tenant_id = t.tenant_id
       WHERE t.transcript_id = $1 AND t.tenant_id = $2`,
      [transcriptId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Transcript not found');

    const row = rows[0];
    if (!['APPROVED', 'GENERATED'].includes(String(row.status))) {
      throw new BadRequestException(
        'Transcript must be approved before PDF generation',
      );
    }
    const verificationCode = createHash('sha256')
      .update(`${transcriptId}:${row.student_user_id}:${row.semester}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const marks = await this.db.query<TranscriptReport[]>(
      `SELECT c.course_code, c.course_name, r.exam_type, r.marks_obtained,
              r.max_marks, r.grade, r.result_status
       FROM student_exam_reports r
       JOIN exam_result_sessions s
         ON s.session_id = r.session_id AND s.tenant_id = r.tenant_id
        AND s.course_id = r.course_id AND s.exam_type = r.exam_type
       JOIN academic_courses c
         ON c.course_id = r.course_id AND c.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1 AND r.student_user_id = $2 AND s.semester = $3
         AND r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL
       ORDER BY c.course_code, r.exam_type, r.declared_at DESC`,
      [tenantId, row.student_user_id, row.semester],
    );
    if (!marks.length) {
      throw new BadRequestException(
        'No officially declared results are available for this semester',
      );
    }
    if (marks.some((mark) => mark.result_status === 'WITHHELD')) {
      throw new BadRequestException(
        'Transcript cannot be generated while official results are withheld',
      );
    }

    const pdfDoc = await PDFDocument.create();
    const width = 595;
    const height = 842;
    const margin = 50;
    const contentWidth = width - margin * 2;
    const bottom = 120;
    let page = pdfDoc.addPage([width, height]);
    let y = height - 100;
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Measure text with the actual template font. Split long tokens as well as
    // words, without shortening any identity field or declared result.
    function wrap(text: string, size: number): string[] {
      const lines: string[] = [];
      let line = '';
      for (const word of text.trim().split(/\s+/)) {
        const joined = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(joined, size) <= contentWidth) {
          line = joined;
          continue;
        }
        if (line) lines.push(line);
        line = '';
        for (const character of word) {
          if (font.widthOfTextAtSize(line + character, size) > contentWidth) {
            lines.push(line);
            line = '';
          }
          line += character;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    const identity = [
      `Name: ${row.student_name ?? ''}`,
      `Enrollment: ${row.enrollment_no ?? '-'}`,
      `Semester: ${row.semester}`,
    ].flatMap((text) => wrap(text, 12));
    const repeatIdentity = identity.length * 16 <= 320;

    function drawTitle() {
      const title = 'OFFICIAL TRANSCRIPT';
      page.drawText(title, {
        x: (width - bold.widthOfTextAtSize(title, 20)) / 2,
        y: height - 60,
        size: 20,
        font: bold,
        color: rgb(0.1, 0.15, 0.35),
      });
      y = height - 100;
    }

    function newPage() {
      page = pdfDoc.addPage([width, height]);
      drawTitle();
    }

    function drawIdentityLine(line: string) {
      page.drawText(line, { x: margin, y, size: 12, font });
      y -= 16;
    }

    function drawResultsHeader() {
      y -= 12;
      page.drawText('Declared Results', {
        x: margin,
        y,
        size: 11,
        font: bold,
        color: rgb(0.1, 0.15, 0.35),
      });
      page.drawLine({
        start: { x: margin, y: y - 8 },
        end: { x: width - margin, y: y - 8 },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 32;
    }

    function continueResults() {
      newPage();
      // Unusually large identity fields are fully printed once, even when they
      // span pages. A compact continuation header guarantees room for results.
      for (const line of repeatIdentity
        ? identity
        : [`Semester: ${row.semester}`]) {
        drawIdentityLine(line);
      }
      drawResultsHeader();
    }

    drawTitle();
    for (const line of identity) {
      if (y < bottom + 44) newPage();
      drawIdentityLine(line);
    }
    if (y < bottom + 76) continueResults();
    else drawResultsHeader();

    for (const m of marks) {
      const line = `${m.course_code} - ${m.course_name}: ${m.marks_obtained}/${m.max_marks} (${m.grade ?? '-'})`;
      const lines = [
        ...wrap(line, 10),
        ...wrap(`Exam: ${m.exam_type} | Result: ${m.result_status}`, 10),
      ];
      const rowHeight = lines.length * 14;
      const fullPageBody =
        height -
        100 -
        (repeatIdentity ? identity.length * 16 : 16) -
        44 -
        bottom;
      if (rowHeight <= fullPageBody && y - rowHeight + 14 < bottom) {
        continueResults();
      }
      for (const text of lines) {
        if (y < bottom) continueResults();
        page.drawText(text, { x: margin, y, size: 10, font });
        y -= 14;
      }
      y -= 6;
    }

    const pages = pdfDoc.getPages();
    pages.forEach((sheet, index) => {
      sheet.drawText(`Verification: ${verificationCode}`, {
        x: margin,
        y: 80,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      sheet.drawText('Verify at /verify/transcript/' + verificationCode, {
        x: margin,
        y: 64,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      const numbering = `Page ${index + 1} of ${pages.length}`;
      sheet.drawText(numbering, {
        x: width - margin - font.widthOfTextAtSize(numbering, 9),
        y: 46,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
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
