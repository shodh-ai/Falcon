import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import {
  assertIssuableTranscriptSource,
  readTranscriptMarks,
  TranscriptSource,
  transcriptRevisionHash,
} from './official-transcript-revisions';

@Injectable()
export class OfficialTranscriptPdfService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
  ) {}

  async generate(
    tenantId: string,
    transcriptId: string,
    transaction?: Pick<DataSource, 'query'>,
    snapshot?: TranscriptSource,
  ): Promise<{
    buffer: Buffer;
    verificationCode: string;
    url: string;
    sourceHash: string;
    pdfHash: string;
  }> {
    const db = transaction ?? this.db;
    const rows = snapshot
      ? [snapshot]
      : await db.query<
          {
            transcript_id: string;
            semester: number;
            student_user_id: string;
            student_name: string;
            enrollment_no: string | null;
            program_name: string | null;
            has_open_ufm?: boolean;
          }[]
        >(
          `SELECT t.transcript_id, t.semester, t.student_user_id,
              u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
              COALESCE(sp.branch_name, sp.batch) AS program_name,
              EXISTS (SELECT 1 FROM ufm_cases f WHERE f.tenant_id = t.tenant_id AND f.student_user_id = t.student_user_id
                AND f.status <> 'CLOSED') AS has_open_ufm
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id AND u.tenant_id = t.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE t.transcript_id = $1 AND t.tenant_id = $2`,
          [transcriptId, tenantId],
        );
    if (!rows[0]) throw new NotFoundException('Transcript not found');

    const row = rows[0];
    const verificationCode = randomBytes(32).toString('hex').toUpperCase();

    const marks =
      snapshot?.marks ??
      (await readTranscriptMarks(
        db,
        tenantId,
        row.student_user_id,
        row.semester,
      ));
    const source: TranscriptSource = snapshot ?? {
      ...row,
      tenant_id: tenantId,
      has_open_ufm: row.has_open_ufm === true,
      marks,
    };
    assertIssuableTranscriptSource(source);

    if (!marks.length) {
      throw new BadRequestException(
        'No published results are available for this transcript',
      );
    }
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const newPage = () => {
      const page = pdfDoc.addPage([595, 842]);
      const { width, height } = page.getSize();
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

      page.drawText(`Verification: ${verificationCode}`, {
        x: 50,
        y: 80,
        size: 9,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      page.drawText('Verify at /api/verify/transcript/' + verificationCode, {
        x: 50,
        y: 64,
        size: 8,
        font,
        color: rgb(0.4, 0.4, 0.4),
      });
      return page;
    };
    let page = newPage();
    let y = 662;
    for (const m of marks) {
      const text = `${m.course_code ?? ''} — ${m.course_name ?? ''} [${m.exam_type ?? ''}]: ${m.marks_obtained ?? '—'}/${m.max_marks ?? '—'} (${m.grade ?? '—'})`;
      // Wrap every character and continue on another page; never silently drop
      // later courses or truncate their names from an official document.
      let line = '';
      for (const character of text) {
        if (font.widthOfTextAtSize(line + character, 10) > 495 && line) {
          if (y < 120) {
            page = newPage();
            y = 662;
          }
          page.drawText(line, { x: 50, y, size: 10, font });
          y -= 16;
          line = '';
        }
        line += character;
      }
      if (line) {
        if (y < 120) {
          page = newPage();
          y = 662;
        }
        page.drawText(line, { x: 50, y, size: 10, font });
        y -= 16;
      }
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);
    const key = this.storage.buildKey(
      tenantId,
      // Every storage attempt gets a new immutable key, including a retry after
      // transaction rollback. A failed audit must never overwrite an old PDF.
      `transcripts/${transcriptId}-${randomBytes(16).toString('hex')}.pdf`,
    );
    const stored = await this.storage.upload(
      tenantId,
      key,
      buffer,
      'application/pdf',
    );

    return {
      buffer,
      verificationCode,
      url: stored.url,
      sourceHash: transcriptRevisionHash(source),
      pdfHash: createHash('sha256').update(buffer).digest('hex'),
    };
  }
}
