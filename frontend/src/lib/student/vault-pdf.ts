/**
 * Formatted PDF copies for Student Document Vault
 * (admission certificates + fee receipts).
 */

export type VaultPdfStudent = {
  name: string;
  enrollmentNo: string;
  admissionNo?: string;
  program?: string;
};

export type VaultPdfField = {
  label: string;
  value: string;
};

export type VaultPdfPayload = {
  kind: 'document' | 'receipt';
  title: string;
  status: string;
  fields: VaultPdfField[];
  student: VaultPdfStudent;
  filename?: string;
};

function asciiSafe(text: string, max = 120): string {
  return String(text ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function slugFilename(title: string, kind: string): string {
  const base = asciiSafe(title, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `SGVU-${kind}-${base || 'copy'}.pdf`;
}

function drawWrapped(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = doc.splitTextToSize(asciiSafe(text, 400), maxWidth) as string[];
  for (const line of lines) {
    doc.text(line, x, y);
    y += lineHeight;
  }
  return y;
}

async function buildVaultPdf(
  payload: VaultPdfPayload,
): Promise<{ blob: Blob; filename: string }> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const navy: [number, number, number] = [11, 36, 71];
  const gold: [number, number, number] = [198, 161, 91];
  const muted: [number, number, number] = [100, 110, 125];
  const line: [number, number, number] = [210, 214, 220];

  // Header band
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 78, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 78, pageW, 3, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('SURESH GYAN VIHAR UNIVERSITY', margin, 34);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Student Document Vault  |  Official Copy', margin, 52);
  doc.setFontSize(9);
  doc.text(
    payload.kind === 'receipt' ? 'FEE PAYMENT RECEIPT' : 'ADMISSION DOCUMENT COPY',
    margin,
    68,
  );

  let y = 112;

  // Document title
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  y = drawWrapped(doc, payload.title, margin, y, contentW, 20);
  y += 6;

  // Status pill
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  const status = asciiSafe(payload.status || 'ON FILE', 24).toUpperCase();
  const statusW = doc.getTextWidth(status) + 16;
  const isOk = /VERIFIED|PAID|AVAILABLE|ON FILE/i.test(status);
  if (isOk) doc.setFillColor(220, 252, 231);
  else doc.setFillColor(254, 243, 199);
  doc.roundedRect(margin, y - 10, statusW, 18, 4, 4, 'F');
  doc.setTextColor(isOk ? 22 : 146, isOk ? 101 : 64, isOk ? 52 : 14);
  doc.text(status, margin + 8, y + 2);
  y += 28;

  // Student block
  doc.setDrawColor(...line);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(margin, y, contentW, 78, 6, 6, 'FD');

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Student details', margin + 14, y + 18);

  const studentRows: Array<[string, string]> = [
    ['Name', payload.student.name || 'Student'],
    ['Enrollment No.', payload.student.enrollmentNo || '-'],
    ['Admission No.', payload.student.admissionNo || '-'],
    ['Program', payload.student.program || '-'],
  ];

  let sy = y + 36;
  doc.setFontSize(9);
  for (const [label, value] of studentRows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...muted);
    doc.text(asciiSafe(label, 24), margin + 14, sy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.text(asciiSafe(value, 52), margin + 120, sy);
    sy += 12;
  }
  y += 96;

  // Details table header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text(
    payload.kind === 'receipt' ? 'Payment details' : 'Document details',
    margin,
    y,
  );
  y += 8;
  doc.setDrawColor(...navy);
  doc.setLineWidth(1);
  doc.line(margin, y, margin + contentW, y);
  y += 16;

  // Two-column aligned field rows
  const labelCol = margin;
  const valueCol = margin + 150;
  const valueMax = contentW - 150;

  for (const field of payload.fields) {
    if (y > pageH - 100) {
      doc.addPage();
      y = margin;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...muted);
    doc.text(asciiSafe(field.label, 28), labelCol, y);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    const before = y;
    y = drawWrapped(
      doc,
      field.value || '-',
      valueCol,
      y,
      valueMax,
      12,
    );
    // Ensure at least one row spacing
    if (y < before + 16) y = before + 16;

    doc.setDrawColor(...line);
    doc.setLineWidth(0.4);
    doc.line(margin, y - 4, margin + contentW, y - 4);
    y += 10;
  }

  y += 18;

  // Note box
  if (y > pageH - 140) {
    doc.addPage();
    y = margin;
  }
  doc.setFillColor(255, 251, 235);
  doc.setDrawColor(...gold);
  doc.roundedRect(margin, y, contentW, 52, 6, 6, 'FD');
  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('Important', margin + 12, y + 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  const note =
    payload.kind === 'receipt'
      ? 'This is a system-generated fee receipt copy from the Falcon Student Portal. Present with a valid ID when requested by accounts or scholarship offices.'
      : 'This is a system-generated admission document copy from the Falcon Student Portal. Original verified files are retained by the University Registrar.';
  drawWrapped(doc, note, margin + 12, y + 30, contentW - 24, 11);

  // Signature block
  y = pageH - 88;
  doc.setDrawColor(...muted);
  doc.setLineWidth(0.7);
  doc.line(pageW - margin - 160, y, pageW - margin, y);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navy);
  doc.text(
    payload.kind === 'receipt' ? 'Finance Office' : 'University Registrar',
    pageW - margin - 160,
    y + 14,
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text('Suresh Gyan Vihar University', pageW - margin - 160, y + 26);

  // Footer
  doc.setDrawColor(...line);
  doc.line(margin, pageH - 40, pageW - margin, pageH - 40);
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')}  |  Falcon Document Vault  |  SGVU`,
    margin,
    pageH - 24,
  );

  const filename =
    payload.filename ||
    slugFilename(payload.title, payload.kind === 'receipt' ? 'Receipt' : 'Document');
  return { blob: doc.output('blob'), filename };
}

/** Generate and download a properly aligned A4 vault PDF. */
export async function downloadVaultPdf(payload: VaultPdfPayload): Promise<void> {
  const { blob, filename } = await buildVaultPdf(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Build a vault PDF blob (for in-dialog preview when no original file exists). */
export async function buildVaultPdfBlob(
  payload: VaultPdfPayload,
): Promise<{ blob: Blob; filename: string }> {
  return buildVaultPdf(payload);
}
