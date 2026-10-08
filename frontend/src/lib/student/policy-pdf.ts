import type { UniversityPolicy } from '@/lib/student/university-policies-data';
import { POLICY_CATEGORY_LABELS } from '@/lib/student/university-policies-data';

function asciiSafe(text: string, max = 220): string {
  return String(text ?? '')
    .replace(/[—–]/g, '-')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function slug(text: string): string {
  return asciiSafe(text, 48)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function createDoc() {
  const { jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
}

function drawHeader(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  subtitle: string,
) {
  const pageW = doc.internal.pageSize.getWidth();
  const navy: [number, number, number] = [11, 36, 71];
  const gold: [number, number, number] = [198, 161, 91];
  doc.setFillColor(...navy);
  doc.rect(0, 0, pageW, 72, 'F');
  doc.setFillColor(...gold);
  doc.rect(0, 72, pageW, 3, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Suresh Gyan Vihar University', 48, 32);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(asciiSafe(subtitle, 90), 48, 52);
}

function ensureSpace(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  y: number,
  need: number,
): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + need < pageH - 48) return y;
  doc.addPage();
  return 48;
}

function writePolicyBody(
  doc: InstanceType<typeof import('jspdf').jsPDF>,
  policy: UniversityPolicy,
  startY: number,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 48;
  const contentW = pageW - margin * 2;
  const navy: [number, number, number] = [11, 36, 71];
  const muted: [number, number, number] = [90, 100, 115];
  let y = startY;

  doc.setTextColor(...navy);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  y = ensureSpace(doc, y, 24);
  doc.text(asciiSafe(policy.name, 90), margin, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(
    asciiSafe(
      `${POLICY_CATEGORY_LABELS[policy.category]}  |  Version ${policy.version}  |  Updated ${policy.lastUpdated}  |  ${policy.status}`,
      120,
    ),
    margin,
    y,
  );
  y += 16;

  doc.setTextColor(...navy);
  doc.setFontSize(10);
  const summaryLines = doc.splitTextToSize(asciiSafe(policy.summary, 800), contentW) as string[];
  for (const line of summaryLines) {
    y = ensureSpace(doc, y, 14);
    doc.text(line, margin, y);
    y += 13;
  }
  y += 8;

  for (const section of policy.sections) {
    y = ensureSpace(doc, y, 20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...navy);
    doc.setFontSize(11);
    doc.text(asciiSafe(section.heading, 80), margin, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    for (const bullet of section.bullets) {
      const lines = doc.splitTextToSize(`- ${asciiSafe(bullet, 500)}`, contentW - 10) as string[];
      for (const line of lines) {
        y = ensureSpace(doc, y, 13);
        doc.text(line, margin + 8, y);
        y += 12;
      }
      y += 3;
    }
    y += 6;
  }

  y = ensureSpace(doc, y, 28);
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(asciiSafe(`Applies to: ${policy.appliesTo}`, 100), margin, y);
  y += 12;
  doc.text(asciiSafe(`Issuing authority: ${policy.authority}`, 100), margin, y);
  return y + 20;
}

function triggerDownload(blob: Blob, filename: string) {
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

export async function downloadPolicyPdf(policy: UniversityPolicy): Promise<void> {
  const doc = await createDoc();
  drawHeader(doc, 'University Policy Document');
  writePolicyBody(doc, policy, 100);
  const pageH = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(
    `Generated ${new Date().toLocaleString('en-IN')} | Falcon Student Portal | SGVU`,
    48,
    pageH - 24,
  );
  triggerDownload(doc.output('blob'), `SGVU-Policy-${slug(policy.name)}.pdf`);
}

export async function downloadAllPoliciesPdf(policies: UniversityPolicy[]): Promise<void> {
  const doc = await createDoc();
  drawHeader(doc, 'University Policies Pack');
  let y = 100;
  const active = policies.filter((p) => p.status === 'Active');
  for (let i = 0; i < active.length; i += 1) {
    if (i > 0) {
      doc.addPage();
      drawHeader(doc, 'University Policies Pack');
      y = 100;
    }
    y = writePolicyBody(doc, active[i]!, y);
  }
  triggerDownload(doc.output('blob'), 'SGVU-University-Policies-Pack.pdf');
}
