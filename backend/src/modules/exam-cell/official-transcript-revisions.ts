import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';

export type TranscriptDatabase = Pick<DataSource, 'query'>;
export type TranscriptRevisionActor = {
  userId: string;
  role?: string;
  ip?: string;
  sessionId?: string;
};
export type TranscriptMark = {
  course_id: string;
  course_code: string;
  course_name: string;
  exam_type: string;
  marks_obtained: string | number;
  max_marks: string | number;
  grade: string;
  selected_attempt_id?: string | null;
};
export type TranscriptSource = {
  tenant_id: string;
  student_user_id: string;
  semester: number;
  student_name: string;
  enrollment_no: string | null;
  program_name: string | null;
  has_open_ufm: boolean;
  marks: TranscriptMark[];
};
export type TranscriptRevisionMetadata = {
  revision?: number;
  source_revision_hash?: string;
  pdf_sha256?: string;
  supersedes_transcript_id?: string;
  superseded_by_transcript_id?: string;
  revoked_at?: string;
  revocation_reason?: string;
  revoked_by_user_id?: string;
};

export function transcriptRevisionHash(source: TranscriptSource) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        tenant_id: source.tenant_id,
        student_user_id: source.student_user_id,
        semester: source.semester,
        student_name: source.student_name ?? '',
        enrollment_no: source.enrollment_no ?? null,
        program_name: source.program_name ?? null,
        marks: source.marks.map((mark) => ({
          course_id: mark.course_id,
          course_code: mark.course_code,
          course_name: mark.course_name,
          exam_type: mark.exam_type,
          marks_obtained: String(mark.marks_obtained),
          max_marks: String(mark.max_marks),
          grade: mark.grade,
          selected_attempt_id: mark.selected_attempt_id ?? null,
        })),
      }),
    )
    .digest('hex');
}

export async function lockTranscriptStudent(
  db: TranscriptDatabase,
  tenantId: string,
  studentId: string,
) {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `official-transcript:${tenantId}:${studentId}`,
  ]);
}

export async function readTranscriptMarks(
  db: TranscriptDatabase,
  tenantId: string,
  studentId: string,
  semester: number,
) {
  return db.query<TranscriptMark[]>(
    `SELECT c.course_id, c.course_code, c.course_name, am.exam_type,
            CASE WHEN br.selected_attempt_id IS NOT NULL THEN br.marks_obtained ELSE am.marks_obtained END AS marks_obtained,
            CASE WHEN br.selected_attempt_id IS NOT NULL THEN br.max_marks ELSE am.max_marks END AS max_marks,
            CASE WHEN br.selected_attempt_id IS NOT NULL THEN br.grade ELSE COALESCE(e.grade, '—') END AS grade,
            br.selected_attempt_id
     FROM student_course_enrollments e
     JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
     JOIN academic_marks am ON am.tenant_id = e.tenant_id AND am.student_user_id = e.student_user_id
       AND am.course_id = e.course_id AND am.status = 'PUBLISHED'
     LEFT JOIN exam_backlog_current_results br ON br.tenant_id = e.tenant_id AND br.student_user_id = e.student_user_id
       AND br.course_id = e.course_id AND br.semester = e.semester AND br.source_exam_type = am.exam_type
     WHERE e.tenant_id = $1 AND e.student_user_id = $2 AND e.semester = $3
     ORDER BY c.course_code, c.course_id, am.exam_type`,
    [tenantId, studentId, semester],
  );
}

export async function readTranscriptSource(
  db: TranscriptDatabase,
  tenantId: string,
  studentId: string,
  semester: number,
): Promise<TranscriptSource> {
  const rows = await db.query<
    Array<Omit<TranscriptSource, 'marks' | 'tenant_id' | 'semester'>>
  >(
    `SELECT u.user_id AS student_user_id, u.name AS student_name,
            COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
            COALESCE(sp.branch_name, sp.batch) AS program_name,
            EXISTS (SELECT 1 FROM ufm_cases f WHERE f.tenant_id = u.tenant_id
              AND f.student_user_id = u.user_id AND f.status <> 'CLOSED') AS has_open_ufm
     FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
     WHERE u.tenant_id = $1 AND u.user_id = $2`,
    [tenantId, studentId],
  );
  if (!rows[0]) throw new NotFoundException('Transcript student not found');
  return {
    ...rows[0],
    tenant_id: tenantId,
    semester,
    marks: await readTranscriptMarks(db, tenantId, studentId, semester),
  };
}

export function assertIssuableTranscriptSource(source: TranscriptSource) {
  if (source.has_open_ufm)
    throw new BadRequestException('Transcript is blocked by an open UFM case');
  if (!source.marks.length)
    throw new BadRequestException(
      'No published results are available for this transcript',
    );
}

/** Fail closed for revoked, superseded, legacy-unbound, UFM-blocked or stale copies. */
export async function isCurrentTranscript(
  db: TranscriptDatabase,
  record: {
    transcript_id: string;
    tenant_id: string;
    student_user_id: string;
    semester: number;
    status: string;
    metadata?: TranscriptRevisionMetadata | null;
    pdf_url?: string | null;
    verification_code?: string | null;
  },
) {
  if (
    !['GENERATED', 'ARCHIVED'].includes(record.status) ||
    !record.pdf_url ||
    !record.verification_code ||
    !record.metadata?.source_revision_hash ||
    record.metadata.revoked_at ||
    record.metadata.superseded_by_transcript_id
  )
    return false;
  const source = await readTranscriptSource(
    db,
    record.tenant_id,
    record.student_user_id,
    record.semester,
  );
  return (
    !source.has_open_ufm &&
    source.marks.length > 0 &&
    transcriptRevisionHash(source) === record.metadata.source_revision_hash
  );
}

/** Caller MUST use its marks/publication/UFM transaction so invalidation commits atomically. */
export async function invalidateOfficialTranscripts(
  db: TranscriptDatabase,
  input: {
    tenantId: string;
    studentUserId: string;
    semester?: number;
    actor: TranscriptRevisionActor;
    reason: string;
  },
) {
  await lockTranscriptStudent(db, input.tenantId, input.studentUserId);
  const rows = await db.query<Array<{ transcript_id: string; status: string }>>(
    `SELECT transcript_id, status FROM official_transcripts
     WHERE tenant_id = $1 AND student_user_id = $2 AND ($3::int IS NULL OR semester = $3)
       AND status NOT IN ('REVOKED', 'SUPERSEDED') ORDER BY transcript_id FOR UPDATE`,
    [input.tenantId, input.studentUserId, input.semester ?? null],
  );
  const audit = new EnterpriseAuditService(db as DataSource);
  for (const row of rows) {
    await db.query(
      `UPDATE official_transcripts SET status = 'REVOKED', metadata = COALESCE(metadata, '{}'::jsonb) ||
       jsonb_build_object('revoked_at', NOW(), 'revocation_reason', $3::text, 'revoked_by_user_id', $4::text), updated_at = NOW()
       WHERE tenant_id = $1 AND transcript_id = $2`,
      [input.tenantId, row.transcript_id, input.reason, input.actor.userId],
    );
    await audit.log(
      {
        tenantId: input.tenantId,
        ...input.actor,
        module: 'official_transcripts',
        action: 'TRANSCRIPT_REVOKED',
        recordId: row.transcript_id,
        oldValue: { status: row.status },
        newValue: { status: 'REVOKED', reason: input.reason },
      },
      db,
    );
  }
  return rows.length;
}
