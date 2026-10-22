import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';
import {
  assertIssuableTranscriptSource,
  isCurrentTranscript,
  lockTranscriptStudent,
  readTranscriptSource,
  TranscriptRevisionMetadata,
  transcriptRevisionHash,
} from './official-transcript-revisions';

export type TranscriptActor = {
  userId: string;
  role?: string;
  ip?: string;
  sessionId?: string;
};

type TranscriptRow = {
  transcript_id: string;
  tenant_id: string;
  student_user_id: string;
  semester: number;
  status: string;
  verification_code: string | null;
  pdf_url: string | null;
  student_name: string;
  enrollment_no: string | null;
  program_name: string | null;
  generated_at: Date | null;
  metadata: TranscriptRevisionMetadata;
  has_open_ufm?: boolean;
};

@Injectable()
export class OfficialTranscriptService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly pdf: OfficialTranscriptPdfService,
    private readonly audit: EnterpriseAuditService,
    private readonly notify: NotificationEmitterService,
  ) {}

  async listForTenant(
    tenantId: string,
    filters?: { status?: string; semester?: number },
  ) {
    const params: unknown[] = [tenantId];
    let where = 't.tenant_id = $1';
    if (filters?.status) {
      params.push(filters.status);
      where += ` AND t.status = $${params.length}`;
    }
    if (filters?.semester) {
      params.push(filters.semester);
      where += ` AND t.semester = $${params.length}`;
    }
    const rows = await this.db.query<TranscriptRow[]>(
      `SELECT t.*, u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
              EXISTS (SELECT 1 FROM ufm_cases f WHERE f.tenant_id = t.tenant_id AND f.student_user_id = t.student_user_id
                AND f.status <> 'CLOSED') AS has_open_ufm
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id AND u.tenant_id = t.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params,
    );
    return rows.map((row) => this.describeRevision(row));
  }

  async listForStudent(tenantId: string, studentUserId: string) {
    const rows = await this.db.query<TranscriptRow[]>(
      `SELECT transcript_id, semester, status, verification_code, pdf_url,
              requested_at, approved_at, generated_at, archived_at, metadata,
              EXISTS (SELECT 1 FROM ufm_cases f WHERE f.tenant_id = t.tenant_id AND f.student_user_id = t.student_user_id
                AND f.status <> 'CLOSED') AS has_open_ufm
       FROM official_transcripts t
       WHERE t.tenant_id = $1 AND t.student_user_id = $2
       ORDER BY semester DESC, created_at DESC`,
      [tenantId, studentUserId],
    );
    return rows.map((row) => this.describeRevision(row));
  }

  private describeRevision(row: TranscriptRow) {
    const issued = ['GENERATED', 'ARCHIVED'].includes(row.status);
    const active =
      issued &&
      !!row.metadata?.source_revision_hash &&
      !row.metadata.revoked_at &&
      !row.metadata.superseded_by_transcript_id &&
      !row.has_open_ufm;
    return {
      ...row,
      pdf_url: active ? row.pdf_url : null,
      verification_code: active ? row.verification_code : null,
      revision: row.metadata?.revision ?? 1,
      downloadable: active,
      needs_reissue: row.status === 'REVOKED' || (issued && !active),
      revocation_reason:
        row.metadata?.revocation_reason ??
        (issued && !row.metadata?.source_revision_hash
          ? 'Legacy copy requires verified reissue'
          : null),
    };
  }

  async requestForSemester(
    tenantId: string,
    semester: number,
    actor: TranscriptActor,
    autoApprove = true,
  ) {
    if (!Number.isInteger(semester) || semester < 1) {
      throw new BadRequestException('A valid semester is required');
    }
    const blocked = await this.db.query<{ student_user_id: string }[]>(
      `SELECT student_user_id FROM ufm_cases
       WHERE tenant_id = $1 AND status != 'CLOSED'`,
      [tenantId],
    );
    const blockedSet = new Set(
      blocked.map((b: { student_user_id: string }) => b.student_user_id),
    );

    const grads = await this.db.query<{ user_id: string }[]>(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       WHERE e.tenant_id = $1 AND u.tenant_id = e.tenant_id AND e.semester = $2
         AND EXISTS (SELECT 1 FROM academic_marks am
                     WHERE am.tenant_id = e.tenant_id
                       AND am.student_user_id = e.student_user_id
                       AND am.course_id = e.course_id AND am.status = 'PUBLISHED')`,
      [tenantId, semester],
    );

    const created: string[] = [];
    for (const g of grads) {
      if (blockedSet.has(g.user_id)) continue;

      const reservation = await this.db.transaction(async (tx) => {
        // Serialize creation even before a row exists. Archived documents are
        // issued documents, not permission to create another on every retry.
        await lockTranscriptStudent(tx, tenantId, g.user_id);
        const existing = await tx.query<
          { transcript_id: string; status: string }[]
        >(
          `SELECT transcript_id, status FROM official_transcripts
           WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
           ORDER BY created_at DESC, transcript_id DESC LIMIT 1`,
          [tenantId, g.user_id, semester],
        );
        if (existing[0]) return { ...existing[0], created: false };
        const rows = await tx.query<{ transcript_id: string }[]>(
          `INSERT INTO official_transcripts
           (tenant_id, student_user_id, semester, status, approved_at, approved_by_user_id)
           VALUES ($1, $2, $3, $4, CASE WHEN $5 THEN NOW() ELSE NULL END,
                   CASE WHEN $5 THEN $6::uuid ELSE NULL END)
           RETURNING transcript_id`,
          [
            tenantId,
            g.user_id,
            semester,
            autoApprove ? 'APPROVED' : 'REQUESTED',
            autoApprove,
            actor.userId,
          ],
        );
        const transcriptId = rows[0].transcript_id;
        await this.audit.log(
          {
            tenantId,
            userId: actor.userId,
            role: actor.role,
            module: 'official_transcripts',
            action: 'TRANSCRIPT_REQUESTED',
            recordId: transcriptId,
            newValue: { semester, student_user_id: g.user_id },
            ip: actor.ip,
            sessionId: actor.sessionId,
          },
          tx,
        );
        return {
          transcript_id: transcriptId,
          status: autoApprove ? 'APPROVED' : 'REQUESTED',
          created: true,
        };
      });
      if (reservation.created) created.push(reservation.transcript_id);
      if (autoApprove && reservation.status === 'APPROVED') {
        // A failed storage operation can be retried without issuing a duplicate.
        await this.generatePdf(tenantId, reservation.transcript_id, actor);
      }
    }

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'official_transcripts',
      action: 'TRANSCRIPT_BATCH_REQUESTED',
      newValue: { semester, count: created.length },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return { semester, requested: created.length, transcript_ids: created };
  }

  async approve(
    tenantId: string,
    transcriptId: string,
    actor: TranscriptActor,
  ) {
    await this.db.transaction(async (tx) => {
      const record = await this.lockRecord(tx, tenantId, transcriptId);
      // Approval/generation can be retried after a storage failure.
      if (['APPROVED', 'GENERATED', 'ARCHIVED'].includes(record.status)) return;
      if (record.status !== 'REQUESTED') {
        throw new BadRequestException('Transcript is not pending approval');
      }
      await tx.query(
        `UPDATE official_transcripts
         SET status = 'APPROVED', approved_at = NOW(), approved_by_user_id = $3, updated_at = NOW()
         WHERE transcript_id = $1 AND tenant_id = $2`,
        [transcriptId, tenantId, actor.userId],
      );
      await this.audit.log(
        {
          tenantId,
          userId: actor.userId,
          role: actor.role,
          module: 'official_transcripts',
          action: 'TRANSCRIPT_APPROVED',
          recordId: transcriptId,
          oldValue: { status: 'REQUESTED' },
          newValue: { status: 'APPROVED' },
          ip: actor.ip,
          sessionId: actor.sessionId,
        },
        tx,
      );
    });
    return this.generatePdf(tenantId, transcriptId, actor);
  }

  async generatePdf(
    tenantId: string,
    transcriptId: string,
    actor: TranscriptActor,
  ) {
    const result = await this.db.transaction(async (tx) => {
      const record = await this.lockRecord(tx, tenantId, transcriptId);
      if (
        ['ARCHIVED', 'GENERATED'].includes(record.status) &&
        record.pdf_url &&
        record.verification_code
      ) {
        if (!(await isCurrentTranscript(tx, record)))
          throw new BadRequestException(
            'This transcript revision is no longer valid. Request an authorized reissue.',
          );
        return {
          transcript_id: transcriptId,
          verification_code: record.verification_code,
          pdf_url: record.pdf_url,
          status: record.status,
          generated: false,
          student_user_id: record.student_user_id,
          semester: record.semester,
        };
      }
      if (!['APPROVED', 'GENERATED'].includes(record.status)) {
        throw new BadRequestException(
          'Transcript must be approved before PDF generation',
        );
      }
      const source = await readTranscriptSource(
        tx,
        tenantId,
        record.student_user_id,
        record.semester,
      );
      assertIssuableTranscriptSource(source);
      const sourceHash = transcriptRevisionHash(source);
      if (
        record.metadata?.source_revision_hash &&
        record.metadata.source_revision_hash !== sourceHash
      )
        throw new BadRequestException(
          'Published results changed. Request an authorized transcript reissue.',
        );
      const { verificationCode, url, pdfHash } = await this.pdf.generate(
        tenantId,
        transcriptId,
        tx,
        source,
      );
      await tx.query(
        `UPDATE official_transcripts
         SET status = 'ARCHIVED', verification_code = $3, pdf_url = $4,
             generated_at = NOW(), archived_at = NOW(), updated_at = NOW(),
             metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb
         WHERE transcript_id = $1 AND tenant_id = $2`,
        [
          transcriptId,
          tenantId,
          verificationCode,
          url,
          JSON.stringify({
            revision: record.metadata?.revision ?? 1,
            source_revision_hash: sourceHash,
            pdf_sha256: pdfHash,
          }),
        ],
      );
      await this.audit.log(
        {
          tenantId,
          userId: actor.userId,
          role: actor.role,
          module: 'official_transcripts',
          action: 'TRANSCRIPT_GENERATED',
          recordId: transcriptId,
          oldValue: { status: record.status },
          newValue: {
            status: 'ARCHIVED',
            verification_code: verificationCode,
            pdf_url: url,
          },
          ip: actor.ip,
          sessionId: actor.sessionId,
        },
        tx,
      );
      return {
        transcript_id: transcriptId,
        verification_code: verificationCode,
        pdf_url: url,
        status: 'ARCHIVED',
        generated: true,
        student_user_id: record.student_user_id,
        semester: record.semester,
      };
    });
    if (result.generated) {
      this.notify.transcriptGenerated({
        tenantId,
        userId: result.student_user_id,
        semester: Number(result.semester),
        verificationCode: result.verification_code,
        actionLink: '/student/transcripts',
        title: 'Official Transcript Ready',
        message: `Your official transcript for semester ${result.semester} is available for download.`,
      });
    }
    return {
      transcript_id: result.transcript_id,
      verification_code: result.verification_code,
      pdf_url: result.pdf_url,
      status: result.status,
    };
  }

  private async lockRecord(
    tx: Pick<DataSource, 'query'>,
    tenantId: string,
    transcriptId: string,
  ) {
    const owners = await tx.query<Array<{ student_user_id: string }>>(
      'SELECT student_user_id FROM official_transcripts WHERE transcript_id = $1 AND tenant_id = $2',
      [transcriptId, tenantId],
    );
    if (!owners[0]) throw new NotFoundException('Transcript not found');
    await lockTranscriptStudent(tx, tenantId, owners[0].student_user_id);
    const rows = await tx.query<TranscriptRow[]>(
      'SELECT status, transcript_id, tenant_id, student_user_id, semester, verification_code, pdf_url, metadata FROM official_transcripts WHERE transcript_id = $1 AND tenant_id = $2 FOR UPDATE',
      [transcriptId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Transcript not found');
    return rows[0];
  }

  /** New issuance retains the old row, code and PDF for private audit history. */
  async reissue(
    tenantId: string,
    transcriptId: string,
    actor: TranscriptActor,
    reason: string,
  ) {
    const explanation = String(reason ?? '').trim();
    if (!explanation || explanation.length > 500)
      throw new BadRequestException(
        'A reissue reason of 1–500 characters is required',
      );
    const reservation = await this.db.transaction(async (tx) => {
      const previous = await this.lockRecord(tx, tenantId, transcriptId);
      const source = await readTranscriptSource(
        tx,
        tenantId,
        previous.student_user_id,
        previous.semester,
      );
      assertIssuableTranscriptSource(source);
      const sourceHash = transcriptRevisionHash(source);
      const latest = await tx.query<TranscriptRow[]>(
        `SELECT * FROM official_transcripts WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
         ORDER BY created_at DESC, transcript_id DESC LIMIT 1 FOR UPDATE`,
        [tenantId, previous.student_user_id, previous.semester],
      );
      const current = latest[0];
      if (current && current.transcript_id !== transcriptId) {
        if (
          current.metadata?.source_revision_hash === sourceHash &&
          ['APPROVED', 'GENERATED', 'ARCHIVED'].includes(current.status) &&
          !current.metadata.revoked_at &&
          !current.metadata.superseded_by_transcript_id
        )
          return { transcript_id: current.transcript_id, created: false };
        throw new BadRequestException(
          'A newer transcript revision exists. Refresh and review that revision before reissuing.',
        );
      }
      if (
        previous.status === 'APPROVED' &&
        previous.metadata?.supersedes_transcript_id &&
        previous.metadata.source_revision_hash === sourceHash
      ) {
        return { transcript_id: transcriptId, created: false };
      }
      const revision = Number(previous.metadata?.revision ?? 1) + 1;
      const inserted = await tx.query<Array<{ transcript_id: string }>>(
        `INSERT INTO official_transcripts (tenant_id, student_user_id, semester, status, approved_at, approved_by_user_id, metadata)
         VALUES ($1, $2, $3, 'APPROVED', NOW(), $4, $5::jsonb) RETURNING transcript_id`,
        [
          tenantId,
          previous.student_user_id,
          previous.semester,
          actor.userId,
          JSON.stringify({
            revision,
            source_revision_hash: sourceHash,
            supersedes_transcript_id: transcriptId,
            reissue_reason: explanation,
          }),
        ],
      );
      const nextId = inserted[0].transcript_id;
      await tx.query(
        `UPDATE official_transcripts SET status = 'SUPERSEDED', metadata = COALESCE(metadata, '{}'::jsonb) ||
         jsonb_build_object('superseded_by_transcript_id', $3::text, 'revoked_at', COALESCE(metadata->>'revoked_at', NOW()::text),
           'revocation_reason', $4::text, 'revoked_by_user_id', $5::text), updated_at = NOW()
         WHERE tenant_id = $1 AND transcript_id = $2`,
        [tenantId, transcriptId, nextId, explanation, actor.userId],
      );
      await this.audit.log(
        {
          tenantId,
          ...actor,
          module: 'official_transcripts',
          action: 'TRANSCRIPT_REISSUED',
          recordId: nextId,
          oldValue: { transcript_id: transcriptId, status: previous.status },
          newValue: {
            revision,
            supersedes_transcript_id: transcriptId,
            reason: explanation,
          },
        },
        tx,
      );
      return { transcript_id: nextId, created: true };
    });
    const issued = await this.generatePdf(
      tenantId,
      reservation.transcript_id,
      actor,
    );
    return { ...issued, reissued: reservation.created };
  }

  async verifyPublic(verificationCode: string) {
    const normalizedCode = String(verificationCode ?? '')
      .trim()
      .toUpperCase();
    // Existing archived PDFs contain the original 16-character hexadecimal
    // code. Keep those issued verification links valid alongside new codes.
    if (!/^(?:[A-F0-9]{16}|[A-Z0-9]{32,128})$/.test(normalizedCode)) {
      throw new BadRequestException('Transcript verification code is invalid');
    }
    const rows = await this.db.query<TranscriptRow[]>(
      `SELECT t.transcript_id, t.tenant_id, t.student_user_id, t.semester, t.status, t.pdf_url, t.verification_code, t.metadata, t.generated_at,
              u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
              COALESCE(sp.branch_name, sp.batch) AS program_name
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id AND u.tenant_id = t.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE t.verification_code = $1
         AND t.status IN ('GENERATED', 'ARCHIVED')`,
      [normalizedCode],
    );
    if (rows.length !== 1 || !(await isCurrentTranscript(this.db, rows[0]))) {
      throw new NotFoundException(
        'Transcript verification code not found or invalid',
      );
    }
    return {
      valid: true,
      student_name: rows[0].student_name,
      enrollment_suffix: rows[0].enrollment_no?.slice(-4) ?? null,
      document_type: 'Official transcript',
      document_sha256: rows[0].metadata.pdf_sha256 ?? null,
      semester: rows[0].semester,
      revision: rows[0].metadata.revision ?? 1,
      generated_at: rows[0].generated_at,
      status: rows[0].status,
    };
  }
}
