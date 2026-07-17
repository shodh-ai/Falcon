import { Injectable } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb, type PDFFont } from 'pdf-lib';
import {
  formatPeriodLabel,
  monthNameToNumber,
  toYearMonthKey,
} from './payslip-period.util';

export type PayslipPeriodRow = {
  periodKey: string;
  grossPay: number;
  netPay: number;
  workingDays: number | null;
  lwpDays: number;
};

export type PayslipPeriodPdfInput = {
  staffName: string;
  employeeId?: string | null;
  designation?: string | null;
  department?: string | null;
  email?: string | null;
  periodFrom: string;
  periodTo: string;
  rows: PayslipPeriodRow[];
  documentRef?: string;
  purpose?: string | null;
};

const NAVY = rgb(0.05, 0.22, 0.45);
const BLUE_BAR = rgb(0.08, 0.28, 0.55);
const MUTED = rgb(0.25, 0.25, 0.3);
const CREAM = rgb(0.98, 0.96, 0.92);

function pdfSafeText(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/₹/g, 'Rs.')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

function wrapText(
  text: string,
  maxWidth: number,
  font: PDFFont,
  size: number,
): string[] {
  const safe = pdfSafeText(text);
  const words = safe.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth) {
      if (line) lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function formatAmount(value: number): string {
  return value.toLocaleString('en-IN');
}

type TableColumn = { label: string; width: number; align: 'left' | 'right' };

function drawConsolidatedSalaryTable(opts: {
  page: ReturnType<PDFDocument['addPage']>;
  x: number;
  y: number;
  contentWidth: number;
  font: PDFFont;
  bold: PDFFont;
  staffName: string;
  periodLabel: string;
  monthCount: number;
  rows: PayslipPeriodRow[];
}): number {
  const {
    page,
    x,
    contentWidth,
    font,
    bold,
    staffName,
    periodLabel,
    monthCount,
    rows,
  } = opts;
  let y = opts.y;

  const rowCount = rows.length;
  const dataSize = rowCount > 14 ? 8 : rowCount > 8 ? 8.5 : 9;
  const headerSize = 9;
  const rowHeight = rowCount > 14 ? 14 : 16;

  page.drawText('Salary Statement (Consolidated Payslip)', {
    x,
    y,
    size: 10.5,
    font: bold,
    color: NAVY,
  });
  y -= 18;
  page.drawText(`Employee: ${pdfSafeText(staffName)}`, {
    x,
    y,
    size: 9.5,
    font: bold,
    color: NAVY,
  });
  y -= 14;
  const periodMeta = `Period: ${periodLabel} (${monthCount} month${monthCount === 1 ? '' : 's'})`;
  page.drawText(pdfSafeText(periodMeta), {
    x,
    y,
    size: 8.5,
    font,
    color: MUTED,
  });
  y -= 20;

  const cols: TableColumn[] = [
    { label: 'Period', width: 118, align: 'left' },
    { label: 'Gross (Rs.)', width: 98, align: 'right' },
    { label: 'Net (Rs.)', width: 88, align: 'right' },
    { label: 'Work days', width: 72, align: 'right' },
    { label: 'LWP', width: 52, align: 'right' },
  ];

  let colX = x;
  for (const col of cols) {
    const labelW = bold.widthOfTextAtSize(col.label, headerSize);
    const tx = col.align === 'right' ? colX + col.width - labelW : colX;
    page.drawText(col.label, {
      x: tx,
      y,
      size: headerSize,
      font: bold,
      color: NAVY,
    });
    colX += col.width;
  }
  y -= 6;
  page.drawLine({
    start: { x, y },
    end: { x: x + contentWidth, y },
    thickness: 0.6,
    color: rgb(0.75, 0.78, 0.82),
  });
  y -= rowHeight;

  const drawRow = (cells: string[], useBold = false, color = MUTED) => {
    const rowFont = useBold ? bold : font;
    let cx = x;
    for (let i = 0; i < cols.length; i++) {
      const col = cols[i];
      const text = pdfSafeText(cells[i] ?? '');
      const tw = rowFont.widthOfTextAtSize(text, dataSize);
      const tx = col.align === 'right' ? cx + col.width - tw : cx;
      page.drawText(text, {
        x: tx,
        y,
        size: dataSize,
        font: rowFont,
        color: useBold ? NAVY : color,
      });
      cx += col.width;
    }
    y -= rowHeight;
  };

  for (const r of rows) {
    drawRow([
      formatPeriodLabel(r.periodKey),
      formatAmount(r.grossPay),
      formatAmount(r.netPay),
      r.workingDays != null ? String(r.workingDays) : '-',
      String(r.lwpDays ?? 0),
    ]);
  }

  y -= 2;
  page.drawLine({
    start: { x, y: y + 10 },
    end: { x: x + contentWidth, y: y + 10 },
    thickness: 0.4,
    color: rgb(0.82, 0.84, 0.86),
  });

  const totalGross = rows.reduce((s, r) => s + r.grossPay, 0);
  const totalNet = rows.reduce((s, r) => s + r.netPay, 0);
  drawRow(
    ['Total', formatAmount(totalGross), formatAmount(totalNet), '', ''],
    true,
  );

  return y - 8;
}

@Injectable()
export class PayslipPdfService {
  /** Single-page official salary certificate on university letterpad (download only). */
  async generatePeriodStatement(input: PayslipPeriodPdfInput): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const { width, height } = page.getSize();
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);

    const margin = 52;
    const contentWidth = width - margin * 2;

    // Letterpad top bar
    page.drawRectangle({
      x: 0,
      y: height - 28,
      width,
      height: 28,
      color: BLUE_BAR,
    });
    page.drawRectangle({
      x: margin,
      y: height - 108,
      width: contentWidth,
      height: 72,
      color: CREAM,
    });
    page.drawLine({
      start: { x: margin, y: height - 108 },
      end: { x: width - margin, y: height - 108 },
      thickness: 1,
      color: NAVY,
    });

    const uni = 'SURESH GYAN VIHAR UNIVERSITY';
    const uniW = bold.widthOfTextAtSize(uni, 14);
    page.drawText(uni, {
      x: (width - uniW) / 2,
      y: height - 62,
      size: 14,
      font: bold,
      color: NAVY,
    });
    const sub =
      'Jaipur, Rajasthan - 302017  |  hr@gyanvihar.org  |  www.gyanvihar.org';
    const subW = sans.widthOfTextAtSize(sub, 8);
    page.drawText(sub, {
      x: (width - subW) / 2,
      y: height - 78,
      size: 8,
      font: sans,
      color: MUTED,
    });

    const title = 'SALARY CERTIFICATE';
    const titleW = bold.widthOfTextAtSize(title, 13);
    page.drawText(title, {
      x: (width - titleW) / 2,
      y: height - 128,
      size: 13,
      font: bold,
      color: NAVY,
    });

    let y = height - 158;
    const today = new Date().toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    page.drawText(pdfSafeText(today), {
      x: margin,
      y,
      size: 10,
      font,
      color: MUTED,
    });
    if (input.documentRef) {
      const ref = `Ref: ${input.documentRef}`;
      const refW = font.widthOfTextAtSize(ref, 9);
      page.drawText(ref, {
        x: width - margin - refW,
        y,
        size: 9,
        font,
        color: MUTED,
      });
    }
    y -= 28;

    const drawParagraph = (text: string, size = 10.5, gap = 16) => {
      for (const line of wrapText(text, contentWidth, font, size)) {
        page.drawText(line, { x: margin, y, size, font, color: MUTED });
        y -= gap;
      }
      y -= 4;
    };

    const periodLabel =
      input.periodFrom === input.periodTo
        ? formatPeriodLabel(input.periodFrom)
        : `${formatPeriodLabel(input.periodFrom)} to ${formatPeriodLabel(input.periodTo)}`;

    page.drawText('To Whom It May Concern,', {
      x: margin,
      y,
      size: 11,
      font: bold,
      color: NAVY,
    });
    y -= 24;

    drawParagraph(
      `This is to certify that ${input.staffName}, Employee ID ${input.employeeId ?? 'N/A'}, ` +
        `is employed with Suresh Gyan Vihar University as ${input.designation ?? 'Faculty / Staff'} ` +
        `in the ${input.department ?? 'University'} department. The employee's registered email is ${input.email ?? 'on file'}.`,
    );

    drawParagraph(
      `The salary particulars for the requested period are drawn from the university's official payroll records and are summarised in the consolidated statement below:`,
      10,
      14,
    );

    y = drawConsolidatedSalaryTable({
      page,
      x: margin,
      y,
      contentWidth,
      font,
      bold,
      staffName: input.staffName,
      periodLabel,
      monthCount: input.rows.length,
      rows: input.rows,
    });

    const purpose = input.purpose?.trim() || 'official records';
    drawParagraph(
      `This salary certificate is issued upon the employee's request for the purpose of: ${purpose}. ` +
        `The information above is drawn from the university's official payroll records for the period stated.`,
    );

    drawParagraph(
      'We confirm that the particulars furnished herein are true and correct to the best of our knowledge. ' +
        'Should you require any further clarification, please contact the HR & Payroll Division at hr@gyanvihar.org.',
    );

    y -= 8;
    page.drawText('Yours sincerely,', {
      x: margin,
      y,
      size: 10.5,
      font,
      color: MUTED,
    });
    y -= 36;
    page.drawLine({
      start: { x: margin, y },
      end: { x: margin + 180, y },
      thickness: 0.5,
      color: MUTED,
    });
    y -= 16;
    page.drawText('Authorised Signatory', {
      x: margin,
      y,
      size: 10,
      font: bold,
      color: NAVY,
    });
    y -= 14;
    page.drawText('Human Resources Manager', {
      x: margin,
      y,
      size: 9.5,
      font,
      color: MUTED,
    });
    y -= 13;
    page.drawText('Suresh Gyan Vihar University', {
      x: margin,
      y,
      size: 9.5,
      font,
      color: MUTED,
    });
    y -= 13;
    page.drawText('Jaipur, Rajasthan - 302017', {
      x: margin,
      y,
      size: 9.5,
      font,
      color: MUTED,
    });

    page.drawLine({
      start: { x: margin, y: 42 },
      end: { x: width - margin, y: 42 },
      thickness: 0.4,
      color: rgb(0.8, 0.8, 0.82),
    });
    const footer =
      'Computer-generated salary certificate on official university letterpad.';
    const fw = sans.widthOfTextAtSize(footer, 7);
    page.drawText(footer, {
      x: (width - fw) / 2,
      y: 30,
      size: 7,
      font: sans,
      color: MUTED,
    });

    const bytes = await pdf.save();
    return Buffer.from(bytes);
  }

  async generate(input: {
    staffName: string;
    month: string;
    year: number;
    grossPay?: string | number | null;
    netPay?: string | number | null;
    workingDays?: number | null;
    lwpDays?: string | number | null;
  }): Promise<Buffer> {
    const monthNum = monthNameToNumber(input.month);
    const key = toYearMonthKey(input.year, monthNum || 1);
    return this.generatePeriodStatement({
      staffName: input.staffName,
      periodFrom: key,
      periodTo: key,
      rows: [
        {
          periodKey: key,
          grossPay: Number(input.grossPay ?? 0),
          netPay: Number(input.netPay ?? 0),
          workingDays: input.workingDays ?? null,
          lwpDays: Number(input.lwpDays ?? 0),
        },
      ],
    });
  }
}
