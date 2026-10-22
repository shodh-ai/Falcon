import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OfficialTranscriptService } from './official-transcript.service';
import {
  invalidateOfficialTranscripts,
  isCurrentTranscript,
  readTranscriptMarks,
  TranscriptSource,
  transcriptRevisionHash,
} from './official-transcript-revisions';

const source: TranscriptSource = {
  tenant_id: 'tenant',
  student_user_id: 'student',
  semester: 8,
  student_name: 'Synthetic student',
  enrollment_no: 'SYNTH-1234',
  program_name: 'Synthetic programme',
  has_open_ufm: false,
  marks: [
    {
      course_id: 'course',
      course_code: 'SYNTH',
      course_name: 'Synthetic course',
      exam_type: 'END_TERM',
      marks_obtained: '47',
      max_marks: '50',
      grade: 'A+',
    },
  ],
};
const issued = {
  transcript_id: 'old',
  tenant_id: 'tenant',
  student_user_id: 'student',
  semester: 8,
  status: 'ARCHIVED',
  student_name: source.student_name,
  enrollment_no: source.enrollment_no,
  generated_at: '2026-10-21T10:00:00Z',
  pdf_url: '/uploads/tenant/old.pdf',
  verification_code: 'A'.repeat(64),
  metadata: {
    revision: 1,
    source_revision_hash: transcriptRevisionHash(source),
  },
};

function sourceQuery(current = source) {
  return jest.fn((sql: string) =>
    Promise.resolve(
      sql.includes('FROM users u LEFT JOIN student_profiles')
        ? [current]
        : sql.includes('FROM student_course_enrollments e')
          ? current.marks
          : [],
    ),
  );
}

describe('Official transcript revision validity', () => {
  it('binds verification to the actual published marks, grade, identity and selected retake', async () => {
    const query = sourceQuery();
    await expect(isCurrentTranscript({ query } as never, issued)).resolves.toBe(
      true,
    );
    for (const changed of [
      { ...source, student_name: 'Changed name' },
      { ...source, marks: [{ ...source.marks[0], marks_obtained: 48 }] },
      { ...source, marks: [{ ...source.marks[0], grade: 'B' }] },
      {
        ...source,
        marks: [
          { ...source.marks[0], selected_attempt_id: 'published-retake' },
        ],
      },
      { ...source, has_open_ufm: true },
      { ...source, marks: [] },
    ])
      await expect(
        isCurrentTranscript({ query: sourceQuery(changed) } as never, issued),
      ).resolves.toBe(false);
  });

  it.each(['REVOKED', 'SUPERSEDED', 'REQUESTED'])(
    'rejects %s revisions before reading student details',
    async (status) => {
      const query = jest.fn();
      await expect(
        isCurrentTranscript({ query } as never, { ...issued, status }),
      ).resolves.toBe(false);
      expect(query).not.toHaveBeenCalled();
    },
  );

  it('rejects legacy unbound PDFs and an explicitly superseded copy', async () => {
    const query = jest.fn();
    for (const metadata of [
      {},
      { ...issued.metadata, superseded_by_transcript_id: 'next' },
    ]) {
      await expect(
        isCurrentTranscript({ query } as never, { ...issued, metadata }),
      ).resolves.toBe(false);
    }
    expect(query).not.toHaveBeenCalled();
  });

  it('selects only published staff-selected retake results while preserving the original fallback', async () => {
    const query = jest.fn((sql: string, parameters: unknown[]) => {
      expect(sql).toContain('FROM student_course_enrollments');
      expect(parameters).toEqual(['tenant', 'student', 8]);
      return Promise.resolve(source.marks);
    });
    await readTranscriptMarks({ query } as never, 'tenant', 'student', 8);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('LEFT JOIN exam_backlog_current_results'),
      ['tenant', 'student', 8],
    );
    expect(query.mock.calls[0][0]).toContain(
      'br.selected_attempt_id IS NOT NULL THEN br.marks_obtained ELSE am.marks_obtained',
    );
    expect(query.mock.calls[0][0]).toContain("am.status = 'PUBLISHED'");
  });

  it('invalidates within the supplied transaction, preserves PDF/code and writes both audit records', async () => {
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT transcript_id, status')
          ? [{ transcript_id: 'old', status: 'ARCHIVED' }]
          : [],
      ),
    );
    await expect(
      invalidateOfficialTranscripts({ query } as never, {
        tenantId: 'tenant',
        studentUserId: 'student',
        semester: 8,
        actor: { userId: 'actor', role: 'ExamCell' },
        reason: 'Published revaluation changed results',
      }),
    ).resolves.toBe(1);
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('pg_advisory_xact_lock'),
      ['official-transcript:tenant:student'],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('($3::int IS NULL OR semester = $3)'),
      ['tenant', 'student', 8],
    );
    const update = query.mock.calls.find(([sql]) =>
      sql.startsWith('UPDATE official_transcripts'),
    )?.[0];
    expect(update).toContain("status = 'REVOKED'");
    expect(update).not.toMatch(/pdf_url\s*=|verification_code\s*=/);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO system_audit_logs'),
      expect.any(Array),
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO audit_log'),
      expect.any(Array),
    );
  });

  it('propagates an audit failure so the publishing transaction can roll back invalidation and marks', async () => {
    const query = jest.fn((sql: string) =>
      sql.includes('INSERT INTO system_audit_logs')
        ? Promise.reject(new Error('audit unavailable'))
        : Promise.resolve(
            sql.includes('SELECT transcript_id, status')
              ? [{ transcript_id: 'old', status: 'ARCHIVED' }]
              : [],
          ),
    );
    await expect(
      invalidateOfficialTranscripts({ query } as never, {
        tenantId: 'tenant',
        studentUserId: 'student',
        actor: { userId: 'actor' },
        reason: 'UFM',
      }),
    ).rejects.toThrow('audit unavailable');
  });

  it('public verification returns only the current revision and no PDF/full enrollment or internal IDs', async () => {
    const query = jest.fn((sql: string) =>
      sql.includes('FROM official_transcripts t')
        ? Promise.resolve([issued])
        : sourceQuery()(sql),
    );
    const service = new OfficialTranscriptService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const response = await service.verifyPublic(issued.verification_code);
    expect(response).toMatchObject({
      valid: true,
      semester: 8,
      revision: 1,
      enrollment_suffix: '1234',
    });
    expect(response).not.toHaveProperty('pdf_url');
    expect(response).not.toHaveProperty('student_user_id');
    expect(response).not.toHaveProperty('enrollment_no');
  });

  it('does not let ambiguous duplicate verification codes choose another tenant or document', async () => {
    const service = new OfficialTranscriptService(
      {
        query: jest
          .fn()
          .mockResolvedValue([issued, { ...issued, tenant_id: 'other' }]),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.verifyPublic(issued.verification_code),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('creates one immutable replacement and resumes that revision after a repeated request', async () => {
    const rows: Array<Record<string, unknown>> = [{ ...issued }];
    const query = jest.fn((sql: string, params: unknown[] = []) => {
      if (sql.startsWith('SELECT student_user_id'))
        return Promise.resolve([{ student_user_id: 'student' }]);
      if (sql.startsWith('SELECT status')) return Promise.resolve([rows[0]]);
      if (sql.includes('FROM users u LEFT JOIN student_profiles'))
        return Promise.resolve([source]);
      if (sql.includes('FROM student_course_enrollments e'))
        return Promise.resolve(source.marks);
      if (sql.startsWith('SELECT * FROM official_transcripts'))
        return Promise.resolve([rows.at(-1)]);
      if (sql.startsWith('INSERT INTO official_transcripts')) {
        rows.push({
          ...issued,
          transcript_id: 'new',
          status: 'APPROVED',
          metadata: JSON.parse(params[4] as string),
        });
        return Promise.resolve([{ transcript_id: 'new' }]);
      }
      if (sql.startsWith('UPDATE official_transcripts'))
        rows[0].status = 'SUPERSEDED';
      return Promise.resolve([]);
    });
    const tx = { query };
    const log = jest.fn();
    const service = new OfficialTranscriptService(
      {
        query,
        transaction: (run: (manager: typeof tx) => unknown) => run(tx),
      } as never,
      {} as never,
      { log } as never,
      {} as never,
    );
    const generate = jest.spyOn(service, 'generatePdf').mockResolvedValue({
      transcript_id: 'new',
      status: 'ARCHIVED',
      pdf_url: '/uploads/new.pdf',
      verification_code: 'B'.repeat(64),
    });
    const first = await service.reissue(
      'tenant',
      'old',
      { userId: 'actor' },
      'Published results changed',
    );
    const again = await service.reissue(
      'tenant',
      'old',
      { userId: 'actor' },
      'Retry after network interruption',
    );
    expect(first.reissued).toBe(true);
    expect(again.reissued).toBe(false);
    expect(rows).toHaveLength(2);
    expect(rows[0].pdf_url).toBe('/uploads/tenant/old.pdf');
    expect(rows[0].verification_code).toBe(issued.verification_code);
    expect(rows[1].metadata).toMatchObject({
      revision: 2,
      supersedes_transcript_id: 'old',
      source_revision_hash: transcriptRevisionHash(source),
    });
    expect(generate).toHaveBeenCalledTimes(2);
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'TRANSCRIPT_REISSUED' }),
      tx,
    );
  });

  it('requires a reason before database access and refuses a new revision under open UFM', async () => {
    const query = sourceQuery({ ...source, has_open_ufm: true });
    const service = new OfficialTranscriptService(
      { query } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.reissue('tenant', 'old', { userId: 'actor' }, ' '),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.reissue('tenant', 'old', { userId: 'actor' }, 'x'.repeat(501)),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    const blockedQuery = jest.fn((sql: string) =>
      sql.startsWith('SELECT student_user_id')
        ? Promise.resolve([{ student_user_id: 'student' }])
        : sql.startsWith('SELECT status')
          ? Promise.resolve([issued])
          : sourceQuery({ ...source, has_open_ufm: true })(sql),
    );
    const tx = { query: blockedQuery };
    const blocked = new OfficialTranscriptService(
      {
        transaction: (run: (manager: typeof tx) => unknown) => run(tx),
      } as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      blocked.reissue('tenant', 'old', { userId: 'actor' }, 'Changed results'),
    ).rejects.toThrow('open UFM');
    expect(
      blockedQuery.mock.calls.some(([sql]) => sql.startsWith('INSERT')),
    ).toBe(false);
  });
});
