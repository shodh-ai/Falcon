import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { DataSource } from 'typeorm';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { OfficialTranscriptPdfService } from './official-transcript-pdf.service';

export type TranscriptActor = {
  userId: string;
  role?: string;
  ip?: string;
  sessionId?: string;
};

type TenantTranscript = {
  transcript_id: string;
  tenant_id: string;
  student_user_id: string;
  semester: number;
  status: string;
  student_name: string;
  enrollment_no: string | null;
  generated_at: Date | null;
  approved_at: Date | null;
  verification_code: string | null;
  pdf_url: string | null;
  requested_at: Date;
  archived_at: Date | null;
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
    tenantId = requireTenantId(typeof tenantId === 'string' ? tenantId : null);
    if (!isUUID(tenantId)) {
      throw new ForbiddenException('Invalid tenant context');
    }
    if (
      filters?.semester !== undefined &&
      (!Number.isInteger(filters.semester) || filters.semester < 1)
    ) {
      throw new BadRequestException('Valid semester is required');
    }
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
    return this.db.query<TenantTranscript[]>(
      `SELECT t.*, u.name AS student_name,
              COALESCE(sp.enrollment_no, sp.prn_number) AS enrollment_no
       FROM official_transcripts t
       JOIN users u ON u.user_id = t.student_user_id AND u.tenant_id = t.tenant_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id AND sp.tenant_id = t.tenant_id
       WHERE ${where}
         AND EXISTS (
           SELECT 1 FROM student_exam_reports r
           JOIN exam_result_sessions s ON s.session_id = r.session_id
             AND s.tenant_id = r.tenant_id AND s.course_id = r.course_id
             AND s.exam_type = r.exam_type
           JOIN academic_courses c ON c.course_id = r.course_id AND c.tenant_id = r.tenant_id
           WHERE r.tenant_id = t.tenant_id AND r.student_user_id = t.student_user_id
             AND s.semester = t.semester
             AND r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM student_exam_reports r
           JOIN exam_result_sessions s ON s.session_id = r.session_id
             AND s.tenant_id = r.tenant_id AND s.course_id = r.course_id
             AND s.exam_type = r.exam_type
           JOIN academic_courses c ON c.course_id = r.course_id AND c.tenant_id = r.tenant_id
           WHERE r.tenant_id = t.tenant_id AND r.student_user_id = t.student_user_id
             AND s.semester = t.semester AND r.result_status = 'WITHHELD'
             AND r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL
         )
       ORDER BY t.created_at DESC
       LIMIT 500`,
      params,
    );
  }

  async listForStudent(tenantId: string, studentUserId: string) {
    return this.db.query<
      Array<
        Pick<
          TenantTranscript,
          | 'transcript_id'
          | 'semester'
          | 'status'
          | 'verification_code'
          | 'pdf_url'
          | 'requested_at'
          | 'approved_at'
          | 'generated_at'
          | 'archived_at'
        >
      >
    >(
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
    tenantId = requireTenantId(tenantId);
    if (!Number.isInteger(semester) || semester < 1) {
      throw new BadRequestException('Valid semester is required');
    }
    const blocked = await this.db.query<Array<{ student_user_id: string }>>(
      `SELECT student_user_id FROM ufm_cases
       WHERE tenant_id = $1 AND status != 'CLOSED' AND marks_locked = true`,
      [tenantId],
    );
    const blockedSet = new Set(blocked.map((b) => b.student_user_id));

    const grads = await this.db.query<Array<{ user_id: string }>>(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN student_course_enrollments e ON e.student_user_id = u.user_id
         AND e.tenant_id = u.tenant_id
       WHERE e.tenant_id = $1 AND e.semester = $2
         AND EXISTS (
           SELECT 1 FROM student_exam_reports r
           JOIN exam_result_sessions s ON s.session_id = r.session_id
             AND s.tenant_id = r.tenant_id AND s.course_id = r.course_id
             AND s.exam_type = r.exam_type
           WHERE r.tenant_id = e.tenant_id AND r.student_user_id = e.student_user_id
             AND s.semester = e.semester
             AND r.declared_at IS NOT NULL AND s.declared_at IS NOT NULL
         )`,
      [tenantId, semester],
    );

    const created: string[] = [];
    for (const g of grads) {
      if (blockedSet.has(g.user_id)) continue;

      const existing = await this.db.query<Array<{ transcript_id: string }>>(
        `SELECT transcript_id FROM official_transcripts
         WHERE tenant_id = $1 AND student_user_id = $2 AND semester = $3
           AND status NOT IN ('ARCHIVED')`,
        [tenantId, g.user_id, semester],
      );
      if (existing[0]) continue;

      const rows = await this.db.query<Array<{ transcript_id: string }>>(
        `INSERT INTO official_transcripts (tenant_id, student_user_id, semester, status)
         VALUES ($1, $2, $3, $4)
         RETURNING transcript_id`,
        [tenantId, g.user_id, semester, autoApprove ? 'APPROVED' : 'REQUESTED'],
      );
      const transcriptId = rows[0].transcript_id;
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
    const rows = await this.db.query<Array<{ transcript_id: string }>>(
      `WITH updated AS (UPDATE official_transcripts
       SET status = 'APPROVED', approved_at = NOW(), approved_by_user_id = $3, updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2 AND status = 'REQUESTED'
       RETURNING *) SELECT * FROM updated`,
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
    const before = await this.db.query<Array<{ status: string }>>(
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

    const updated = await this.db.query<
      Array<{ student_user_id: string; semester: number }>
    >(
      `WITH updated AS (UPDATE official_transcripts
       SET status = 'GENERATED', verification_code = $3, pdf_url = $4,
           generated_at = NOW(), updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2
       RETURNING student_user_id, semester)
       SELECT student_user_id, semester FROM updated`,
      [transcriptId, tenantId, verificationCode, url],
    );
    if (!updated[0]) throw new NotFoundException('Transcript not found');

    await this.db.query(
      `UPDATE official_transcripts
       SET status = 'ARCHIVED', archived_at = NOW(), updated_at = NOW()
       WHERE transcript_id = $1 AND tenant_id = $2`,
      [transcriptId, tenantId],
    );

    const studentUserId = updated[0].student_user_id;
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
    const rows = await this.db.query<
      Array<
        Pick<
          TenantTranscript,
          | 'transcript_id'
          | 'semester'
          | 'status'
          | 'pdf_url'
          | 'generated_at'
          | 'student_name'
          | 'enrollment_no'
        > & { program_name: string | null }
      >
    >(
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
