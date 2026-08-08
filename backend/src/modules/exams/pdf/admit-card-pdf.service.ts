import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { ExamSchedule } from '../../../entities/exam-schedule.entity';

export type AdmitCardExamRow = {
  exam_date: string;
  start_time: string;
  end_time: string;
  exam_type: string;
  subject_code: string;
  subject_name: string;
  building: string;
  room: string;
  seat_no?: string | null;
};

export type AdmitCardStudent = {
  user_id: string;
  name: string;
  email: string;
  enrollment_no?: string | null;
  program?: string | null;
  department?: string | null;
  semester?: number | string | null;
  section?: string | null;
  batch?: string | null;
  academic_year?: string | null;
  profile_picture_url?: string | null;
};

interface AdmitCardInput {
  student: AdmitCardStudent;
  /** Preferred rich exam rows */
  exams?: AdmitCardExamRow[];
  /** Legacy schedule rows (exam-cell bulk generate) */
  schedules?: Pick<
    ExamSchedule,
    | 'exam_schedule_id'
    | 'exam_date'
    | 'start_time'
    | 'end_time'
    | 'exam_type'
    | 'venue'
    | 'seat_no'
  >[];
  barcodePayload?: string;
}

type Col = { key: string; label: string; x: number; w: number };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN_X = 36;
const TABLE_W = PAGE_W - MARGIN_X * 2;
const NAVY = rgb(0.08, 0.18, 0.35);
const MUTED = rgb(0.35, 0.38, 0.42);
const LINE = rgb(0.78, 0.8, 0.84);
const HEADER_BG = rgb(0.93, 0.94, 0.96);
const ROW_ALT = rgb(0.97, 0.98, 0.99);

function ascii(text: string): string {
  return String(text ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVenue(venue: string | null | undefined): {
  building: string;
  room: string;
} {
  const raw = String(venue ?? '').trim();
  if (!raw) return { building: '-', room: '-' };
  const parts = raw
    .split(/\s*[—–-]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return { building: parts[0], room: parts.slice(1).join(' - ') };
  }
  const labOrRoom = raw.match(/^(Lab|Room)\s+(.+)$/i);
  if (labOrRoom) return { building: labOrRoom[1], room: labOrRoom[2] };
  return { building: raw, room: '-' };
}

function shortExamType(type: string): string {
  const t = String(type ?? '').toUpperCase();
  if (t.includes('MID')) return 'MID';
  if (t.includes('PRAC')) return 'PRAC';
  if (t.includes('END')) return 'END';
  return ascii(t.replace(/_/g, ' ')).slice(0, 6) || '-';
}

function academicYearLabel(now = new Date()): string {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}-${String(start + 1).slice(-2)}`;
}

function fitText(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = ascii(text) || '-';
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let lo = 0;
  let hi = clean.length;
  let best = '-';
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const candidate = `${clean.slice(0, Math.max(1, mid - 1)).trimEnd()}...`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      best = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

@Injectable()
export class AdmitCardPdfService {
  async generate(input: AdmitCardInput): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const exams = this.normalizeExams(input);
    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = await this.drawHeaderAndStudent(page, pdfDoc, input, font, bold);

    y = this.drawSectionTitle(page, 'Examination Timetable', y, bold);
    y -= 4;

    const cols = this.tableColumns();
    const rowH = 18;
    const headerH = 18;

    const drawTableHeader = (p: PDFPage, top: number) => {
      p.drawRectangle({
        x: MARGIN_X,
        y: top - headerH + 4,
        width: TABLE_W,
        height: headerH,
        color: HEADER_BG,
        borderColor: LINE,
        borderWidth: 0.6,
      });
      for (const col of cols) {
        p.drawText(col.label, {
          x: col.x + 3,
          y: top - 8,
          size: 8,
          font: bold,
          color: NAVY,
        });
      }
      return top - headerH;
    };

    // Outer table border start
    const tableTop = y + 4;
    y = drawTableHeader(page, y);

    if (exams.length === 0) {
      page.drawText('No upcoming examinations found for this student.', {
        x: MARGIN_X + 8,
        y: y - 14,
        size: 9,
        font,
        color: MUTED,
      });
      y -= 28;
    } else {
      for (let i = 0; i < exams.length; i++) {
        if (y < 130) {
          this.drawTableBorder(page, tableTop, y + rowH);
          this.drawFooter(page, font);
          page = pdfDoc.addPage([PAGE_W, PAGE_H]);
          y = PAGE_H - 56;
          y = this.drawSectionTitle(page, 'Examination Timetable (continued)', y, bold);
          y -= 4;
          y = drawTableHeader(page, y);
        }

        const row = exams[i];
        const rowTop = y;
        const rowBottom = y - rowH;

        if (i % 2 === 1) {
          page.drawRectangle({
            x: MARGIN_X,
            y: rowBottom + 4,
            width: TABLE_W,
            height: rowH,
            color: ROW_ALT,
          });
        }

        // Column separators
        for (let c = 1; c < cols.length; c++) {
          page.drawLine({
            start: { x: cols[c].x, y: rowBottom + 4 },
            end: { x: cols[c].x, y: rowTop + 4 },
            thickness: 0.4,
            color: LINE,
          });
        }
        page.drawLine({
          start: { x: MARGIN_X, y: rowBottom + 4 },
          end: { x: MARGIN_X + TABLE_W, y: rowBottom + 4 },
          thickness: 0.4,
          color: LINE,
        });

        const time = `${ascii(String(row.start_time).slice(0, 5))}-${ascii(String(row.end_time).slice(0, 5))}`;
        const values = [
          String(i + 1),
          ascii(String(row.exam_date).slice(0, 10)),
          time,
          shortExamType(row.exam_type),
          ascii(row.subject_code),
          ascii(row.subject_name),
          ascii(row.building),
          ascii(row.room),
        ];

        const textY = rowTop - 11;
        values.forEach((value, idx) => {
          const col = cols[idx];
          const text = fitText(value, font, 7.5, col.w - 6);
          page.drawText(text, {
            x: col.x + 3,
            y: textY,
            size: 7.5,
            font,
            color: rgb(0.12, 0.14, 0.18),
          });
        });

        y = rowBottom;
      }
      this.drawTableBorder(page, tableTop, y + 4);
    }

    y -= 18;
    if (y < 150) {
      this.drawFooter(page, font);
      page = pdfDoc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - 56;
    }

    y = this.drawSectionTitle(page, 'Instructions', y, bold);
    const instructions = [
      '1. Carry this hall ticket and a valid photo ID to the examination hall.',
      '2. Report at least 30 minutes before the scheduled start time.',
      '3. Mobile phones and unauthorized material are strictly prohibited.',
      '4. Follow seating instructions issued by the invigilator.',
      '5. This document is system-generated for Suresh Gyan Vihar University.',
    ];
    for (const line of instructions) {
      page.drawText(fitText(line, font, 9, TABLE_W - 8), {
        x: MARGIN_X + 4,
        y,
        size: 9,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      y -= 14;
    }

    y -= 28;
    page.drawLine({
      start: { x: 360, y: y + 16 },
      end: { x: 530, y: y + 16 },
      thickness: 0.7,
      color: MUTED,
    });
    page.drawText('Controller of Examinations', {
      x: 360,
      y,
      size: 10,
      font: bold,
      color: NAVY,
    });
    y -= 12;
    page.drawText('Suresh Gyan Vihar University', {
      x: 360,
      y,
      size: 9,
      font,
      color: MUTED,
    });

    this.drawFooter(page, font);
    return Buffer.from(await pdfDoc.save());
  }

  private tableColumns(): Col[] {
    // Fixed grid so subject / building / room never overlap.
    const specs: Array<{ key: string; label: string; w: number }> = [
      { key: 'no', label: '#', w: 22 },
      { key: 'date', label: 'Date', w: 68 },
      { key: 'time', label: 'Time', w: 68 },
      { key: 'type', label: 'Type', w: 36 },
      { key: 'code', label: 'Code', w: 48 },
      { key: 'subject', label: 'Subject', w: 148 },
      { key: 'building', label: 'Building', w: 78 },
      { key: 'room', label: 'Room', w: 55 },
    ];
    let x = MARGIN_X;
    return specs.map((s) => {
      const col = { ...s, x };
      x += s.w;
      return col;
    });
  }

  private drawTableBorder(page: PDFPage, top: number, bottom: number) {
    page.drawRectangle({
      x: MARGIN_X,
      y: bottom,
      width: TABLE_W,
      height: Math.max(0, top - bottom),
      borderColor: LINE,
      borderWidth: 0.8,
    });
  }

  private normalizeExams(input: AdmitCardInput): AdmitCardExamRow[] {
    if (input.exams?.length) return input.exams;
    return (input.schedules ?? []).map((s) => {
      const venue = parseVenue(s.venue);
      return {
        exam_date: String(s.exam_date),
        start_time: String(s.start_time),
        end_time: String(s.end_time),
        exam_type: String(s.exam_type),
        subject_code: 'SUB',
        subject_name: 'Examination',
        building: venue.building,
        room: venue.room,
        seat_no: s.seat_no,
      };
    });
  }

  private async drawHeaderAndStudent(
    page: PDFPage,
    pdfDoc: PDFDocument,
    input: AdmitCardInput,
    font: PDFFont,
    bold: PDFFont,
  ): Promise<number> {
    const { width, height } = page.getSize();

    page.drawRectangle({
      x: MARGIN_X,
      y: height - 88,
      width: width - MARGIN_X * 2,
      height: 56,
      color: NAVY,
    });

    page.drawText('SURESH GYAN VIHAR UNIVERSITY', {
      x: MARGIN_X + 14,
      y: height - 52,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText('Office of the Controller of Examinations', {
      x: MARGIN_X + 14,
      y: height - 68,
      size: 10,
      font,
      color: rgb(0.9, 0.92, 0.95),
    });

    let y = height - 112;
    page.drawText('HALL TICKET / ADMIT CARD', {
      x: MARGIN_X + 4,
      y,
      size: 14,
      font: bold,
      color: NAVY,
    });
    y -= 16;
    page.drawText(
      `Academic Year: ${ascii(input.student.academic_year || academicYearLabel())}`,
      { x: MARGIN_X + 4, y, size: 10, font, color: MUTED },
    );

    const photoW = 78;
    const photoH = 96;
    const photoX = width - MARGIN_X - photoW;
    const photoY = height - 230;
    page.drawRectangle({
      x: photoX,
      y: photoY,
      width: photoW,
      height: photoH,
      borderWidth: 1,
      borderColor: rgb(0.25, 0.25, 0.25),
    });
    page.drawText('Photo', {
      x: photoX + 24,
      y: photoY + 44,
      size: 9,
      font,
      color: rgb(0.55, 0.55, 0.55),
    });
    await this.tryEmbedPhoto(
      page,
      pdfDoc,
      input.student.profile_picture_url,
      photoX,
      photoY,
      photoW,
      photoH,
    );

    const enrollment =
      input.student.enrollment_no?.trim() ||
      `SGVU-${input.student.user_id.slice(0, 8).toUpperCase()}`;

    const details: Array<[string, string]> = [
      ['Student Name', ascii(input.student.name || 'Student')],
      ['Enrollment No.', ascii(enrollment)],
      [
        'Program / Dept',
        ascii(
          input.student.program ||
            input.student.department ||
            'Undergraduate Program',
        ),
      ],
      [
        'Semester / Section',
        ascii(
          [
            input.student.semester != null
              ? `Sem ${input.student.semester}`
              : null,
            input.student.section ? `Sec ${input.student.section}` : null,
            input.student.batch ? `Batch ${input.student.batch}` : null,
          ]
            .filter(Boolean)
            .join('  |  ') || '-',
        ),
      ],
      ['Email', ascii(input.student.email || '-')],
    ];

    const labelX = MARGIN_X + 4;
    const valueX = MARGIN_X + 118;
    const valueMaxW = photoX - valueX - 12;

    y -= 26;
    for (const [label, value] of details) {
      page.drawText(`${label}`, {
        x: labelX,
        y,
        size: 9,
        font: bold,
        color: NAVY,
      });
      page.drawText(fitText(value, font, 9, valueMaxW), {
        x: valueX,
        y,
        size: 9,
        font,
        color: rgb(0.12, 0.14, 0.18),
      });
      y -= 16;
    }

    // Compact verification ID (enrollment only — avoids overflow into photo)
    y -= 6;
    const idBoxW = photoX - MARGIN_X - 12;
    page.drawRectangle({
      x: MARGIN_X,
      y: y - 16,
      width: idBoxW,
      height: 22,
      borderWidth: 0.8,
      borderColor: LINE,
      color: rgb(0.98, 0.98, 0.99),
    });
    page.drawText(
      fitText(`Hall Ticket ID: ${enrollment}`, bold, 9, idBoxW - 16),
      {
        x: MARGIN_X + 8,
        y: y - 9,
        size: 9,
        font: bold,
        color: NAVY,
      },
    );

    return y - 34;
  }

  private drawSectionTitle(
    page: PDFPage,
    title: string,
    y: number,
    bold: PDFFont,
  ): number {
    page.drawText(ascii(title), {
      x: MARGIN_X + 2,
      y,
      size: 11,
      font: bold,
      color: NAVY,
    });
    page.drawLine({
      start: { x: MARGIN_X, y: y - 4 },
      end: { x: MARGIN_X + TABLE_W, y: y - 4 },
      thickness: 0.8,
      color: NAVY,
    });
    return y - 18;
  }

  private drawFooter(page: PDFPage, font: PDFFont) {
    page.drawLine({
      start: { x: MARGIN_X, y: 48 },
      end: { x: MARGIN_X + TABLE_W, y: 48 },
      thickness: 0.5,
      color: LINE,
    });
    page.drawText(
      'Falcon Exam OS  |  Generated for official university use  |  SGVU',
      {
        x: MARGIN_X + 4,
        y: 34,
        size: 8,
        font,
        color: MUTED,
      },
    );
  }

  private async tryEmbedPhoto(
    page: PDFPage,
    pdfDoc: PDFDocument,
    profilePictureUrl: string | null | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    if (!profilePictureUrl) return;
    try {
      let imageBuffer: Buffer | null = null;
      let isPng = false;

      if (profilePictureUrl.startsWith('data:image/')) {
        const base64Data = profilePictureUrl.split(',')[1];
        if (base64Data) {
          imageBuffer = Buffer.from(base64Data, 'base64');
          isPng = profilePictureUrl.includes('image/png');
        }
      } else {
        const fs = await import('fs');
        const path = await import('path');
        let filePath = profilePictureUrl;
        if (filePath.startsWith('./')) {
          filePath = path.join(process.cwd(), filePath);
        }
        if (fs.existsSync(filePath)) {
          imageBuffer = fs.readFileSync(filePath);
          isPng = filePath.toLowerCase().endsWith('.png');
        }
      }

      if (!imageBuffer) return;
      const imageData = new Uint8Array(imageBuffer);
      let image;
      try {
        image = isPng
          ? await pdfDoc.embedPng(imageData)
          : await pdfDoc.embedJpg(imageData);
      } catch {
        image = isPng
          ? await pdfDoc.embedJpg(imageData)
          : await pdfDoc.embedPng(imageData);
      }
      page.drawImage(image, { x, y, width: w, height: h });
    } catch {
      // Photo is optional; keep the placeholder box.
    }
  }
}
