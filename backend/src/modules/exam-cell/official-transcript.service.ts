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

export type TranscriptActor = {
  userId: string;
  role?: string;
  ip?: string;
  sessionId?: string;
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
    return this.db.query(
      `SELECT t.*, u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE ${where}
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params,
    );
  }

  async listForStudent(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT transcript_id, semester, status, verification_code, pdf_url,
              requested_at, approved_at, generated_at, archived_at
       FROM official_transcripts
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY semester DESC, created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  async requestForSemester(
    tenantId: string,
    semester: number,
    actor: TranscriptActor,
    autoApprove = true,
  ) {
    const blocked = await this.db.query(
      `SELECT student_user_id FROM ufm_cases
       WHERE tenant_id = $1 AND status != 'CLOSED' AND marks_locked = true`,
      [tenantId],
    );
    const blockedSet = new Set(
      blocked.map((b: { student_user_id: string }) => b.student_user_id),
    );

    const grads = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id
       WHERE e.tenant_id = $1 AND e.semester = $2`,
      [tenantId, semester],
    );

    const created: string[] = [];
    for (const g of grads as { user_id: string }[]) {
      if (blockedSet.has(g.user_id)) continue;

      const existing = await this.db.query(
        `SELECT transcript_id FROM official_transcripts
         WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
           AND status NOT IN ('ARCHIVED')`,
        [tenantId, g.user_id, semester],
      );
      if (existing[0]) continue;

      const rows = await this.db.query(
        `INSERT INTO official_transcripts (tenant_id, student_user_id, semester, status)
         VALUES ($1, $2, $3, $4)
         RETURNING transcript_id`,
        [tenantId, g.user_id, semester, autoApprove ? 'APPROVED' : 'REQUESTED'],
      );
      const transcriptId = rows[0].transcript_id as string;
      created.push(transcriptId);

      if (autoApprove) {
        await this.db.query(
          `UPDATE official_transcripts
           SET approved_at = NOW(), approved_by_user_id = $3, updated_at = NOW()
           WHERE transcript_id = $1 AND tenant_id = $2`,
          [transcriptId, tenantId, actor.userId],
        );
        await this.generatePdf(tenantId, transcriptId, actor);
      } else {
        await this.audit.log({
          tenantId,
          userId: actor.userId,
          role: actor.role,
          module: 'official_transcripts',
          action: 'TRANSCRIPT_REQUESTED',
          recordId: transcriptId,
          newValue: { semester, student_user_id: g.user_id },
          ip: actor.ip,
          sessionId: actor.sessionId,
        });
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
    const rows = await this.db.query(
      `UPDATE official_transcripts
       SET status = 'APPROVED', approved_at = NOW(), approved_by_user_id = $3, updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2 AND status = 'REQUESTED'
       RETURNING *`,
      [transcriptId, tenantId, actor.userId],
    );
    if (!rows[0]) {
      throw new BadRequestException('Transcript is not pending approval');
    }

    await this.audit.log({
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
    });

    return this.generatePdf(tenantId, transcriptId, actor);
  }

  async generatePdf(
    tenantId: string,
    transcriptId: string,
    actor: TranscriptActor,
  ) {
    const before = await this.db.query(
      `SELECT status FROM official_transcripts WHERE transcript_id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId],
    );
    if (!before[0]) throw new NotFoundException('Transcript not found');
    if (!['APPROVED', 'GENERATED'].includes(before[0].status)) {
      throw new BadRequestException(
        'Transcript must be approved before PDF generation',
      );
    }

    const { verificationCode, url } = await this.pdf.generate(
      tenantId,
      transcriptId,
    );

    const updated = await this.db.query(
      `UPDATE official_transcripts
       SET status = 'GENERATED', verification_code = $3, pdf_url = $4,
           generated_at = NOW(), updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2
       RETURNING student_user_id, semester`,
      [transcriptId, tenantId, verificationCode, url],
    );

    await this.db.query(
      `UPDATE official_transcripts
       SET status = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId],
    );

    const studentUserId = updated[0].student_user_id as string;
    this.notify.transcriptGenerated({
      tenantId,
      userId: studentUserId,
      semester: Number(updated[0].semester),
      verificationCode,
      actionLink: '/student/transcripts',
      title: 'Official Transcript Ready',
      message: `Your official transcript for semester ${updated[0].semester} is available for download.`,
    });

    await this.audit.log({
      tenantId,
      userId: actor.userId,
      role: actor.role,
      module: 'official_transcripts',
      action: 'TRANSCRIPT_GENERATED',
      recordId: transcriptId,
      oldValue: { status: before[0].status },
      newValue: {
        status: 'ARCHIVED',
        verification_code: verificationCode,
        pdf_url: url,
      },
      ip: actor.ip,
      sessionId: actor.sessionId,
    });

    return {
      transcript_id: transcriptId,
      verification_code: verificationCode,
      pdf_url: url,
      status: 'ARCHIVED',
    };
  }

  async verifyPublic(verificationCode: string) {
    const rows = await this.db.query(
      `SELECT t.transcript_id, t.semester, t.status, t.pdf_url, t.generated_at,
              u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no,
              COALESCE(sp.branch_name, sp.batch) AS program_name
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE t.verification_code = $1
         AND t.status IN ('GENERATED', 'ARCHIVED')`,
      [verificationCode.toUpperCase()],
    );
    if (!rows[0]) {
      throw new NotFoundException(
        'Transcript verification code not found or invalid',
      );
    }
    return {
      valid: true,
      student_name: rows[0].student_name,
      enrollment_no: rows[0].enrollment_no,
      program_name: rows[0].program_name,
      semester: rows[0].semester,
      generated_at: rows[0].generated_at,
      status: rows[0].status,
    };
  }
}
