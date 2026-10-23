import * as ExcelJS from 'exceljs';
import JSZip from 'jszip';
import * as nodemailer from 'nodemailer';

describe('production dependency compatibility', () => {
  it('generates a multipart email and recipient envelope without an SMTP connection', async () => {
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
      disableFileAccess: true,
      disableUrlAccess: true,
    });

    const info = await transporter.sendMail({
      from: 'Falcon Campus OS <noreply@example.invalid>',
      to: 'Faculty One <faculty@example.invalid>',
      bcc: ['parent@example.invalid'],
      subject: 'Falcon receipt — ₹125.50',
      text: 'Your fee receipt is available in the portal.',
      html: '<p>Your fee receipt is available in the portal.</p>',
    });

    expect(info.envelope).toEqual({
      from: 'noreply@example.invalid',
      to: ['faculty@example.invalid', 'parent@example.invalid'],
    });
    if (!Buffer.isBuffer(info.message)) {
      throw new Error('Buffered stream transport did not return a Buffer');
    }
    const message = info.message.toString('utf8');
    expect(message).toContain('To: Faculty One <faculty@example.invalid>');
    // Stream transport retains BCC for inspection; no SMTP transport sends this fixture.
    expect(message).toContain('multipart/alternative');
    expect(message).toContain('Content-Type: text/plain; charset=utf-8');
    expect(message).toContain('Content-Type: text/html; charset=utf-8');
    expect(message).toContain('Your fee receipt is available in the portal.');
    expect(info.messageId).toMatch(/^<.+>$/);
  });

  it('roundtrips an XLSX export with extended conditional formatting and valid UUID identifiers', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Marks');
    worksheet.addRows([
      ['Student', 'Marks'],
      ['Faculty review fixture', 42],
      ['Second fixture', 73],
    ]);
    worksheet.addConditionalFormatting({
      ref: 'B2:B3',
      rules: [
        {
          type: 'iconSet',
          priority: 1,
          iconSet: '3Stars',
          cfvo: [
            { type: 'percent', value: 0 },
            { type: 'percent', value: 33 },
            { type: 'percent', value: 67 },
          ],
        },
      ],
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const archive = await JSZip.loadAsync(buffer);
    const sheetXml = await archive
      .file('xl/worksheets/sheet1.xml')!
      .async('string');
    expect(sheetXml).toContain('<x14:iconSet iconSet="3Stars"');
    expect(sheetXml).toMatch(
      /<x14:cfRule[^>]*id="\{[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\}"/i,
    );

    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(buffer);
    const restoredSheet = restored.getWorksheet('Marks')!;
    expect(restoredSheet.getCell('A2').value).toBe('Faculty review fixture');
    expect(restoredSheet.getCell('B2').value).toBe(42);
    expect(restoredSheet.getCell('B3').value).toBe(73);
    const secondArchive = await JSZip.loadAsync(
      await restored.xlsx.writeBuffer(),
    );
    const restoredXml = await secondArchive
      .file('xl/worksheets/sheet1.xml')!
      .async('string');
    expect(restoredXml).toContain('<x14:iconSet iconSet="3Stars"');
  });
});
