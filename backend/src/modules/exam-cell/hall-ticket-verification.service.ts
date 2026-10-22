import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { ExamCellAuditService } from './exam-cell-audit.service';

type Database = Pick<EntityManager, 'query'>;
type TicketSnapshot = {
  student: Record<string, unknown>;
  schedules: Array<Record<string, unknown>>;
};
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Record verification, not a digital signature over PDF bytes. */
@Injectable()
export class HallTicketVerificationService {
  constructor(private readonly db: DataSource) {}

  private hash(snapshot: TicketSnapshot) {
    return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  }

  private async snapshot(
    db: Database,
    tenantId: string,
    studentId: string,
    ids: string[],
  ): Promise<TicketSnapshot> {
    const students = await db.query<Array<Record<string, unknown>>>(
      `SELECT u.user_id, u.name, u.official_email, sp.enrollment_number, sp.enrollment_no,
              sp.current_semester, sp.program_name, sp.section_code, sp.batch
       FROM users u JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'Student'
       JOIN student_profiles sp ON sp.user_id = u.user_id AND sp.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND u.user_id = $2 AND u.is_active = true
         AND NOT EXISTS (SELECT 1 FROM ufm_cases f WHERE f.tenant_id=u.tenant_id AND f.student_user_id=u.user_id AND f.status<>'CLOSED')
         AND NOT EXISTS (SELECT 1 FROM finance_fee_demands d WHERE d.tenant_id=u.tenant_id AND d.student_user_id=u.user_id
                         AND d.status NOT IN ('PAID','WAIVED') AND d.total_amount>COALESCE(d.paid_amount,0))
         AND NOT EXISTS (SELECT 1 FROM operations_hostel_fines f WHERE f.tenant_id=u.tenant_id AND f.student_user_id=u.user_id AND f.status='PENDING')`,
      [tenantId, studentId],
    );
    if (!students[0])
      throw new NotFoundException(
        'Hall ticket is invalid or no longer current',
      );
    const schedules = await db.query<Array<Record<string, unknown>>>(
      `SELECT es.exam_schedule_id, es.exam_date::text, es.start_time::text, es.end_time::text,
              es.exam_type, es.venue, es.batch_label, sub.subject_id,
              sub.subject_code, sub.subject_name, sub.semester,
              seat.room AS allocated_room, seat.seat_number,
              approval.approval_id, approval.stage AS approval_stage, approval.updated_at::text AS approval_updated_at,
              retake.attempt_id AS retake_attempt_id
       FROM exam_schedules es
       JOIN academic_subjects sub ON sub.subject_id = es.subject_id
       LEFT JOIN exam_seating_allocations seat ON seat.tenant_id = es.tenant_id
         AND seat.exam_schedule_id = es.exam_schedule_id AND seat.student_user_id = $2
       JOIN LATERAL (
         SELECT a.approval_id, a.stage, a.updated_at FROM hall_ticket_approvals a
         WHERE a.tenant_id = es.tenant_id AND a.student_user_id = $2 AND a.semester = sub.semester
           AND a.batch_label IS NOT DISTINCT FROM es.batch_label
         ORDER BY a.created_at DESC LIMIT 1
       ) approval ON approval.stage = 'APPROVED'
       LEFT JOIN LATERAL (
         SELECT attempt.attempt_id FROM exam_backlog_offerings offering
         JOIN exam_backlog_attempts attempt ON attempt.tenant_id=offering.tenant_id AND attempt.offering_id=offering.offering_id
         JOIN exam_applications application ON application.tenant_id=attempt.tenant_id AND application.exam_application_id=attempt.application_id
         LEFT JOIN finance_fee_demands demand ON demand.tenant_id=attempt.tenant_id AND demand.student_user_id=attempt.student_user_id
           AND demand.demand_id=application.finance_demand_id
         WHERE offering.tenant_id=es.tenant_id AND offering.exam_schedule_id=es.exam_schedule_id
           AND attempt.student_user_id=$2 AND attempt.status IN ('APPROVED','PUBLISHED')
           AND ((offering.fee_mode='NO_FEE' AND application.fee_status='WAIVED')
             OR (offering.fee_mode='REQUIRED' AND demand.fee_head='BACKLOG' AND demand.status='PAID'
               AND demand.total_amount=offering.fee_amount AND COALESCE(demand.paid_amount,0)>=demand.total_amount
               AND COALESCE((SELECT SUM(payment.amount) FROM finance_transactions payment
                 WHERE payment.demand_id=demand.demand_id AND payment.student_user_id=demand.student_user_id
                   AND (payment.tenant_id=demand.tenant_id OR payment.tenant_id IS NULL)
                   AND payment.status='SUCCESS' AND (payment.direction IS NULL OR payment.direction='IN')
                   AND COALESCE(payment.gateway_payload->>'mock','false')='false'),0)>=demand.total_amount))
         ORDER BY attempt.created_at DESC LIMIT 1
       ) retake ON true
       WHERE es.tenant_id = $1 AND es.exam_schedule_id = ANY($3::uuid[])
         AND es.deleted_at IS NULL AND es.status IN ('SCHEDULED','COMPLETED')
         AND (NOT EXISTS (SELECT 1 FROM exam_backlog_offerings offering WHERE offering.tenant_id=es.tenant_id AND offering.exam_schedule_id=es.exam_schedule_id)
              OR retake.attempt_id IS NOT NULL)
         AND EXISTS (SELECT 1 FROM student_course_enrollments e
                     JOIN academic_courses c ON c.course_id = e.course_id AND c.tenant_id = e.tenant_id
                     WHERE e.tenant_id = es.tenant_id AND e.student_user_id = $2
                       AND e.semester = sub.semester AND c.course_code = sub.subject_code)
       ORDER BY es.exam_schedule_id`,
      [tenantId, studentId, ids],
    );
    if (
      schedules.length !== ids.length ||
      new Set(schedules.map((s) => s.exam_schedule_id)).size !== ids.length
    ) {
      throw new BadRequestException(
        'Every hall-ticket examination must be current, enrolled and approved by the Examination Cell',
      );
    }
    if (
      !schedules.some(
        (schedule) =>
          Date.parse(
            `${String(schedule.exam_date)}T${String(schedule.end_time)}+05:30`,
          ) >= Date.now(),
      )
    ) {
      throw new BadRequestException('This hall ticket has expired');
    }
    return { student: students[0], schedules };
  }

  async issue(
    tenantId: string,
    studentId: string,
    scheduleIds: string[],
    transaction?: Database,
    actorUserId = studentId,
  ) {
    const ids = [...new Set(scheduleIds)].sort();
    if (
      !uuid.test(tenantId) ||
      !uuid.test(studentId) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => !uuid.test(id))
    ) {
      throw new BadRequestException(
        'Valid scheduled examinations are required for hall-ticket verification',
      );
    }
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const write = async (tx: Database) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `hall-ticket:${tenantId}:${studentId}`,
      ]);
      const snapshot = await this.snapshot(tx, tenantId, studentId, ids);
      const inserted = await tx.query<Array<{ issue_id: string }>>(
        `INSERT INTO exam_hall_ticket_issues (tenant_id, student_user_id, schedule_ids, token_hash, revision_hash, issued_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING issue_id`,
        [tenantId, studentId, ids, tokenHash, this.hash(snapshot), actorUserId],
      );
      await new ExamCellAuditService(this.db).log(
        tenantId,
        actorUserId,
        {
          action: 'HALL_TICKET_ISSUED',
          resource_type: 'hall_ticket_issue',
          resource_id: inserted[0].issue_id,
          new_value: { schedule_ids: ids },
        },
        tx,
      );
      return {
        issue_id: inserted[0].issue_id,
        payload: `FALCON-HALL-TICKET:${token}`,
      };
    };
    return transaction ? write(transaction) : this.db.transaction(write);
  }

  async check(
    tenantId: string,
    studentId: string,
    scheduleIds: string[],
    transaction?: Database,
  ) {
    return this.snapshot(
      transaction ?? this.db,
      tenantId,
      studentId,
      [...new Set(scheduleIds)].sort(),
    );
  }

  async verify(tenantId: string, payload: string) {
    const token = /^FALCON-HALL-TICKET:([A-Za-z0-9_-]{43})$/.exec(payload)?.[1];
    if (!token || !uuid.test(tenantId))
      throw new NotFoundException(
        'Hall ticket is invalid or no longer current',
      );
    const rows = await this.db.query<
      Array<{
        issue_id: string;
        student_user_id: string;
        schedule_ids: string[];
        revision_hash: string;
        revoked_at: Date | null;
      }>
    >(
      `SELECT issue_id, student_user_id, schedule_ids, revision_hash, revoked_at
       FROM exam_hall_ticket_issues WHERE tenant_id=$1 AND token_hash=$2`,
      [tenantId, createHash('sha256').update(token).digest('hex')],
    );
    const row = rows[0];
    if (!row || row.revoked_at || !/^[a-f0-9]{64}$/.test(row.revision_hash))
      throw new NotFoundException(
        'Hall ticket is invalid or no longer current',
      );
    let snapshot: TicketSnapshot;
    try {
      snapshot = await this.snapshot(
        this.db,
        tenantId,
        row.student_user_id,
        row.schedule_ids,
      );
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw new NotFoundException(
          'Hall ticket is invalid or no longer current',
        );
      throw error;
    }
    if (
      !timingSafeEqual(
        Buffer.from(row.revision_hash, 'hex'),
        Buffer.from(this.hash(snapshot), 'hex'),
      )
    ) {
      throw new NotFoundException(
        'Hall ticket is invalid or no longer current',
      );
    }
    return {
      verified: true,
      issue_id: row.issue_id,
      student_user_id: row.student_user_id,
      schedule_ids: row.schedule_ids,
    };
  }

  async revoke(
    tenantId: string,
    issueId: string,
    actorId: string,
    reason: string,
  ) {
    if (!reason?.trim() || reason.trim().length > 500)
      throw new BadRequestException(
        'A revocation reason of 1 to 500 characters is required',
      );
    return this.db.transaction(async (tx) => {
      const rows = await tx.query<Array<{ issue_id: string }>>(
        `WITH changed AS (UPDATE exam_hall_ticket_issues
         SET revoked_at=NOW(), revoked_by=$3, revocation_reason=$4
         WHERE tenant_id=$1 AND issue_id=$2 AND revoked_at IS NULL RETURNING issue_id)
         SELECT * FROM changed`,
        [tenantId, issueId, actorId, reason.trim()],
      );
      if (!rows[0])
        throw new NotFoundException('Current hall ticket not found');
      await new ExamCellAuditService(this.db).log(
        tenantId,
        actorId,
        {
          action: 'HALL_TICKET_REVOKED',
          resource_type: 'hall_ticket_issue',
          resource_id: issueId,
          new_value: { reason: reason.trim() },
        },
        tx,
      );
      return { issue_id: issueId, revoked: true };
    });
  }
}
