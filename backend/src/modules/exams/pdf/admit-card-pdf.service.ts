import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { ExamSchedule } from '../../../entities/exam-schedule.entity';

interface AdmitCardInput {
  student: {
    user_id: string;
    name: string;
    email: string;
  };
  schedules: (Pick<
    ExamSchedule,
    'exam_schedule_id' | 'exam_date' | 'start_time' | 'end_time' | 'exam_type' | 'venue' | 'seat_no'
  >)[];
  barcodePayload?: string;
}

@Injectable()
export class AdmitCardPdfService {
  async generate(input: AdmitCardInput): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let y = height - 50;
    page.drawText('FALCON EXAM OS', { x: 50, y, size: 11, font: bold });
    page.drawText('Hall Ticket / Admit Card', { x: 50, y: y - 16, size: 16, font: bold });

    y -= 48;
    page.drawText(`Student: ${input.student.name}`, { x: 50, y, size: 12, font });
    y -= 18;
    page.drawText(`Enrollment ID: ${input.student.user_id.slice(0, 8).toUpperCase()}`, { x: 50, y, size: 11, font });
    y -= 18;
    page.drawText(`Email: ${input.student.email}`, { x: 50, y, size: 10, font });

    const barcode = input.barcodePayload ?? input.student.user_id;
    y -= 28;
    page.drawRectangle({ x: 48, y: y - 22, width: width - 96, height: 28, borderWidth: 1 });
    page.drawText(`BARCODE: ${barcode}`, { x: 55, y: y - 14, size: 10, font: bold });

    y -= 44;
    page.drawText('Exam Timetable', { x: 50, y, size: 14, font: bold });
    y -= 18;

    const header = ['Date', 'Time', 'Type', 'Venue', 'Seat'];
    const colX = [50, 120, 210, 290, 480];
    header.forEach((h, i) => page.drawText(h, { x: colX[i], y, size: 10, font: bold }));
    y -= 14;

    for (const s of input.schedules.slice(0, 16)) {
      const time = `${String(s.start_time).slice(0, 5)}-${String(s.end_time).slice(0, 5)}`;
      const values = [String(s.exam_date).slice(0, 10), time, s.exam_type, s.venue, s.seat_no ?? '—'];
      values.forEach((v, i) => page.drawText(String(v).slice(0, 22), { x: colX[i], y, size: 9, font }));
      y -= 13;
      if (y < 80) break;
    }

    page.drawText('Controller of Examinations — SGVU | Falcon Exam OS', {
      x: 50,
      y: 48,
      size: 8,
      font,
    });

    return Buffer.from(await pdfDoc.save());
  }
}
