import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  decodePDFRawStream,
  PDFDocument,
  PDFPage,
  PDFRawStream,
} from 'pdf-lib';
import { DataSource } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';

describe('official transcript PDF publication security (mocked database)', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const transcript = '22222222-2222-4222-8222-222222222222';
  const student = '33333333-3333-4333-8333-333333333333';
  const metadata = {
    transcript_id: transcript,
    student_user_id: student,
    semester: 4,
    status: 'APPROVED',
    student_name: 'Transcript Test Student',
    enrollment_no: 'TRANSCRIPT-TEST',
  };
  const report = {
    course_code: 'TEST101',
    course_name: 'Official Report Course',
    exam_type: 'END_TERM',
    marks_obtained: '78',
    max_marks: '100',
    grade: 'A',
    result_status: 'PASS',
  };

  function fixture() {
    const query = jest
      .fn<Promise<Array<Record<string, unknown>>>, [string, unknown[]]>()
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce([report]);
    const storage = {
      buildKey: jest
        .fn()
        .mockReturnValue(`${tenant}/transcripts/${transcript}.pdf`),
      upload: jest
        .fn()
        .mockResolvedValue({ url: '/uploads/test-transcript.pdf' }),
    };
    const service = new OfficialTranscriptPdfService(
      { query } as unknown as DataSource,
      storage as unknown as ObjectStorageService,
    );
    return { service, query, storage };
  }

  async function decodedPdf(buffer: Buffer) {
    const document = await PDFDocument.load(buffer);
    const text: string[] = [];
    for (const [, object] of document.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFRawStream)) continue;
      const stream = Buffer.from(decodePDFRawStream(object).decode()).toString(
        'latin1',
      );
      for (const match of stream.matchAll(/<([0-9a-f]+)>\s*Tj/gi)) {
        text.push(Buffer.from(match[1], 'hex').toString('latin1'));
      }
    }
    return { document, text: text.join('\n') };
  }

  afterEach(() => jest.restoreAllMocks());

  it('creates real PDF bytes from the official report snapshot and stores those exact bytes', async () => {
    const { service, query, storage } = fixture();
    const draw = jest.spyOn(PDFPage.prototype, 'drawText');

    const result = await service.generate(tenant, transcript);

    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect((await PDFDocument.load(result.buffer)).getPageCount()).toBe(1);
    expect(draw).toHaveBeenCalledWith(
      'TEST101 - Official Report Course: 78/100 (A)',
      expect.any(Object),
    );
    expect(storage.upload).toHaveBeenCalledWith(
      tenant,
      `${tenant}/transcripts/${transcript}.pdf`,
      result.buffer,
      'application/pdf',
    );
    expect(query).toHaveBeenNthCalledWith(2, expect.any(String), [
      tenant,
      student,
      4,
    ]);
  });

  it('requires both declaration timestamps and matching tenant, student, semester, course and exam type', async () => {
    const { service, query } = fixture();
    await service.generate(tenant, transcript);

    const sql = query.mock.calls[1][0];
    expect(sql).toContain('FROM student_exam_reports r');
    expect(sql).toContain(
      's.session_id = r.session_id AND s.tenant_id = r.tenant_id',
    );
    expect(sql).toContain(
      's.course_id = r.course_id AND s.exam_type = r.exam_type',
    );
    expect(sql).toContain(
      'c.course_id = r.course_id AND c.tenant_id = r.tenant_id',
    );
    expect(sql).toContain(
      'r.tenant_id = $1 AND r.student_user_id = $2 AND s.semester = $3',
    );
    expect(sql).toContain(
      'r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL',
    );
    expect(sql).not.toContain('academic_marks');
    expect(sql).not.toContain('student_course_enrollments');
    const metadataSql = query.mock.calls[0][0];
    expect(metadataSql).toContain('u.tenant_id = t.tenant_id');
    expect(metadataSql).toContain('sp.tenant_id = t.tenant_id');
  });

  it('paginates every declared row without truncation and repeats continuation headers and numbered footers', async () => {
    const { service, query, storage } = fixture();
    const reports = Array.from({ length: 85 }, (_, index) => ({
      ...report,
      course_code: `LONG${String(index).padStart(3, '0')}`,
      course_name: `Published course ${index}`,
    }));
    query
      .mockReset()
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce(reports);
    const result = await service.generate(tenant, transcript);
    const { document, text } = await decodedPdf(result.buffer);

    expect(document.getPageCount()).toBeGreaterThan(1);
    for (const row of reports) {
      expect(text.match(new RegExp(row.course_code, 'g'))).toHaveLength(1);
      expect(text).toContain(row.course_name);
    }
    expect(text.match(/OFFICIAL TRANSCRIPT/g)).toHaveLength(
      document.getPageCount(),
    );
    expect(text.match(/Results/g)).toHaveLength(document.getPageCount());
    expect(text.match(/TRANSCRIPT-TEST/g)).toHaveLength(
      document.getPageCount(),
    );
    for (let page = 1; page <= document.getPageCount(); page++) {
      expect(text).toContain(`Page ${page} of ${document.getPageCount()}`);
    }
    expect(storage.upload).toHaveBeenCalledWith(
      tenant,
      `${tenant}/transcripts/${transcript}.pdf`,
      result.buffer,
      'application/pdf',
    );
  });

  it('wraps long identity and course fields without clipping text or drawing over the footer', async () => {
    const { service, query } = fixture();
    const courseWords = Array.from(
      { length: 170 },
      (_, index) => `CourseWord${String(index).padStart(3, '0')}`,
    );
    const identityWords = Array.from(
      { length: 25 },
      (_, index) => `NamePart${index}`,
    );
    const reports = Array.from({ length: 42 }, (_, index) => ({
      ...report,
      course_code: `BOUNDARY${String(index).padStart(3, '0')}`,
      course_name: index === 41 ? courseWords.join(' ') : `Boundary ${index}`,
    }));
    query
      .mockReset()
      .mockResolvedValueOnce([
        { ...metadata, student_name: identityWords.join(' ') },
      ])
      .mockResolvedValueOnce(reports);
    const draw = jest.spyOn(PDFPage.prototype, 'drawText');
    const result = await service.generate(tenant, transcript);
    const { document, text } = await decodedPdf(result.buffer);

    expect(document.getPageCount()).toBeGreaterThan(1);
    for (const word of courseWords) expect(text).toContain(word);
    for (const word of identityWords) expect(text).toContain(word);
    for (const row of reports) expect(text).toContain(row.course_code);
    for (const [line, options] of draw.mock.calls) {
      expect(options).toBeDefined();
      if (!options) throw new Error('PDF text options must be explicit');
      expect(options.x).toBeGreaterThanOrEqual(40);
      expect(options.y).toBeGreaterThanOrEqual(40);
      expect(options.y).toBeLessThanOrEqual(792);
      if (options.font && options.size && options.x !== undefined) {
        expect(
          options.x + options.font.widthOfTextAtSize(line, options.size),
        ).toBeLessThanOrEqual(555);
      }
      if (line.includes('CourseWord') || line.includes('BOUNDARY')) {
        expect(options.y).toBeGreaterThan(100);
      }
    }
  });

  it.each([undefined, null, '', '   ', 'not-a-tenant'])(
    'rejects invalid tenant context %p before database or storage access',
    async (value) => {
      const { service, query, storage } = fixture();
      await expect(
        service.generate(value as unknown as string, transcript),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
      expect(storage.upload).not.toHaveBeenCalled();
    },
  );

  it('uses only the authenticated tenant and rejects a transcript absent from that tenant', async () => {
    const { service, query, storage } = fixture();
    query.mockReset().mockResolvedValueOnce([]);
    await expect(service.generate(tenant, transcript)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('t.transcript_id = $1 AND t.tenant_id = $2'),
      [transcript, tenant],
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it.each(['REQUESTED', 'REJECTED', 'ARCHIVED'])(
    'does not generate a transcript with status %s',
    async (status) => {
      const { service, query, storage } = fixture();
      query.mockReset().mockResolvedValueOnce([{ ...metadata, status }]);
      await expect(service.generate(tenant, transcript)).rejects.toThrow(
        'Transcript must be approved',
      );
      expect(query).toHaveBeenCalledTimes(1);
      expect(storage.upload).not.toHaveBeenCalled();
    },
  );

  it('rejects a semester with no officially declared reports rather than issuing an empty PDF', async () => {
    const { service, query, storage } = fixture();
    query
      .mockReset()
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce([]);
    await expect(service.generate(tenant, transcript)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(storage.buildKey).not.toHaveBeenCalled();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('rejects withheld official results rather than exposing their marks or silently omitting them', async () => {
    const { service, query, storage } = fixture();
    query
      .mockReset()
      .mockResolvedValueOnce([metadata])
      .mockResolvedValueOnce([
        report,
        { ...report, result_status: 'WITHHELD' },
      ]);
    await expect(service.generate(tenant, transcript)).rejects.toThrow(
      'official results are withheld',
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('propagates database failures without writing a document', async () => {
    const { service, query, storage } = fixture();
    query
      .mockReset()
      .mockResolvedValueOnce([metadata])
      .mockRejectedValueOnce(new Error('report database unavailable'));
    await expect(service.generate(tenant, transcript)).rejects.toThrow(
      'report database unavailable',
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('propagates storage failures instead of claiming a successful transcript', async () => {
    const { service, storage } = fixture();
    storage.upload.mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(service.generate(tenant, transcript)).rejects.toThrow(
      'storage unavailable',
    );
  });
});
