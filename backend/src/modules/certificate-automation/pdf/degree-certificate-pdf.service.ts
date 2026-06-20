import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { createHash } from 'crypto';

@Injectable()
export class DegreeCertificatePdfService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async generate(
    tenantId: string,
    applicationId: string,
  ): Promise<{ buffer: Buffer; verificationCode: string }> {
    const rows = await this.db.query(
      `SELECT ca.application_id, ca.student_user_id,
              u.name AS student_name,
              sp.enrollment_no,
              sp.program_name,
              sp.graduation_year,
              ce.event_name
       FROM cert_applications ca
       JOIN users u ON u.user_id = ca.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
       JOIN cert_events ce ON ce.event_id = ca.event_id
       WHERE ca.application_id = $1 AND ca.tenant_id = $2`,
      [applicationId, tenantId],
    );
    if (!rows[0])
      throw new NotFoundException('Certificate application not found');

    const row = rows[0] as Record<string, unknown>;
    const verificationCode = createHash('sha256')
      .update(`${applicationId}:${row.student_user_id}:${Date.now()}`)
      .digest('hex')
      .slice(0, 16)
      .toUpperCase();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([842, 595]); // landscape A4
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

    // Watermark (centered, light)
    page.drawText('FALCON CAMPUS OS', {
      x: width / 2 - 100,
      y: height / 2 - 20,
      size: 36,
      font: bold,
      color: rgb(0.92, 0.92, 0.95),
    });

    // Border
    page.drawRectangle({
      x: 40,
      y: 40,
      width: width - 80,
      height: height - 80,
      borderColor: rgb(0.55, 0.35, 0.05),
      borderWidth: 3,
    });

    page.drawText('CERTIFICATE OF DEGREE', {
      x: width / 2 - 140,
      y: height - 100,
      size: 28,
      font: bold,
      color: rgb(0.1, 0.15, 0.35),
    });

    const studentName = String(row.student_name ?? 'Student');
    const program = String(row.program_name ?? 'Undergraduate Programme');
    const eventName = String(row.event_name ?? 'Convocation');

    page.drawText('This is to certify that', {
      x: width / 2 - 80,
      y: height - 160,
      size: 14,
      font,
    });
    page.drawText(studentName, {
      x: width / 2 - studentName.length * 4,
      y: height - 200,
      size: 22,
      font: bold,
      color: rgb(0.1, 0.15, 0.35),
    });
    page.drawText(`has been awarded the degree in ${program}`, {
      x: width / 2 - 160,
      y: height - 240,
      size: 14,
      font,
    });
    page.drawText(`Enrollment No: ${row.enrollment_no ?? '—'}`, {
      x: width / 2 - 80,
      y: height - 270,
      size: 12,
      font,
    });
    page.drawText(`Issued under ${eventName}`, {
      x: width / 2 - 90,
      y: height - 300,
      size: 12,
      font,
    });

    // QR verification placeholder (scannable code region)
    const qrSize = 80;
    page.drawRectangle({
      x: width - 140,
      y: 60,
      width: qrSize,
      height: qrSize,
      borderColor: rgb(0.2, 0.2, 0.2),
      borderWidth: 1,
    });
    page.drawText('VERIFY', { x: width - 125, y: 95, size: 10, font: bold });
    page.drawText(verificationCode, {
      x: width - 155,
      y: 50,
      size: 8,
      font,
    });

    page.drawText(`Generated: ${new Date().toLocaleDateString('en-IN')}`, {
      x: 60,
      y: 60,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });

    const pdfBytes = await pdfDoc.save();
    return { buffer: Buffer.from(pdfBytes), verificationCode };
  }
}
