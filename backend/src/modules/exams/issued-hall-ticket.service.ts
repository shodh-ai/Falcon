import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { ExamCellAuditService } from '../exam-cell/exam-cell-audit.service';

type IssuedRow = {
  entry_id: string;
  tenant_id: string;
  student_user_id: string;
  session_id: string;
  session_name: string;
  registration_id: string;
  window_id: string;
  approval_id: string;
  semester: number;
  approved_at: string;
  reviewed_at: string;
  issued_at: string | Date;
  pdf_path: string;
  document_sha256: string;
  issuance_snapshot: unknown;
};

export function issuedHallTicketKey(row: {
  tenant_id: string;
  session_id: string;
  student_user_id: string;
  entry_id: string;
}): string {
  if (!Object.values(row).every((value) => isUUID(value)))
    throw new BadRequestException('Invalid hall-ticket document identity');
  return `${row.tenant_id}/exam-cell/issued-hall-tickets/${row.session_id}/${row.student_user_id}/${row.entry_id}.pdf`;
}

/** Retrieval only: no PDF generation and no authority to approve or issue. */
@Injectable()
export class IssuedHallTicketService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly storage: ObjectStorageService,
    private readonly audit: ExamCellAuditService,
  ) {}

  private scope(studentId: string, tenantId: string, entryId?: string) {
    if (!isUUID(tenantId) || !isUUID(studentId))
      throw new ForbiddenException(
        'Valid authenticated student and tenant required',
      );
    if (entryId !== undefined && !isUUID(entryId))
      throw new BadRequestException('A valid issued ticket ID is required');
  }

  private rows(
    manager: EntityManager,
    tenant: string,
    student: string,
    entry?: string,
  ) {
    return manager.query<IssuedRow[]>(
      `SELECT e.entry_id, e.tenant_id, e.student_user_id, e.session_id,
              s.session_name, a.registration_id, g.window_id, e.approval_id,
              g.semester,
              to_char(a.approved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS approved_at,
              to_char(g.reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS reviewed_at,
              e.issued_at,
              e.pdf_path, e.document_sha256, e.issuance_snapshot
       FROM exam_admit_card_entries e
       JOIN exam_admit_card_runs r ON r.run_id=e.run_id
         AND r.tenant_id=e.tenant_id AND r.session_id=e.session_id
       JOIN hall_ticket_approvals a ON a.approval_id=e.approval_id
         AND a.tenant_id=e.tenant_id AND a.student_user_id=e.student_user_id
         AND a.session_id=e.session_id
       JOIN exam_semester_registrations g ON g.registration_id=a.registration_id
         AND g.tenant_id=e.tenant_id AND g.student_user_id=e.student_user_id
         AND g.session_id=e.session_id AND g.semester=a.semester
       JOIN exam_form_windows w ON w.window_id=g.window_id
         AND w.tenant_id=g.tenant_id AND w.session_id=g.session_id AND w.semester=g.semester
       JOIN exam_sessions s ON s.session_id=e.session_id
         AND s.tenant_id=e.tenant_id AND s.semester=g.semester
       JOIN users u ON u.user_id=e.student_user_id AND u.tenant_id=e.tenant_id
       WHERE e.tenant_id=$1 AND e.student_user_id=$2
         AND ($3::uuid IS NULL OR e.entry_id=$3)
         AND r.semester=g.semester
         AND u.is_active=true AND u.deleted_at IS NULL
         AND e.issued_at IS NOT NULL AND e.eligible=true
         AND g.status='APPROVED' AND g.reviewed_at IS NOT NULL AND g.reviewed_by IS NOT NULL
         AND a.stage='APPROVED' AND a.approved_at IS NOT NULL AND a.approved_by IS NOT NULL
         AND a.eligibility_status='APPROVED' AND a.finance_status='APPROVED'
         AND a.exam_office_status='APPROVED' AND a.coe_status='APPROVED'
         AND a.block_reasons='[]'::jsonb
         AND NOT EXISTS (SELECT 1 FROM exam_admit_card_entries duplicate
           WHERE duplicate.tenant_id=e.tenant_id
             AND duplicate.student_user_id=e.student_user_id
             AND duplicate.session_id=e.session_id AND duplicate.issued_at IS NOT NULL
             AND duplicate.entry_id<>e.entry_id)
       ORDER BY e.issued_at DESC, e.entry_id`,
      [tenant, student, entry ?? null],
    );
  }

  private snapshot(row: IssuedRow): { document_bytes: number } {
    const value = row.issuance_snapshot;
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new NotFoundException('Verified issued ticket unavailable');
    const snapshot = value as Record<string, unknown>;
    const expected = {
      version: 1,
      tenant_id: row.tenant_id,
      student_user_id: row.student_user_id,
      session_id: row.session_id,
      registration_id: row.registration_id,
      window_id: row.window_id,
      approval_id: row.approval_id,
      semester: row.semester,
    };
    if (
      Object.entries(expected).some(([key, item]) => snapshot[key] !== item) ||
      typeof snapshot.approved_at !== 'string' ||
      snapshot.approved_at !== row.approved_at ||
      typeof snapshot.reviewed_at !== 'string' ||
      snapshot.reviewed_at !== row.reviewed_at ||
      typeof snapshot.document_bytes !== 'number' ||
      !Number.isSafeInteger(snapshot.document_bytes) ||
      snapshot.document_bytes < 1 ||
      snapshot.document_bytes > 25 * 1024 * 1024 ||
      !Array.isArray(snapshot.exams) ||
      snapshot.exams.length === 0 ||
      row.pdf_path !==
        issuedHallTicketKey({
          tenant_id: row.tenant_id,
          session_id: row.session_id,
          student_user_id: row.student_user_id,
          entry_id: row.entry_id,
        }) ||
      !/^[0-9a-f]{64}$/.test(row.document_sha256)
    )
      throw new NotFoundException('Verified issued ticket unavailable');
    const schedules = new Set<string>();
    for (const item of snapshot.exams as unknown[]) {
      if (!item || typeof item !== 'object')
        throw new NotFoundException('Verified issued ticket unavailable');
      const exam = item as Record<string, unknown>;
      if (
        typeof exam.exam_schedule_id !== 'string' ||
        !isUUID(exam.exam_schedule_id) ||
        typeof exam.course_id !== 'string' ||
        !isUUID(exam.course_id) ||
        !Number.isSafeInteger(exam.subject_id) ||
        Number(exam.subject_id) < 1 ||
        typeof exam.room !== 'string' ||
        !exam.room.trim() ||
        typeof exam.seat_number !== 'string' ||
        !exam.seat_number.trim() ||
        schedules.has(exam.exam_schedule_id)
      )
        throw new NotFoundException('Verified issued ticket unavailable');
      schedules.add(exam.exam_schedule_id);
    }
    return { document_bytes: snapshot.document_bytes };
  }

  async list(studentId: string, tenantId: string) {
    this.scope(studentId, tenantId);
    const rows = await this.rows(this.db.manager, tenantId, studentId);
    return rows.map((row) => {
      // A corrupt record is an error, never an apparently issued/empty success.
      this.snapshot(row);
      return {
        entry_id: row.entry_id,
        session_id: row.session_id,
        session_name: row.session_name,
        semester: row.semester,
        issued_at: row.issued_at,
        status: 'ISSUED' as const,
      };
    });
  }

  async download(
    studentId: string,
    tenantId: string,
    entryId: string | undefined,
    existingClearanceCheck: () => Promise<void>,
  ): Promise<Buffer> {
    this.scope(studentId, tenantId, entryId);
    const candidates = await this.rows(
      this.db.manager,
      tenantId,
      studentId,
      entryId,
    );
    if (!candidates.length)
      throw new NotFoundException('Officially issued hall ticket unavailable');
    if (candidates.length !== 1)
      throw new ConflictException(
        'Select a specific officially issued hall ticket',
      );
    const candidate = candidates[0];
    this.snapshot(candidate);
    // Upstream services own their connections. Do not hold a transaction
    // connection while waiting for another connection from the same pool.
    // This prerequisite never replaces the locked authorization recheck below.
    // It does not serialize future fee changes (a separate policy decision).
    await existingClearanceCheck();
    return this.db.transaction(async (manager) => {
      // Match registration review lock order; hold authorization through storage
      // retrieval and required audit. Re-read after any competing writer commits.
      for (const [sql, id] of [
        [
          'SELECT session_id FROM exam_sessions WHERE session_id=$1 AND tenant_id=$2 FOR SHARE',
          candidate.session_id,
        ],
        [
          'SELECT window_id FROM exam_form_windows WHERE window_id=$1 AND tenant_id=$2 FOR SHARE',
          candidate.window_id,
        ],
        [
          'SELECT registration_id FROM exam_semester_registrations WHERE registration_id=$1 AND tenant_id=$2 FOR SHARE',
          candidate.registration_id,
        ],
        [
          'SELECT approval_id FROM hall_ticket_approvals WHERE approval_id=$1 AND tenant_id=$2 FOR SHARE',
          candidate.approval_id,
        ],
        [
          'SELECT entry_id FROM exam_admit_card_entries WHERE entry_id=$1 AND tenant_id=$2 FOR SHARE',
          candidate.entry_id,
        ],
      ]) {
        const locked = await manager.query<unknown[]>(sql, [id, tenantId]);
        if (locked.length !== 1)
          throw new NotFoundException(
            'Officially issued hall ticket unavailable',
          );
      }
      const [row] = await this.rows(
        manager,
        tenantId,
        studentId,
        candidate.entry_id,
      );
      if (
        !row ||
        row.registration_id !== candidate.registration_id ||
        row.session_id !== candidate.session_id ||
        row.window_id !== candidate.window_id ||
        row.approval_id !== candidate.approval_id
      )
        throw new NotFoundException(
          'Officially issued hall ticket unavailable',
        );
      const snapshot = this.snapshot(row);
      let pdf: Buffer;
      try {
        const stream = await this.storage.getDownloadStream(row.pdf_path);
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of stream as AsyncIterable<Buffer>) {
          size += chunk.length;
          if (size > snapshot.document_bytes) {
            stream.destroy();
            throw new Error('Issued document size mismatch');
          }
          chunks.push(chunk);
        }
        pdf = Buffer.concat(chunks);
        if (
          pdf.length !== snapshot.document_bytes ||
          pdf.subarray(0, 5).toString() !== '%PDF-' ||
          createHash('sha256').update(pdf).digest('hex') !== row.document_sha256
        )
          throw new Error('Issued document integrity mismatch');
      } catch {
        throw new ServiceUnavailableException(
          'Issued hall-ticket file unavailable; contact the Exam Cell. No new PDF was generated.',
        );
      }
      await this.audit.log(
        tenantId,
        studentId,
        {
          action: 'HALL_TICKET_DOCUMENT_RETRIEVED',
          resource_type: 'exam_admit_card_entry',
          resource_id: row.entry_id,
          new_value: { session_id: row.session_id },
        },
        manager,
      );
      return pdf;
    });
  }
}
