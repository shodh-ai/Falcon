import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { ExamSchedule } from '../../../entities/exam-schedule.entity';

interface AdmitCardInput {
  student: {
    user_id: string;
    name: string;
    email: string;
  };
  schedules: ExamSchedule[];
}

@Injectable()
export class AdmitCardPdfService {
  async generate(input: AdmitCardInput): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 60;
    page.drawText('SGVU - Admit Card', { x: 50, y, size: 18, font: bold });

    y -= 30;
    page.drawText(`Student: ${input.student.name}`, { x: 50, y, size: 12, font });
    y -= 18;
    page.drawText(`User ID: ${input.student.user_id}`, { x: 50, y, size: 12, font });
    y -= 18;
    page.drawText(`Email: ${input.student.email}`, { x: 50, y, size: 12, font });

    y -= 28;
    page.drawText(`Barcode: ${input.student.user_id}`, { x: 50, y, size: 12, font: bold });

    y -= 32;
    page.drawText('Exam Timetable', { x: 50, y, size: 14, font: bold });
    y -= 18;

    const header = ['Date', 'Time', 'Type', 'Venue', 'Seat'];
    const colX = [50, 135, 250, 340, 500];
    header.forEach((h, i) => page.drawText(h, { x: colX[i], y, size: 10, font: bold }));
    y -= 14;

    const maxRows = 18;
    const rows = input.schedules.slice(0, maxRows);
    for (const s of rows) {
      const time = `${String(s.start_time).slice(0, 5)}-${String(s.end_time).slice(0, 5)}`;
      const values = [s.exam_date, time, s.exam_type, s.venue, s.seat_no ?? '—'];
      values.forEach((v, i) => page.drawText(String(v), { x: colX[i], y, size: 10, font }));
      y -= 13;
      if (y < 80) break;
    }

    page.drawText('This admit card is system-generated and valid without signature.', {
      x: 50,
      y: 60,
      size: 9,
      font,
    });

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
  }
}
