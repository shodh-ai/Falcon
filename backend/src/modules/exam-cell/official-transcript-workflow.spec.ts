import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';
import { OfficialTranscriptService } from './official-transcript.service';
import {
  TranscriptSource,
  transcriptRevisionHash,
} from './official-transcript-revisions';

const source: TranscriptSource = {
  tenant_id: 'tenant',
  student_user_id: 'student',
  semester: 6,
  student_name: 'Synthetic student',
  enrollment_no: 'SYNTHETIC',
  program_name: null,
  has_open_ufm: false,
  marks: [
    {
      course_id: 'course',
      course_code: 'SYNTH',
      course_name: 'Synthetic course',
      exam_type: 'END_TERM',
      marks_obtained: 40,
      max_marks: 50,
      grade: 'A',
    },
  ],
};
function issuanceQuery(status = 'APPROVED') {
  return jest.fn((sql: string) =>
    Promise.resolve(
      sql.startsWith('SELECT student_user_id FROM official_transcripts')
        ? [{ student_user_id: 'student' }]
        : sql.includes('SELECT status')
          ? [
              {
                transcript_id: 'issued',
                tenant_id: 'tenant',
                status,
                student_user_id: 'student',
                semester: 6,
                metadata: {
                  revision: 1,
                  source_revision_hash: transcriptRevisionHash(source),
                },
                pdf_url: '/uploads/existing.pdf',
                verification_code: 'A'.repeat(64),
              },
            ]
          : sql.includes('FROM users u LEFT JOIN student_profiles')
            ? [source]
            : sql.includes('FROM student_course_enrollments e')
              ? source.marks
              : [],
    ),
  );
}

describe('Official transcript issuance', () => {
  it('fails closed for legacy verification links without a bound source revision', async () => {
    const query = jest
      .fn()
      .mockResolvedValue([{ status: 'ARCHIVED', semester: 6 }]);
    const service = new OfficialTranscriptService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.verifyPublic('55386c6f5f29b40b'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledWith(expect.any(String), [
      '55386C6F5F29B40B',
    ]);
  });
  it('generates a verification code accepted by public verification validation', async () => {
    const drawText = jest.spyOn(PDFPage.prototype, 'drawText');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          transcript_id: 'transcript',
          student_user_id: 'student',
          semester: 6,
          student_name: 'Synthetic student',
          enrollment_no: 'SYNTHETIC',
        },
      ])
      .mockResolvedValueOnce([
        {
          course_code: 'SYNTH101',
          course_name: 'Synthetic course',
          exam_type: 'END_TERM',
          marks_obtained: 40,
          max_marks: 50,
          grade: 'A',
        },
      ]);
    const pdf = new OfficialTranscriptPdfService(
      { query } as never,
      {
        buildKey: jest.fn().mockReturnValue('tenant/transcript.pdf'),
        upload: jest
          .fn()
          .mockResolvedValue({ url: '/uploads/tenant/transcript.pdf' }),
      } as never,
    );
    const result = await pdf.generate('tenant', 'transcript');
    expect(result.verificationCode).toMatch(/^[A-F0-9]{64}$/);
    expect(result.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("AND am.status = 'PUBLISHED'"),
      ['tenant', 'student', 6],
    );
    expect(drawText).toHaveBeenCalledWith(
      'Verify at /api/verify/transcript/' + result.verificationCode,
      expect.any(Object),
    );
    drawText.mockRestore();
    const service = new OfficialTranscriptService(
      {
        query: jest
          .fn()
          .mockResolvedValue([{ status: 'ARCHIVED', semester: 6 }]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.verifyPublic(result.verificationCode),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('uses the actual updated student row when notifying transcript availability', async () => {
    const query = issuanceQuery();
    const transcriptGenerated = jest.fn();
    const service = new OfficialTranscriptService(
      {
        query,
        transaction: (run: (tx: { query: typeof query }) => unknown) =>
          run({ query }),
      } as never,
      {
        generate: jest.fn().mockResolvedValue({
          verificationCode: 'A'.repeat(64),
          url: '/uploads/tenant/transcript.pdf',
        }),
      } as never,
      { log: jest.fn() } as never,
      { transcriptGenerated } as never,
    );
    await service.generatePdf('tenant', 'transcript', { userId: 'actor' });
    expect(transcriptGenerated).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'student', semester: 6 }),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("SET status = 'ARCHIVED'"),
      expect.any(Array),
    );
  });

  it('rejects approval when no requested transcript row was updated', async () => {
    const generate = jest.fn();
    const service = new OfficialTranscriptService(
      {
        transaction: (run: (tx: { query: jest.Mock }) => unknown) =>
          run({ query: jest.fn().mockResolvedValue([]) }),
      } as never,
      { generate } as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.approve('tenant', 'transcript', { userId: 'actor' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(generate).not.toHaveBeenCalled();
  });

  it('does not request another transcript when an archived one exists', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM ufm_cases')
          ? []
          : sql.includes('SELECT DISTINCT u.user_id')
            ? [{ user_id: 'student' }]
            : sql.includes('SELECT transcript_id, status')
              ? [{ transcript_id: 'issued', status: 'ARCHIVED' }]
              : [],
      ),
    );
    const generate = jest.fn();
    const service = new OfficialTranscriptService(
      {
        query,
        transaction: (run: (tx: { query: typeof query }) => unknown) =>
          run({ query }),
      } as never,
      { generate } as never,
      { log: jest.fn() } as never,
      {} as never,
    );
    await expect(
      service.requestForSemester('tenant', 6, { userId: 'actor' }),
    ).resolves.toEqual({ semester: 6, requested: 0, transcript_ids: [] });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_xact_lock'),
      ['official-transcript:tenant:student'],
    );
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO official_transcripts'),
      ),
    ).toBe(false);
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes("status NOT IN ('ARCHIVED')"),
      ),
    ).toBe(false);
    expect(generate).not.toHaveBeenCalled();
  });

  it('resumes an approved request without creating another record', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM ufm_cases')
          ? []
          : sql.includes('SELECT DISTINCT u.user_id')
            ? [{ user_id: 'student' }]
            : sql.includes('SELECT transcript_id, status')
              ? [{ transcript_id: 'approved', status: 'APPROVED' }]
              : [],
      ),
    );
    const service = new OfficialTranscriptService(
      {
        query,
        transaction: (run: (tx: { query: typeof query }) => unknown) =>
          run({ query }),
      } as never,
      {} as never,
      { log: jest.fn() } as never,
      {} as never,
    );
    const generate = jest.spyOn(service, 'generatePdf').mockResolvedValue({
      transcript_id: 'approved',
      verification_code: 'A'.repeat(64),
      pdf_url: '/uploads/local.pdf',
      status: 'ARCHIVED',
    });
    await service.requestForSemester('tenant', 6, { userId: 'actor' });
    expect(generate).toHaveBeenCalledWith('tenant', 'approved', {
      userId: 'actor',
    });
    expect(
      query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO official_transcripts'),
      ),
    ).toBe(false);
  });

  it('returns the issued PDF on a generation retry without overwriting or notifying again', async () => {
    const query = issuanceQuery('ARCHIVED');
    const generate = jest.fn();
    const transcriptGenerated = jest.fn();
    const service = new OfficialTranscriptService(
      {
        transaction: (run: (tx: { query: typeof query }) => unknown) =>
          run({ query }),
      } as never,
      { generate } as never,
      { log: jest.fn() } as never,
      { transcriptGenerated } as never,
    );
    await expect(
      service.generatePdf('tenant', 'issued', { userId: 'actor' }),
    ).resolves.toMatchObject({
      pdf_url: '/uploads/existing.pdf',
      status: 'ARCHIVED',
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('FOR UPDATE'), [
      'issued',
      'tenant',
    ]);
    expect(generate).not.toHaveBeenCalled();
    expect(transcriptGenerated).not.toHaveBeenCalled();
  });

  it('does not notify when the generation transaction audit fails', async () => {
    const query = issuanceQuery();
    const transaction = { query };
    const log = jest.fn().mockRejectedValue(new Error('audit unavailable'));
    const transcriptGenerated = jest.fn();
    const service = new OfficialTranscriptService(
      {
        transaction: (run: (tx: typeof transaction) => unknown) =>
          run(transaction),
      } as never,
      {
        generate: jest.fn().mockResolvedValue({
          verificationCode: 'A'.repeat(64),
          url: '/uploads/new.pdf',
        }),
      } as never,
      { log } as never,
      { transcriptGenerated } as never,
    );
    await expect(
      service.generatePdf('tenant', 'issued', { userId: 'actor' }),
    ).rejects.toThrow('audit unavailable');
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSCRIPT_GENERATED' }),
      transaction,
    );
    expect(transcriptGenerated).not.toHaveBeenCalled();
  });

  it('rejects invalid semesters before database writes', async () => {
    const query = jest.fn();
    const service = new OfficialTranscriptService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    for (const semester of [0, -1, 1.5, NaN]) {
      await expect(
        service.requestForSemester('tenant', semester, { userId: 'actor' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('includes every published course across multiple PDF pages', async () => {
    const drawText = jest.spyOn(PDFPage.prototype, 'drawText');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          transcript_id: 'transcript',
          student_user_id: 'student',
          semester: 6,
          student_name: 'Synthetic student',
          enrollment_no: 'SYNTHETIC',
        },
      ])
      .mockResolvedValueOnce(
        Array.from({ length: 80 }, (_, index) => ({
          course_code: `SYNTH${index}`,
          course_name: `Synthetic course ${index}`,
          exam_type: 'END_TERM',
          marks_obtained: 40,
          max_marks: 50,
          grade: 'A',
        })),
      );
    const pdf = new OfficialTranscriptPdfService(
      { query } as never,
      {
        buildKey: jest.fn().mockReturnValue('tenant/transcript.pdf'),
        upload: jest
          .fn()
          .mockResolvedValue({ url: '/uploads/tenant/transcript.pdf' }),
      } as never,
    );
    const result = await pdf.generate('tenant', 'transcript');
    const doc = await PDFDocument.load(result.buffer);
    expect(doc.getPageCount()).toBeGreaterThan(1);
    expect(drawText).toHaveBeenCalledWith(
      expect.stringContaining('SYNTH79'),
      expect.any(Object),
    );
    drawText.mockRestore();
  });

  it('rejects an empty unpublished transcript instead of uploading a blank PDF', async () => {
    const upload = jest.fn();
    const pdf = new OfficialTranscriptPdfService(
      {
        query: jest
          .fn()
          .mockResolvedValueOnce([{ student_user_id: 'student', semester: 6 }])
          .mockResolvedValueOnce([]),
      } as never,
      { upload } as never,
    );
    await expect(pdf.generate('tenant', 'transcript')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(upload).not.toHaveBeenCalled();
  });

  it('uses the caller transaction for PDF reads without acquiring another pool connection', async () => {
    const globalQuery = jest
      .fn()
      .mockRejectedValue(new Error('unexpected second connection'));
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        {
          transcript_id: 'transcript',
          student_user_id: 'student',
          semester: 6,
          student_name: 'Synthetic student',
          enrollment_no: 'SYNTHETIC',
        },
      ])
      .mockResolvedValueOnce([
        {
          course_code: 'SYNTH',
          course_name: 'Synthetic course',
          exam_type: 'END_TERM',
          marks_obtained: 40,
          max_marks: 50,
          grade: 'A',
        },
      ]);
    const pdf = new OfficialTranscriptPdfService(
      { query: globalQuery } as never,
      {
        buildKey: jest.fn().mockReturnValue('tenant/transcript.pdf'),
        upload: jest
          .fn()
          .mockResolvedValue({ url: '/uploads/tenant/transcript.pdf' }),
      } as never,
    );
    await expect(
      pdf.generate('tenant', 'transcript', { query }),
    ).resolves.toMatchObject({
      url: '/uploads/tenant/transcript.pdf',
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(globalQuery).not.toHaveBeenCalled();
  });

  it('uses immutable storage keys even when an issuance is retried after a transaction failure', async () => {
    const buildKey = jest.fn(
      (tenant: string, filename: string) => `${tenant}/${filename}`,
    );
    const upload = jest.fn((tenant: string, key: string) =>
      Promise.resolve({ url: `/uploads/${key}` }),
    );
    const pdf = new OfficialTranscriptPdfService(
      { query: jest.fn() } as never,
      { buildKey, upload } as never,
    );
    const first = await pdf.generate('tenant', 'issued', undefined, source);
    const next = await pdf.generate('tenant', 'issued', undefined, source);
    expect(first.url).not.toBe(next.url);
    expect(buildKey).toHaveBeenCalledWith(
      'tenant',
      expect.stringMatching(/^transcripts\/issued-[a-f0-9]{32}\.pdf$/),
    );
    expect(first.sourceHash).toBe(transcriptRevisionHash(source));
    expect(first.pdfHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
