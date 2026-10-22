import { NotFoundException } from '@nestjs/common';
import { createReadStream } from 'fs';
import type { Response } from 'express';
import { UploadsController } from './uploads.controller';
import {
  TranscriptSource,
  transcriptRevisionHash,
} from '../modules/exam-cell/official-transcript-revisions';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'test-upload-id') }));

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  createReadStream: jest.fn(),
}));

describe('Official transcript download ownership', () => {
  const transcriptId = '11111111-1111-4111-8111-111111111111';
  const path = `/uploads/tenant/2026/10/transcripts/${transcriptId}.pdf`;
  const key = `tenant/2026/10/transcripts/${transcriptId}.pdf`;
  const pipe = jest.fn();
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const source: TranscriptSource = {
    tenant_id: 'tenant',
    student_user_id: 'owner',
    semester: 6,
    student_name: 'Synthetic owner',
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
  const issued = {
    transcript_id: transcriptId,
    tenant_id: 'tenant',
    student_user_id: 'owner',
    semester: 6,
    status: 'ARCHIVED',
    pdf_url: path,
    verification_code: 'A'.repeat(64),
    metadata: {
      revision: 1,
      source_revision_hash: transcriptRevisionHash(source),
    },
  };
  function queryFor(record = issued, current = source) {
    return jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('FROM official_transcripts')
          ? [record]
          : sql.includes('FROM users u LEFT JOIN student_profiles')
            ? [current]
            : sql.includes('FROM student_course_enrollments e')
              ? current.marks
              : [],
      ),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(createReadStream).mockReturnValue({ pipe } as never);
  });

  it.each([false, true])(
    'denies another student in the same tenant before streaming (object storage: %s)',
    async (objectStorage) => {
      const getDownloadStream = jest.fn().mockResolvedValue({ pipe });
      const query = jest.fn().mockResolvedValue([{ student_user_id: 'owner' }]);
      const controller = new UploadsController(
        {
          isEnabled: () => objectStorage,
          getDownloadStream,
        } as never,
        { query } as never,
      );
      await expect(
        controller.downloadFile(
          path,
          objectStorage ? key : '',
          { user: { tenant_id: 'tenant', user_id: 'other', role: 'Student' } },
          res,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(query).toHaveBeenCalledWith(expect.any(String), [
        'tenant',
        transcriptId,
      ]);
      expect(getDownloadStream).not.toHaveBeenCalled();
      expect(createReadStream).not.toHaveBeenCalled();
    },
  );

  it.each([
    { user_id: 'owner', role: 'Student' },
    { user_id: 'staff', role: 'ExamCell' },
    { user_id: 'staff', role: 'Faculty', roles: ['DeputyCOE'] },
  ])('allows the owner or existing examination staff: %o', async (user) => {
    const controller = new UploadsController(
      { isEnabled: () => false } as never,
      {
        query: queryFor(),
      } as never,
    );
    await controller.downloadFile(
      path,
      '',
      { user: { tenant_id: 'tenant', ...user } },
      res,
    );
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('does not grant staff access to a transcript absent from their tenant', async () => {
    const controller = new UploadsController(
      { isEnabled: () => true } as never,
      { query: jest.fn().mockResolvedValue([]) } as never,
    );
    await expect(
      controller.downloadFile(
        '',
        key,
        { user: { tenant_id: 'tenant', user_id: 'staff', role: 'ExamCell' } },
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pipe).not.toHaveBeenCalled();
  });

  it.each(['REVOKED', 'SUPERSEDED'])(
    'denies %s historical copies even to the owner and staff',
    async (status) => {
      for (const role of ['Student', 'ExamCell']) {
        const controller = new UploadsController(
          { isEnabled: () => false } as never,
          { query: queryFor({ ...issued, status }) } as never,
        );
        await expect(
          controller.downloadFile(
            path,
            '',
            { user: { tenant_id: 'tenant', user_id: 'owner', role } },
            res,
          ),
        ).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(pipe).not.toHaveBeenCalled();
    },
  );

  it.each(['stale marks', 'open UFM'])(
    'denies a nominally archived copy after %s',
    async (change) => {
      const current = {
        ...source,
        has_open_ufm: change === 'open UFM',
        marks: source.marks.map((mark) => ({ ...mark, marks_obtained: 47 })),
      };
      const controller = new UploadsController(
        { isEnabled: () => false } as never,
        { query: queryFor(issued, current) } as never,
      );
      await expect(
        controller.downloadFile(
          path,
          '',
          { user: { tenant_id: 'tenant', user_id: 'owner', role: 'Student' } },
          res,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(pipe).not.toHaveBeenCalled();
    },
  );

  it('rejects an orphaned retry file whose immutable key differs from the issued URL', async () => {
    const orphan = path.replace('.pdf', `-${'a'.repeat(32)}.pdf`);
    const controller = new UploadsController(
      { isEnabled: () => false } as never,
      { query: queryFor() } as never,
    );
    await expect(
      controller.downloadFile(
        orphan,
        '',
        { user: { tenant_id: 'tenant', user_id: 'owner', role: 'Student' } },
        res,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pipe).not.toHaveBeenCalled();
  });

  it('streams a private S3 transcript URL through the configured bucket and protected checks', async () => {
    const getDownloadStream = jest.fn().mockResolvedValue({ pipe });
    const controller = new UploadsController(
      {
        isEnabled: () => true,
        getBucketName: () => 'synthetic-bucket',
        getDownloadStream,
      } as never,
      {
        query: queryFor({ ...issued, pdf_url: `s3://synthetic-bucket/${key}` }),
      } as never,
    );
    await controller.downloadFile(
      `s3://synthetic-bucket/${key}`,
      '',
      { user: { tenant_id: 'tenant', user_id: 'owner', role: 'Student' } },
      res,
    );
    expect(getDownloadStream).toHaveBeenCalledWith(key);
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
  });
});
