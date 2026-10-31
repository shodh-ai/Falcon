import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { isUUID, validateSync } from 'class-validator';
import { DataSource, EntityManager } from 'typeorm';
import { requireTenantId } from '../../common/utils/require-tenant-id';
import { ExamCellAuditService } from './exam-cell-audit.service';
import {
  assertExamCellAction,
  type ExamCellAction,
} from './exam-cell-rbac.util';
import {
  ANSWER_SHEET_STATUSES,
  CreateAnswerSheetDto,
  CorrectScriptReceiptDto,
  ReportExamDayUfmDto,
  ReportMissingScriptDto,
  ResolveMissingScriptDto,
  ReviewExamDayUfmDto,
  UpdateAnswerSheetStatusDto,
} from './dto/exam-day.dto';

type Sheet = {
  sheet_id: string;
  sheet_number: string;
  exam_schedule_id: string | null;
  student_user_id: string | null;
  status: string;
  collected_at: string | Date | null;
  collected_by: string | null;
  evaluator_user_id: string | null;
};
type Discrepancy = {
  discrepancy_id: string;
  student_user_id: string;
  exam_schedule_id: string;
  status: 'MISSING' | 'RESOLVED';
  reason: string;
  resolution: string | null;
};
type Candidate = {
  student_user_id: string;
  student_name: string;
  enrollment_number: string | null;
  room: string;
  seat_number: string;
  attendance_status: string | null;
};
type Incident = {
  case_id: string;
  student_user_id: string;
  exam_id: string;
  status: string;
  marks_locked: boolean;
  penalty_applied: string | null;
  description: string;
  exam_day_reference: string | null;
};

/** Physical script custody only. Never derives receipt or a marks penalty from
 * attendance, evaluation marks, an identity lookup, or a legacy status label. */
@Injectable()
export class ExamDayScriptsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly audit: ExamCellAuditService,
  ) {}

  private scope(
    tenant: string,
    role: string | undefined,
    action: ExamCellAction,
  ) {
    tenant = requireTenantId(tenant);
    if (!isUUID(tenant))
      throw new ForbiddenException('Valid tenant context required');
    assertExamCellAction(role, action);
    return tenant;
  }

  private id(value: string) {
    if (!isUUID(value))
      throw new BadRequestException('A valid record ID is required');
  }

  private input<T extends object>(type: new () => T, value: T): T {
    const dto = plainToInstance(type, value);
    if (
      validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length
    )
      throw new BadRequestException('Invalid examination-day input');
    return dto;
  }

  private async actor(manager: EntityManager, tenant: string, actor: string) {
    this.id(actor);
    const rows = await manager.query<Array<{ user_id: string }>>(
      'SELECT user_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true AND deleted_at IS NULL FOR SHARE',
      [tenant, actor],
    );
    if (!rows.length)
      throw new ForbiddenException('Active authenticated officer required');
  }

  private async schedule(
    manager: EntityManager,
    tenant: string,
    id: string,
    lock = true,
  ) {
    this.id(id);
    const [row] = await manager.query<
      Array<{ exam_schedule_id: string; subject_id: number; status: string }>
    >(
      `SELECT exam_schedule_id, subject_id, status FROM exam_schedules
       WHERE tenant_id=$1 AND exam_schedule_id=$2 AND deleted_at IS NULL${lock ? ' FOR UPDATE' : ''}`,
      [tenant, id],
    );
    if (!row) throw new NotFoundException('Examination schedule not found');
    if (lock && row.status === 'CANCELLED')
      throw new ConflictException('The examination is cancelled');
    return row;
  }

  private async candidate(
    manager: EntityManager,
    tenant: string,
    schedule: string,
    student: string,
  ) {
    this.id(student);
    const rows = await manager.query<Array<{ student_user_id: string }>>(
      `SELECT a.student_user_id FROM exam_seating_allocations a
       JOIN users u ON u.user_id=a.student_user_id AND u.tenant_id=a.tenant_id
       WHERE a.tenant_id=$1 AND a.exam_schedule_id=$2 AND a.student_user_id=$3
       FOR SHARE OF a,u`,
      [tenant, schedule, student],
    );
    if (rows.length !== 1)
      throw new BadRequestException(
        'Student must have one verified seat on this examination roster',
      );
  }

  private async attending(
    manager: EntityManager,
    tenant: string,
    schedule: string,
    student: string,
  ) {
    const [row] = await manager.query<Array<{ status: string }>>(
      'SELECT status FROM exam_day_attendance WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 FOR SHARE',
      [tenant, schedule, student],
    );
    if (!row || !['PRESENT', 'LATE'].includes(row.status))
      throw new ConflictException(
        'Record PRESENT or LATE attendance before collecting or reporting a missing script',
      );
  }

  private async updated<T>(
    manager: EntityManager,
    sql: string,
    params: unknown[],
  ): Promise<T> {
    const result = await manager.query<T[] | [T[], number]>(sql, params);
    const rows = (Array.isArray(result[0]) ? result[0] : result) as T[];
    if (!rows[0])
      throw new ConflictException(
        'The examination record changed; reload before retrying',
      );
    return rows[0];
  }

  private async write<T>(callback: (manager: EntityManager) => Promise<T>) {
    try {
      return await this.db.transaction(callback);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23505'
      )
        throw new ConflictException(
          'This record already exists; reload the examination records',
        );
      throw error;
    }
  }

  async reconciliation(tenant: string, scheduleId: string, role?: string) {
    tenant = this.scope(tenant, role, 'view_dashboard');
    return this.db.transaction('REPEATABLE READ', async (manager) => {
      await this.schedule(manager, tenant, scheduleId, false);
      const roster = await manager.query<Candidate[]>(
        `SELECT a.student_user_id,u.name AS student_name,
                COALESCE(to_jsonb(sp)->>'enrollment_number',sp.enrollment_no,sp.prn_number) AS enrollment_number,
                a.room,a.seat_number,d.status AS attendance_status
         FROM exam_seating_allocations a
         JOIN users u ON u.user_id=a.student_user_id AND u.tenant_id=a.tenant_id
         LEFT JOIN student_profiles sp ON sp.user_id=u.user_id AND sp.tenant_id=a.tenant_id
         LEFT JOIN exam_day_attendance d ON d.tenant_id=a.tenant_id AND d.exam_schedule_id=a.exam_schedule_id AND d.student_user_id=a.student_user_id
         WHERE a.tenant_id=$1 AND a.exam_schedule_id=$2 ORDER BY a.room,a.seat_number,u.name`,
        [tenant, scheduleId],
      );
      if (new Set(roster.map((r) => r.student_user_id)).size !== roster.length)
        throw new ConflictException(
          'Duplicate seating allocations must be resolved before script reconciliation',
        );
      const sheets = await manager.query<Sheet[]>(
        `SELECT sheet_id,sheet_number,exam_schedule_id,student_user_id,status,collected_at,collected_by,evaluator_user_id
         FROM answer_sheet_tracking WHERE tenant_id=$1 AND exam_schedule_id=$2 ORDER BY sheet_number`,
        [tenant, scheduleId],
      );
      const discrepancies = await manager.query<Discrepancy[]>(
        'SELECT * FROM exam_script_discrepancies WHERE tenant_id=$1 AND exam_schedule_id=$2',
        [tenant, scheduleId],
      );
      const candidates = roster.map((row) => {
        const own = sheets.filter(
          (s) => s.student_user_id === row.student_user_id,
        );
        const receipts = own.filter((s) => s.collected_at && s.collected_by);
        const discrepancy =
          discrepancies.find(
            (d) => d.student_user_id === row.student_user_id,
          ) ?? null;
        const expected = ['PRESENT', 'LATE'].includes(
          row.attendance_status ?? '',
        );
        const collectionStatus = !row.attendance_status
          ? 'ATTENDANCE_PENDING'
          : !expected
            ? receipts.length
              ? 'CONFLICT'
              : 'NOT_EXPECTED'
            : discrepancy?.status === 'MISSING'
              ? 'MISSING'
              : receipts.length && receipts.length === own.length
                ? 'COLLECTED'
                : 'PENDING_COLLECTION';
        return {
          ...row,
          expected,
          collection_status: collectionStatus,
          sheets: own,
          discrepancy,
        };
      });
      const rosterIds = new Set(roster.map((r) => r.student_user_id));
      return {
        exam_schedule_id: scheduleId,
        summary: {
          roster: candidates.length,
          expected_candidates: candidates.filter((c) => c.expected).length,
          received_candidates: candidates.filter(
            (c) =>
              c.expected &&
              c.sheets.some((s) => s.collected_at && s.collected_by),
          ).length,
          received_booklets: sheets.filter(
            (s) => s.collected_at && s.collected_by,
          ).length,
          registered_booklets: sheets.length,
          outstanding_booklets: sheets.filter(
            (s) => !s.collected_at || !s.collected_by,
          ).length,
          absent: candidates.filter((c) => c.attendance_status === 'ABSENT')
            .length,
          attendance_pending: candidates.filter((c) => !c.attendance_status)
            .length,
          pending_collection: candidates.filter(
            (c) => c.collection_status === 'PENDING_COLLECTION',
          ).length,
          missing: candidates.filter((c) => c.discrepancy?.status === 'MISSING')
            .length,
          unlinked_booklets: sheets.filter(
            (s) => !s.student_user_id || !rosterIds.has(s.student_user_id),
          ).length,
          conflicts: candidates.filter(
            (c) => c.collection_status === 'CONFLICT',
          ).length,
        },
        candidates,
      };
    });
  }

  async list(
    tenant: string,
    status?: string,
    scheduleId?: string,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'view_dashboard');
    if (
      status &&
      !(ANSWER_SHEET_STATUSES as readonly string[]).includes(status)
    )
      throw new BadRequestException('Invalid answer-sheet status');
    if (scheduleId) this.id(scheduleId);
    return this.db.query<
      Array<
        Sheet & {
          student_name: string | null;
          subject_name: string | null;
          exam_date: string | null;
        }
      >
    >(
      `SELECT s.*,u.name AS student_name,sub.subject_name,es.exam_date
       FROM answer_sheet_tracking s
       LEFT JOIN users u ON u.user_id=s.student_user_id AND u.tenant_id=s.tenant_id
       LEFT JOIN exam_schedules es ON es.exam_schedule_id=s.exam_schedule_id AND es.tenant_id=s.tenant_id
       LEFT JOIN academic_subjects sub ON sub.subject_id=es.subject_id
       WHERE s.tenant_id=$1 AND ($2::text IS NULL OR s.status=$2)
         AND ($3::uuid IS NULL OR s.exam_schedule_id=$3)
         AND (s.student_user_id IS NULL OR u.user_id IS NOT NULL)
         AND (s.exam_schedule_id IS NULL OR es.exam_schedule_id IS NOT NULL)
       ORDER BY s.created_at DESC LIMIT 200`,
      [tenant, status ?? null, scheduleId ?? null],
    );
  }

  async create(
    tenant: string,
    actor: string,
    input: CreateAnswerSheetDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'manage_sessions');
    const dto = this.input(CreateAnswerSheetDto, input);
    return this.write(async (manager) => {
      await this.schedule(manager, tenant, dto.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        dto.exam_schedule_id,
        dto.student_user_id,
      );
      if (dto.collect)
        await this.attending(
          manager,
          tenant,
          dto.exam_schedule_id,
          dto.student_user_id,
        );
      let [sheet] = await manager.query<Sheet[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1 AND sheet_number=$2 FOR UPDATE',
        [tenant, dto.sheet_number],
      );
      if (
        sheet &&
        (sheet.exam_schedule_id !== dto.exam_schedule_id ||
          sheet.student_user_id !== dto.student_user_id)
      )
        throw new ConflictException(
          'Booklet number already belongs to another examination or student',
        );
      if (!sheet) {
        [sheet] = await manager.query<Sheet[]>(
          `INSERT INTO answer_sheet_tracking(tenant_id,sheet_number,exam_schedule_id,student_user_id,qr_payload,barcode_payload)
           VALUES($1,$2,$3,$4,$5,$2) RETURNING *`,
          [
            tenant,
            dto.sheet_number,
            dto.exam_schedule_id,
            dto.student_user_id,
            `AS|${dto.exam_schedule_id}|${dto.sheet_number}`,
          ],
        );
        await this.audit.log(
          tenant,
          actor,
          {
            action: 'ANSWER_SHEET_ISSUED',
            resource_type: 'answer_sheet',
            resource_id: sheet.sheet_id,
            new_value: {
              exam_schedule_id: dto.exam_schedule_id,
              student_user_id: dto.student_user_id,
              sheet_number: dto.sheet_number,
            },
          },
          manager,
        );
      }
      if (dto.collect && !sheet.collected_at)
        sheet = await this.collect(
          manager,
          tenant,
          actor,
          sheet,
          dto.resolution_reason,
        );
      return sheet;
    });
  }

  private async collect(
    manager: EntityManager,
    tenant: string,
    actor: string,
    sheet: Sheet,
    reason?: string,
  ) {
    if (sheet.status !== 'ISSUED')
      throw new ConflictException(
        'Legacy lifecycle status is not proof of physical receipt; review this booklet before collecting',
      );
    await this.attending(
      manager,
      tenant,
      sheet.exam_schedule_id!,
      sheet.student_user_id!,
    );
    const [missing] = await manager.query<Discrepancy[]>(
      "SELECT * FROM exam_script_discrepancies WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND status='MISSING' FOR UPDATE",
      [tenant, sheet.exam_schedule_id, sheet.student_user_id],
    );
    if (missing && (!reason || reason.trim().length < 3))
      throw new BadRequestException(
        'A resolution reason is required when the missing script is found',
      );
    const updated = await this.updated<Sheet>(
      manager,
      "UPDATE answer_sheet_tracking SET status='COLLECTED',collected_at=clock_timestamp(),collected_by=$3,status_changed_at=clock_timestamp() WHERE tenant_id=$1 AND sheet_id=$2 RETURNING *",
      [tenant, sheet.sheet_id, actor],
    );
    await this.audit.log(
      tenant,
      actor,
      {
        action: 'ANSWER_SHEET_COLLECTED',
        resource_type: 'answer_sheet',
        resource_id: sheet.sheet_id,
        old_value: { status: sheet.status },
        new_value: {
          status: 'COLLECTED',
          exam_schedule_id: sheet.exam_schedule_id,
          student_user_id: sheet.student_user_id,
          ...(reason ? { reason } : {}),
        },
      },
      manager,
    );
    if (missing) {
      const outstanding = await manager.query<Array<{ sheet_id: string }>>(
        'SELECT sheet_id FROM answer_sheet_tracking WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND collected_at IS NULL FOR SHARE',
        [tenant, sheet.exam_schedule_id, sheet.student_user_id],
      );
      if (!outstanding.length)
        await this.resolveRow(
          manager,
          tenant,
          actor,
          missing,
          'FOUND',
          reason!,
        );
    }
    return updated;
  }

  async transition(
    tenant: string,
    sheetId: string,
    actor: string,
    input: UpdateAnswerSheetStatusDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'manage_sessions');
    this.id(sheetId);
    const dto = this.input(UpdateAnswerSheetStatusDto, input);
    return this.write(async (manager) => {
      const [reference] = await manager.query<Sheet[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1 AND sheet_id=$2',
        [tenant, sheetId],
      );
      if (!reference) throw new NotFoundException('Answer sheet not found');
      if (!reference.exam_schedule_id || !reference.student_user_id)
        throw new ConflictException(
          'Legacy unlinked booklet requires manual record review',
        );
      await this.schedule(manager, tenant, reference.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        reference.exam_schedule_id,
        reference.student_user_id,
      );
      const [sheet] = await manager.query<Sheet[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1 AND sheet_id=$2 FOR UPDATE',
        [tenant, sheetId],
      );
      if (
        !sheet ||
        sheet.exam_schedule_id !== reference.exam_schedule_id ||
        sheet.student_user_id !== reference.student_user_id
      )
        throw new ConflictException('Booklet scope changed; reload the record');
      if (dto.status === sheet.status) {
        if (
          dto.evaluator_user_id &&
          dto.evaluator_user_id !== sheet.evaluator_user_id
        )
          throw new ConflictException(
            'A repeat request cannot reassign the evaluator',
          );
        return sheet;
      }
      if (
        ANSWER_SHEET_STATUSES[
          ANSWER_SHEET_STATUSES.indexOf(
            sheet.status as (typeof ANSWER_SHEET_STATUSES)[number],
          ) + 1
        ] !== dto.status
      )
        throw new ConflictException(
          'Answer sheets must follow the next legal custody stage',
        );
      if (dto.status === 'COLLECTED')
        return this.collect(manager, tenant, actor, sheet, dto.reason);
      if (!sheet.collected_at || !sheet.collected_by)
        throw new ConflictException(
          'Physical collection has not been verified',
        );
      const [missing] = await manager.query<Array<{ discrepancy_id: string }>>(
        "SELECT discrepancy_id FROM exam_script_discrepancies WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND status='MISSING' FOR SHARE",
        [tenant, sheet.exam_schedule_id, sheet.student_user_id],
      );
      if (missing)
        throw new ConflictException(
          'Resolve the missing-script discrepancy before advancing custody',
        );
      const outstanding = await manager.query<Array<{ sheet_id: string }>>(
        'SELECT sheet_id FROM answer_sheet_tracking WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 AND collected_at IS NULL FOR SHARE',
        [tenant, sheet.exam_schedule_id, sheet.student_user_id],
      );
      if (outstanding.length)
        throw new ConflictException(
          'Reconcile every issued booklet before advancing custody',
        );
      if (dto.evaluator_user_id && dto.status !== 'EVALUATOR_ASSIGNED')
        throw new BadRequestException(
          'An evaluator can only be set at the assignment stage',
        );
      if (dto.status === 'EVALUATOR_ASSIGNED') {
        if (!dto.evaluator_user_id)
          throw new BadRequestException('Select an authorized evaluator');
        const assignments = await manager.query<Array<{ course_id: string }>>(
          `SELECT DISTINCT a.course_id FROM academic_course_allocations a
           JOIN exam_schedules es ON es.subject_id=a.subject_id AND es.tenant_id=a.tenant_id
           JOIN users u ON u.user_id=a.faculty_user_id AND u.tenant_id=a.tenant_id
           WHERE a.tenant_id=$1 AND es.exam_schedule_id=$2 AND a.faculty_user_id=$3
             AND a.status='ACTIVE' AND u.is_active=true AND u.deleted_at IS NULL`,
          [tenant, sheet.exam_schedule_id, dto.evaluator_user_id],
        );
        if (assignments.length !== 1)
          throw new ForbiddenException(
            'Evaluator must have one active assignment for this examination subject',
          );
      }
      const updated = await this.updated<Sheet>(
        manager,
        'UPDATE answer_sheet_tracking SET status=$3,evaluator_user_id=COALESCE($4,evaluator_user_id),status_changed_at=clock_timestamp() WHERE tenant_id=$1 AND sheet_id=$2 RETURNING *',
        [tenant, sheetId, dto.status, dto.evaluator_user_id ?? null],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: `ANSWER_SHEET_${dto.status}`,
          resource_type: 'answer_sheet',
          resource_id: sheetId,
          old_value: { status: sheet.status },
          new_value: {
            status: dto.status,
            evaluator_user_id: updated.evaluator_user_id,
          },
        },
        manager,
      );
      return updated;
    });
  }

  async correctReceipt(
    tenant: string,
    sheetId: string,
    actor: string,
    input: CorrectScriptReceiptDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'manage_sessions');
    this.id(sheetId);
    const dto = this.input(CorrectScriptReceiptDto, input);
    return this.write(async (manager) => {
      const [reference] = await manager.query<Sheet[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1 AND sheet_id=$2',
        [tenant, sheetId],
      );
      if (!reference?.exam_schedule_id || !reference.student_user_id)
        throw new NotFoundException('Linked booklet not found');
      await this.schedule(manager, tenant, reference.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        reference.exam_schedule_id,
        reference.student_user_id,
      );
      const [sheet] = await manager.query<Sheet[]>(
        'SELECT * FROM answer_sheet_tracking WHERE tenant_id=$1 AND sheet_id=$2 FOR UPDATE',
        [tenant, sheetId],
      );
      if (
        !sheet ||
        sheet.exam_schedule_id !== reference.exam_schedule_id ||
        sheet.student_user_id !== reference.student_user_id
      )
        throw new ConflictException('Booklet scope changed; reload the record');
      if (sheet.status === 'ISSUED' && !sheet.collected_at) return sheet;
      if (
        sheet.status !== 'COLLECTED' ||
        !sheet.collected_at ||
        !sheet.collected_by
      )
        throw new ConflictException(
          'Only an unforwarded physical receipt can be corrected here; advanced custody requires review',
        );
      const updated = await this.updated<Sheet>(
        manager,
        "UPDATE answer_sheet_tracking SET status='ISSUED',collected_at=NULL,collected_by=NULL,status_changed_at=clock_timestamp() WHERE tenant_id=$1 AND sheet_id=$2 RETURNING *",
        [tenant, sheetId],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'ANSWER_SHEET_RECEIPT_CORRECTED',
          resource_type: 'answer_sheet',
          resource_id: sheetId,
          old_value: {
            status: sheet.status,
            collected_at: sheet.collected_at,
            collected_by: sheet.collected_by,
          },
          new_value: {
            status: 'ISSUED',
            reason: dto.reason,
            exam_schedule_id: sheet.exam_schedule_id,
            student_user_id: sheet.student_user_id,
          },
        },
        manager,
      );
      return updated;
    });
  }

  async reportMissing(
    tenant: string,
    actor: string,
    input: ReportMissingScriptDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'manage_sessions');
    const dto = this.input(ReportMissingScriptDto, input);
    return this.write(async (manager) => {
      await this.schedule(manager, tenant, dto.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        dto.exam_schedule_id,
        dto.student_user_id,
      );
      await this.attending(
        manager,
        tenant,
        dto.exam_schedule_id,
        dto.student_user_id,
      );
      const booklets = await manager.query<
        Array<{ sheet_id: string; collected_at: string | null }>
      >(
        'SELECT sheet_id,collected_at FROM answer_sheet_tracking WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 FOR SHARE',
        [tenant, dto.exam_schedule_id, dto.student_user_id],
      );
      if (booklets.length && booklets.every((s) => s.collected_at))
        throw new ConflictException(
          'A receipt already exists; investigate the booklet record rather than reporting the whole candidate script missing',
        );
      const [existing] = await manager.query<Discrepancy[]>(
        'SELECT * FROM exam_script_discrepancies WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 FOR UPDATE',
        [tenant, dto.exam_schedule_id, dto.student_user_id],
      );
      if (existing?.status === 'MISSING') return existing;
      const [row] = await manager.query<Discrepancy[]>(
        `INSERT INTO exam_script_discrepancies(tenant_id,exam_schedule_id,student_user_id,reason,reported_by)
         VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,exam_schedule_id,student_user_id)
         DO UPDATE SET status='MISSING',reason=EXCLUDED.reason,reported_by=EXCLUDED.reported_by,reported_at=clock_timestamp(),
           resolution=NULL,resolution_reason=NULL,resolved_by=NULL,resolved_at=NULL RETURNING *`,
        [tenant, dto.exam_schedule_id, dto.student_user_id, dto.reason, actor],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'EXAM_SCRIPT_MISSING',
          resource_type: 'exam_script_discrepancy',
          resource_id: row.discrepancy_id,
          old_value: existing,
          new_value: {
            exam_schedule_id: dto.exam_schedule_id,
            student_user_id: dto.student_user_id,
            reason: dto.reason,
          },
        },
        manager,
      );
      return row;
    });
  }

  private async resolveRow(
    manager: EntityManager,
    tenant: string,
    actor: string,
    row: Discrepancy,
    resolution: string,
    reason: string,
  ) {
    const updated = await this.updated<Discrepancy>(
      manager,
      "UPDATE exam_script_discrepancies SET status='RESOLVED',resolution=$3,resolution_reason=$4,resolved_by=$5,resolved_at=clock_timestamp() WHERE tenant_id=$1 AND discrepancy_id=$2 RETURNING *",
      [tenant, row.discrepancy_id, resolution, reason, actor],
    );
    await this.audit.log(
      tenant,
      actor,
      {
        action: 'EXAM_SCRIPT_RESOLVED',
        resource_type: 'exam_script_discrepancy',
        resource_id: row.discrepancy_id,
        old_value: { status: row.status, reason: row.reason },
        new_value: { resolution, reason },
      },
      manager,
    );
    return updated;
  }

  async resolveMissing(
    tenant: string,
    discrepancyId: string,
    actor: string,
    input: ResolveMissingScriptDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'manage_sessions');
    this.id(discrepancyId);
    const dto = this.input(ResolveMissingScriptDto, input);
    return this.write(async (manager) => {
      const [reference] = await manager.query<Discrepancy[]>(
        'SELECT * FROM exam_script_discrepancies WHERE tenant_id=$1 AND discrepancy_id=$2',
        [tenant, discrepancyId],
      );
      if (!reference)
        throw new NotFoundException('Missing-script report not found');
      await this.schedule(manager, tenant, reference.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        reference.exam_schedule_id,
        reference.student_user_id,
      );
      const [row] = await manager.query<Discrepancy[]>(
        'SELECT * FROM exam_script_discrepancies WHERE tenant_id=$1 AND discrepancy_id=$2 FOR UPDATE',
        [tenant, discrepancyId],
      );
      if (
        !row ||
        row.exam_schedule_id !== reference.exam_schedule_id ||
        row.student_user_id !== reference.student_user_id
      )
        throw new ConflictException(
          'Discrepancy scope changed; reload the record',
        );
      if (row.status === 'RESOLVED') return row;
      if (dto.resolution === 'FOUND') {
        const receipts = await manager.query<
          Array<{ sheet_id: string; collected_at: string | null }>
        >(
          'SELECT sheet_id,collected_at FROM answer_sheet_tracking WHERE tenant_id=$1 AND exam_schedule_id=$2 AND student_user_id=$3 FOR SHARE',
          [tenant, row.exam_schedule_id, row.student_user_id],
        );
        if (!receipts.length || receipts.some((s) => !s.collected_at))
          throw new ConflictException(
            'Record every actual booklet receipt before resolving the script as found',
          );
      }
      return this.resolveRow(
        manager,
        tenant,
        actor,
        row,
        dto.resolution,
        dto.reason,
      );
    });
  }

  async listIncidents(tenant: string, scheduleId: string, role?: string) {
    tenant = this.scope(tenant, role, 'view_dashboard');
    this.id(scheduleId);
    return this.db.query<
      Array<Incident & { student_name: string; review_reason: string | null }>
    >(
      `SELECT c.*,u.name AS student_name,
         (SELECT a.new_value->>'reason' FROM exam_audit_logs a WHERE a.tenant_id=c.tenant_id
          AND a.resource_id=c.case_id::text AND a.action IN ('EXAM_DAY_UFM_UNDER_REVIEW','EXAM_DAY_UFM_CLOSED') ORDER BY a.created_at DESC LIMIT 1) AS review_reason
       FROM ufm_cases c JOIN users u ON u.user_id=c.student_user_id AND u.tenant_id=c.tenant_id
       JOIN exam_schedules es ON es.exam_schedule_id=c.exam_id AND es.tenant_id=c.tenant_id
       WHERE c.tenant_id=$1 AND c.exam_id=$2 ORDER BY c.logged_at DESC`,
      [tenant, scheduleId],
    );
  }

  async reportIncident(
    tenant: string,
    actor: string,
    input: ReportExamDayUfmDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'approve_ufm');
    const dto = this.input(ReportExamDayUfmDto, input);
    return this.write(async (manager) => {
      await this.schedule(manager, tenant, dto.exam_schedule_id);
      await this.actor(manager, tenant, actor);
      await this.candidate(
        manager,
        tenant,
        dto.exam_schedule_id,
        dto.student_user_id,
      );
      const [existing] = await manager.query<Incident[]>(
        'SELECT * FROM ufm_cases WHERE tenant_id=$1 AND exam_day_reference=$2 FOR UPDATE',
        [tenant, dto.request_id],
      );
      if (existing) {
        if (
          existing.exam_id !== dto.exam_schedule_id ||
          existing.student_user_id !== dto.student_user_id ||
          existing.description !== dto.description
        )
          throw new ConflictException(
            'Incident retry reference belongs to a different report',
          );
        return existing;
      }
      const [row] = await manager.query<Incident[]>(
        `INSERT INTO ufm_cases(tenant_id,student_user_id,exam_id,description,reported_by,marks_locked,status,exam_day_reference)
         VALUES($1,$2,$3,$4,$5,false,'OPEN',$6) RETURNING *`,
        [
          tenant,
          dto.student_user_id,
          dto.exam_schedule_id,
          dto.description,
          actor,
          dto.request_id,
        ],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: 'EXAM_DAY_UFM_REPORTED',
          resource_type: 'ufm_case',
          resource_id: row.case_id,
          new_value: {
            exam_schedule_id: dto.exam_schedule_id,
            student_user_id: dto.student_user_id,
            status: 'OPEN',
            marks_changed: false,
          },
        },
        manager,
      );
      return row;
    });
  }

  async reviewIncident(
    tenant: string,
    caseId: string,
    actor: string,
    input: ReviewExamDayUfmDto,
    role?: string,
  ) {
    tenant = this.scope(tenant, role, 'approve_ufm');
    this.id(caseId);
    const dto = this.input(ReviewExamDayUfmDto, input);
    return this.write(async (manager) => {
      const [reference] = await manager.query<Incident[]>(
        'SELECT * FROM ufm_cases WHERE tenant_id=$1 AND case_id=$2',
        [tenant, caseId],
      );
      if (!reference?.exam_id)
        throw new NotFoundException('Examination incident not found');
      await this.schedule(manager, tenant, reference.exam_id);
      await this.actor(manager, tenant, actor);
      const [row] = await manager.query<Incident[]>(
        'SELECT * FROM ufm_cases WHERE tenant_id=$1 AND case_id=$2 FOR UPDATE',
        [tenant, caseId],
      );
      if (!row || row.exam_id !== reference.exam_id)
        throw new ConflictException(
          'Incident scope changed; reload the report',
        );
      if (!row.exam_day_reference || row.marks_locked || row.penalty_applied)
        throw new ConflictException(
          'This case has a sanction or legacy workflow; use its authorized UFM process',
        );
      if (row.status === dto.status) return row;
      if (
        (row.status === 'OPEN'
          ? 'UNDER_REVIEW'
          : row.status === 'UNDER_REVIEW'
            ? 'CLOSED'
            : null) !== dto.status
      )
        throw new ConflictException(
          'Review an open incident before closing it; closed reports cannot be silently reopened',
        );
      const updated = await this.updated<Incident>(
        manager,
        'UPDATE ufm_cases SET status=$3 WHERE tenant_id=$1 AND case_id=$2 RETURNING *',
        [tenant, caseId, dto.status],
      );
      await this.audit.log(
        tenant,
        actor,
        {
          action: `EXAM_DAY_UFM_${dto.status}`,
          resource_type: 'ufm_case',
          resource_id: caseId,
          old_value: { status: row.status },
          new_value: {
            status: dto.status,
            reason: dto.reason,
            marks_changed: false,
          },
        },
        manager,
      );
      return updated;
    });
  }
}
