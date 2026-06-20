import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';

@Injectable()
export class FinanceReceiptService {
  private readonly logger = new Logger(FinanceReceiptService.name);
  private transporter: nodemailer.Transporter;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST'),
      port: parseInt(this.config.get('EMAIL_PORT') || '587', 10),
      secure: false,
      auth: {
        user: this.config.get('EMAIL_USER'),
        pass: this.config.get('EMAIL_PASSWORD'),
      },
    });
  }

  async generateAndStore(params: {
    tenantId: string;
    transactionId: string;
    receiptNumber: string;
    studentUserId: string;
    amount: number;
    paymentMode?: string;
    feeHead?: string;
  }): Promise<string> {
    const students = await this.dataSource.query(
      `SELECT u.name, u.official_email, sp.enrollment_no
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [params.studentUserId],
    );
    const student = students[0] as
      | { name: string; official_email: string; enrollment_no: string }
      | undefined;

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.03, 0.14, 0.29);

    page.drawText('Suresh Gyan Vihar University', {
      x: 50,
      y: 780,
      size: 16,
      font: bold,
      color: navy,
    });
    page.drawText('Fee Payment Receipt', { x: 50, y: 755, size: 12, font });
    page.drawText(`Receipt No: ${params.receiptNumber}`, {
      x: 50,
      y: 720,
      size: 10,
      font,
    });
    page.drawText(`Transaction ID: ${params.transactionId}`, {
      x: 50,
      y: 700,
      size: 10,
      font,
    });
    page.drawText(`Date: ${new Date().toLocaleString('en-IN')}`, {
      x: 50,
      y: 680,
      size: 10,
      font,
    });
    page.drawText(`Student: ${student?.name ?? params.studentUserId}`, {
      x: 50,
      y: 650,
      size: 10,
      font,
    });
    page.drawText(`Enrollment: ${student?.enrollment_no ?? '—'}`, {
      x: 50,
      y: 630,
      size: 10,
      font,
    });
    page.drawText(`Fee Head: ${params.feeHead ?? 'University Fees'}`, {
      x: 50,
      y: 610,
      size: 10,
      font,
    });
    page.drawText(`Amount Paid: ₹${params.amount.toFixed(2)}`, {
      x: 50,
      y: 580,
      size: 12,
      font: bold,
      color: navy,
    });
    page.drawText(`Mode: ${params.paymentMode ?? 'Online'}`, {
      x: 50,
      y: 560,
      size: 10,
      font,
    });
    page.drawText('GSTIN: 08AAECS1234F1Z5 (University)', {
      x: 50,
      y: 520,
      size: 9,
      font,
    });
    page.drawText('This is a computer-generated receipt.', {
      x: 50,
      y: 100,
      size: 8,
      font,
    });

    const bytes = await pdf.save();
    const relDir = path.join(
      params.tenantId,
      'receipts',
      new Date().getFullYear().toString(),
    );
    const absDir = path.join(process.cwd(), 'uploads', relDir);
    fs.mkdirSync(absDir, { recursive: true });
    const fileName = `${params.receiptNumber}.pdf`;
    const absPath = path.join(absDir, fileName);
    fs.writeFileSync(absPath, bytes);
    const receiptUrl = `/uploads/${relDir}/${fileName}`.replace(/\\/g, '/');

    await this.dataSource.query(
      `INSERT INTO finance_auto_receipts (tenant_id, transaction_id, receipt_number, receipt_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, receipt_number) DO UPDATE SET receipt_url = EXCLUDED.receipt_url`,
      [params.tenantId, params.transactionId, params.receiptNumber, receiptUrl],
    );

    return receiptUrl;
  }

  async emailReceipt(
    studentUserId: string,
    receiptUrl: string,
    amount: number,
  ) {
    const rows = await this.dataSource.query(
      `SELECT u.name, u.official_email FROM users u WHERE u.user_id = $1`,
      [studentUserId],
    );
    const student = rows[0] as
      | { name: string; official_email: string }
      | undefined;
    if (!student?.official_email) return;

    const parents = await this.dataSource.query(
      `SELECT u.official_email FROM parent_student_links psl
       JOIN users u ON u.user_id = psl.parent_user_id
       WHERE psl.student_user_id = $1 AND u.official_email IS NOT NULL`,
      [studentUserId],
    );
    const bcc = (parents as Array<{ official_email: string }>)
      .map((p) => p.official_email)
      .filter(Boolean);
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const html = wrapFalconEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#08234a;">Fee Payment Received</h2>
        <p>Dear ${student.name},</p>
        <p>We have received your payment of <strong>₹${amount.toFixed(2)}</strong>.</p>
        <p><a href="${frontend}${receiptUrl}" style="color:#08234a;font-weight:700;">Download Receipt (PDF)</a></p>
      `,
      frontend,
    );
    try {
      await this.transporter.sendMail({
        from: this.config.get(
          'EMAIL_FROM',
          'Falcon Finance <noreply@falcon.local>',
        ),
        to: student.official_email,
        bcc: bcc.length ? bcc : undefined,
        subject: 'SGVU Fee Payment Receipt',
        html,
      });
    } catch (err) {
      this.logger.warn(
        `Receipt email failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
