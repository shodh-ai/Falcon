import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { AttendanceEligibilityService } from './attendance-eligibility.service';

const EXEMPTION_REASONS = ['MEDICAL', 'ACCIDENT', 'INTERNSHIP', 'BEREAVEMENT', 'OTHER'];

interface CreateExemptionDto {
  reason_category?: string;
  description?: string;
  supporting_doc_url?: string;
  semester?: number;
}

interface DecisionDto {
  decision?: 'APPROVE' | 'REJECT';
  remarks?: string;
}

interface CreateThresholdDto {
  dept_id?: number | null;
  requested_min_percent?: number;
  reason?: string;
}

@Injectable()
export class AttendancePolicyService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly eligibility: AttendanceEligibilityService,
  ) {}

  // ----------------------------------------------------------------------------
  // Student: individual exemption requests
  // ----------------------------------------------------------------------------

  async createExemption(tenantId: string, studentUserId: string, dto: CreateExemptionDto) {
    const category = (dto.reason_category ?? '').toUpperCase();
    if (!EXEMPTION_REASONS.includes(category)) {
      throw new BadRequestException(
        `reason_category must be one of: ${EXEMPTION_REASONS.join(', ')}`,
      );
    }
    if (!dto.description?.trim()) {
      throw new BadRequestException('A description of the reason is required.');
    }

    const open = await this.db.query(
      `SELECT 1 FROM student_attendance_exemptions
       WHERE tenant_id = $1 AND student_user_id = $2
         AND status IN ('PENDING_HOD', 'RECOMMENDED')
       LIMIT 1`,
      [tenantId, studentUserId],
    );
    if (open.length > 0) {
      throw new BadRequestException('You already have an exemption request under review.');
    }

    const attendance = await this.eligibility.computeAttendancePercent(studentUserId);

    const rows = await this.db.query(
      `INSERT INTO student_attendance_exemptions
         (tenant_id, student_user_id, reason_category, description, supporting_doc_url,
          attendance_percent_at_request, semester, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'PENDING_HOD')
       RETURNING *`,
      [
        tenantId,
        studentUserId,
        category,
        dto.description.trim(),
        dto.supporting_doc_url ?? null,
        attendance,
        dto.semester ?? null,
      ],
    );
    const exemption = rows[0];

    const [student] = await this.db.query(
      `SELECT name FROM users WHERE user_id = $1`,
      [studentUserId],
    );
    await this.notifyDeptHod(tenantId, studentUserId, {
      title: 'Attendance exemption request',
      message: `${student?.name ?? 'A student'} (attendance ${attendance}%) requested an attendance exemption (${category}).`,
      actionLink: '/hod/attendance-exemptions',
      requesterName: student?.name,
      requestType: 'ATTENDANCE_EXEMPTION',
    });

    return exemption;
  }

  listMyExemptions(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT * FROM student_attendance_exemptions
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  // ----------------------------------------------------------------------------
  // HOD: recommend / reject exemptions for own department
  // ----------------------------------------------------------------------------

  async listHodExemptions(tenantId: string, hodUserId: string) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    if (deptIds.length === 0) return [];
    return this.db.query(
      `SELECT e.*, u.name AS student_name, u.official_email AS student_email,
              d.dept_name
       FROM student_attendance_exemptions e
       JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE e.tenant_id = $1 AND u.dept_id = ANY($2::int[])
       ORDER BY (e.status = 'PENDING_HOD') DESC, e.created_at DESC`,
      [tenantId, deptIds],
    );
  }

  async hodDecideExemption(
    tenantId: string,
    hodUserId: string,
    exemptionId: string,
    dto: DecisionDto,
  ) {
    const exemption = await this.loadExemptionInHodScope(tenantId, hodUserId, exemptionId);
    if (exemption.status !== 'PENDING_HOD') {
      throw new BadRequestException('This request is no longer pending your review.');
    }

    if (dto.decision === 'REJECT') {
      await this.db.query(
        `UPDATE student_attendance_exemptions
         SET status = 'REJECTED', hod_user_id = $2, hod_remarks = $3,
             hod_decided_at = NOW(), updated_at = NOW()
         WHERE exemption_id = $1`,
        [exemptionId, hodUserId, dto.remarks ?? null],
      );
      this.notify.approvalRequired({
        tenantId,
        userId: exemption.student_user_id,
        title: 'Attendance exemption rejected',
        message: `Your attendance exemption request was rejected by the HOD.${dto.remarks ? ` Remarks: ${dto.remarks}` : ''}`,
        actionLink: '/student/exams',
        requestType: 'ATTENDANCE_EXEMPTION',
      });
      return { status: 'REJECTED' };
    }

    await this.db.query(
      `UPDATE student_attendance_exemptions
       SET status = 'RECOMMENDED', hod_user_id = $2, hod_remarks = $3,
           hod_decided_at = NOW(), updated_at = NOW()
       WHERE exemption_id = $1`,
      [exemptionId, hodUserId, dto.remarks ?? null],
    );

    const [student] = await this.db.query(`SELECT name FROM users WHERE user_id = $1`, [
      exemption.student_user_id,
    ]);
    await this.notifyRoles(tenantId, ['ExamCell'], {
      title: 'Attendance exemption for final approval',
      message: `${student?.name ?? 'A student'} (attendance ${Number(exemption.attendance_percent_at_request)}%) was recommended for an attendance exemption by the HOD.`,
      actionLink: '/exam-cell/attendance-exemptions',
      requesterName: student?.name,
      requestType: 'ATTENDANCE_EXEMPTION',
    });

    return { status: 'RECOMMENDED' };
  }

  // ----------------------------------------------------------------------------
  // Dean / Exam Cell: final decision on exemptions
  // ----------------------------------------------------------------------------

  listFinalExemptionQueue(tenantId: string) {
    return this.db.query(
      `SELECT e.*, u.name AS student_name, u.official_email AS student_email,
              d.dept_name, hod.name AS hod_name
       FROM student_attendance_exemptions e
       JOIN users u ON u.user_id = e.student_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN users hod ON hod.user_id = e.hod_user_id
       WHERE e.tenant_id = $1 AND e.status IN ('RECOMMENDED', 'APPROVED', 'REJECTED')
       ORDER BY (e.status = 'RECOMMENDED') DESC, e.created_at DESC`,
      [tenantId],
    );
  }

  async finalDecideExemption(
    tenantId: string,
    approverUserId: string,
    exemptionId: string,
    dto: DecisionDto,
  ) {
    const [exemption] = await this.db.query(
      `SELECT * FROM student_attendance_exemptions WHERE exemption_id = $1 AND tenant_id = $2`,
      [exemptionId, tenantId],
    );
    if (!exemption) throw new NotFoundException('Exemption request not found');
    if (exemption.status !== 'RECOMMENDED') {
      throw new BadRequestException('This request is not awaiting final approval.');
    }

    const newStatus = dto.decision === 'REJECT' ? 'REJECTED' : 'APPROVED';
    await this.db.query(
      `UPDATE student_attendance_exemptions
       SET status = $2, final_approver_id = $3, final_remarks = $4,
           final_decided_at = NOW(), updated_at = NOW()
       WHERE exemption_id = $1`,
      [exemptionId, newStatus, approverUserId, dto.remarks ?? null],
    );

    this.notify.approvalRequired({
      tenantId,
      userId: exemption.student_user_id,
      title: newStatus === 'APPROVED' ? 'Attendance exemption approved' : 'Attendance exemption rejected',
      message:
        newStatus === 'APPROVED'
          ? `Your attendance exemption was approved. You can now generate your admit card.${dto.remarks ? ` Remarks: ${dto.remarks}` : ''}`
          : `Your attendance exemption was rejected at final approval.${dto.remarks ? ` Remarks: ${dto.remarks}` : ''}`,
      actionLink: '/student/exams',
      requestType: 'ATTENDANCE_EXEMPTION',
    });

    return { status: newStatus };
  }

  // ----------------------------------------------------------------------------
  // HOD: department threshold relaxation (75 -> 70 / 65), Dean approves
  // ----------------------------------------------------------------------------

  async createThresholdRequest(tenantId: string, hodUserId: string, dto: CreateThresholdDto) {
    const pct = Number(dto.requested_min_percent);
    if (!Number.isFinite(pct) || pct < 1 || pct > 100) {
      throw new BadRequestException('requested_min_percent must be between 1 and 100.');
    }
    if (!dto.reason?.trim()) {
      throw new BadRequestException('A justification is required.');
    }

    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    let deptId = dto.dept_id ?? deptIds[0] ?? null;
    if (deptId != null && deptIds.length > 0 && !deptIds.includes(Number(deptId))) {
      throw new ForbiddenException('You can only request changes for your own department.');
    }

    const rows = await this.db.query(
      `INSERT INTO attendance_threshold_requests
         (tenant_id, dept_id, requested_min_percent, reason, requested_by, status)
       VALUES ($1,$2,$3,$4,$5,'PENDING_DEAN')
       RETURNING *`,
      [tenantId, deptId, pct, dto.reason.trim(), hodUserId],
    );

    const [hod] = await this.db.query(`SELECT name FROM users WHERE user_id = $1`, [hodUserId]);
    await this.notifyRoles(tenantId, ['Dean'], {
      title: 'Attendance policy change request',
      message: `${hod?.name ?? 'An HOD'} requested lowering the minimum attendance to ${pct}%.`,
      actionLink: '/dean/attendance-policy',
      requesterName: hod?.name,
      requestType: 'ATTENDANCE_POLICY',
    });

    return rows[0];
  }

  listMyThresholdRequests(tenantId: string, hodUserId: string) {
    return this.db.query(
      `SELECT r.*, d.dept_name
       FROM attendance_threshold_requests r
       LEFT JOIN departments d ON d.dept_id = r.dept_id
       WHERE r.tenant_id = $1 AND r.requested_by = $2
       ORDER BY r.created_at DESC`,
      [tenantId, hodUserId],
    );
  }

  listPendingThresholdRequests(tenantId: string) {
    return this.db.query(
      `SELECT r.*, d.dept_name, u.name AS requested_by_name
       FROM attendance_threshold_requests r
       LEFT JOIN departments d ON d.dept_id = r.dept_id
       LEFT JOIN users u ON u.user_id = r.requested_by
       WHERE r.tenant_id = $1
       ORDER BY (r.status = 'PENDING_DEAN') DESC, r.created_at DESC`,
      [tenantId],
    );
  }

  async decideThresholdRequest(
    tenantId: string,
    deanUserId: string,
    requestId: string,
    dto: DecisionDto,
  ) {
    const [request] = await this.db.query(
      `SELECT * FROM attendance_threshold_requests WHERE request_id = $1 AND tenant_id = $2`,
      [requestId, tenantId],
    );
    if (!request) throw new NotFoundException('Threshold request not found');
    if (request.status !== 'PENDING_DEAN') {
      throw new BadRequestException('This request has already been decided.');
    }

    const newStatus = dto.decision === 'REJECT' ? 'REJECTED' : 'APPROVED';
    await this.db.query(
      `UPDATE attendance_threshold_requests
       SET status = $2, decided_by = $3, decision_remarks = $4, decided_at = NOW(), updated_at = NOW()
       WHERE request_id = $1`,
      [requestId, newStatus, deanUserId, dto.remarks ?? null],
    );

    this.notify.approvalRequired({
      tenantId,
      userId: request.requested_by,
      title: newStatus === 'APPROVED' ? 'Attendance policy approved' : 'Attendance policy rejected',
      message:
        newStatus === 'APPROVED'
          ? `Your request to set minimum attendance to ${request.requested_min_percent}% was approved.`
          : `Your attendance policy change was rejected.${dto.remarks ? ` Remarks: ${dto.remarks}` : ''}`,
      actionLink: '/hod/attendance-policy',
      requestType: 'ATTENDANCE_POLICY',
    });

    return { status: newStatus };
  }

  // ----------------------------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------------------------

  private async loadExemptionInHodScope(
    tenantId: string,
    hodUserId: string,
    exemptionId: string,
  ) {
    const deptIds = await this.resolveHodDepartmentIds(hodUserId);
    const [exemption] = await this.db.query(
      `SELECT e.*, u.dept_id
       FROM student_attendance_exemptions e
       JOIN users u ON u.user_id = e.student_user_id
       WHERE e.exemption_id = $1 AND e.tenant_id = $2`,
      [exemptionId, tenantId],
    );
    if (!exemption) throw new NotFoundException('Exemption request not found');
    if (deptIds.length && !deptIds.includes(Number(exemption.dept_id))) {
      throw new ForbiddenException('This student is not in your department scope.');
    }
    return exemption;
  }

  private async resolveHodDepartmentIds(hodUserId: string): Promise<number[]> {
    const direct = await this.db.query(
      `SELECT dept_id FROM departments WHERE hod_user_id = $1`,
      [hodUserId],
    );
    const [hod] = await this.db.query(`SELECT dept_id FROM users WHERE user_id = $1`, [hodUserId]);
    return Array.from(
      new Set<number>([
        ...direct.map((row: { dept_id: number }) => Number(row.dept_id)),
        ...(hod?.dept_id ? [Number(hod.dept_id)] : []),
      ]),
    );
  }

  private async notifyDeptHod(
    tenantId: string,
    studentUserId: string,
    payload: {
      title: string;
      message: string;
      actionLink: string;
      requesterName?: string;
      requestType?: string;
    },
  ) {
    const rows = await this.db.query(
      `SELECT d.hod_user_id
       FROM users u JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.user_id = $1 AND d.hod_user_id IS NOT NULL`,
      [studentUserId],
    );
    const hodId = rows[0]?.hod_user_id;
    if (hodId) {
      this.notify.approvalRequired({ tenantId, userId: hodId, ...payload });
    } else {
      await this.notifyRoles(tenantId, ['HOD'], payload);
    }
  }

  private async notifyRoles(
    tenantId: string,
    roleNames: string[],
    payload: {
      title: string;
      message: string;
      actionLink: string;
      requesterName?: string;
      requestType?: string;
    },
  ) {
    const recipients = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true AND r.role_name = ANY($2::text[])`,
      [tenantId, roleNames],
    );
    for (const row of recipients as Array<{ user_id: string }>) {
      this.notify.approvalRequired({ tenantId, userId: row.user_id, ...payload });
    }
  }
}
