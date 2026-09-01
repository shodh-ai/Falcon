import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { DataSource } from 'typeorm';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { FalconNotificationsService } from '../../core/notifications/falcon-notifications.service';
import { AdmissionsService } from '../admissions/admissions.service';
import { MasterDataService } from '../master-data/master-data.service';
import type { Lead } from '../../entities/lead.entity';

const LIFECYCLE = [
  'APPLICANT',
  'ADMITTED',
  'ENROLLED',
  'ACTIVE',
  'ON_LEAVE',
  'SUSPENDED',
  'WITHDRAWN',
  'GRADUATED',
  'ALUMNI',
] as const;

export type LifecycleStatus = (typeof LIFECYCLE)[number];

@Injectable()
export class RegistrarService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly masterData: MasterDataService,
    private readonly admissions: AdmissionsService,
    private readonly enterpriseAudit: EnterpriseAuditService,
    @Optional() private readonly falconNotify?: FalconNotificationsService,
  ) {}

  private async audit(
    tenantId: string,
    userId: string,
    action: string,
    recordId?: string,
    newValue?: Record<string, unknown>,
    oldValue?: Record<string, unknown>,
  ) {
    try {
      await this.enterpriseAudit.log({
        tenantId,
        userId,
        module: 'registrar_desk',
        action,
        recordId,
        oldValue,
        newValue,
      });
    } catch {
      /* non-blocking */
    }
  }

  private async notifyRegistrars(
    tenantId: string,
    input: {
      title: string;
      message: string;
      actionLink?: string;
      severity?: 'info' | 'success' | 'warning' | 'critical';
      intent?: 'info' | 'action_required' | 'status_update' | 'alert';
    },
  ) {
    if (!this.falconNotify) return;
    try {
      const users = await this.db.query(
        `SELECT DISTINCT u.user_id
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND lower(r.role_name) IN ('registrar', 'campusadmin', 'superadmin')`,
        [tenantId],
      );
      await Promise.all(
        (users as Array<{ user_id: string }>).map((u) =>
          this.falconNotify!
            .create({
              tenantId,
              userId: u.user_id,
              category: 'OPERATIONS',
              title: input.title,
              message: input.message,
              actionLink: input.actionLink,
              severity: input.severity ?? 'info',
              intent: input.intent ?? 'status_update',
              actionLabel: 'Open',
            })
            .catch(() => null),
        ),
      );
    } catch {
      /* non-blocking */
    }
  }

  // ── Placement ────────────────────────────────────────────────────────────

  async listPlacementStudents(
    tenantId: string,
    filters: {
      q?: string;
      department?: string;
      program?: string;
      semester?: string;
      section?: string;
      status?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const params: unknown[] = [tenantId];
    let where = `WHERE u.tenant_id = $1 AND EXISTS (
      SELECT 1 FROM user_roles ur JOIN roles r ON r.role_id = ur.role_id
      WHERE ur.user_id = u.user_id AND lower(r.role_name) = 'student'
    )`;
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      where += ` AND (lower(u.name) LIKE $${params.length} OR lower(u.official_email) LIKE $${params.length}
        OR lower(COALESCE(sp.enrollment_no, sp.prn_number, '')) LIKE $${params.length})`;
    }
    if (filters.department?.trim()) {
      params.push(filters.department.trim());
      where += ` AND (d.dept_name = $${params.length} OR sp.school_name = $${params.length})`;
    }
    if (filters.program?.trim()) {
      params.push(filters.program.trim());
      where += ` AND sp.program_name = $${params.length}`;
    }
    if (filters.semester) {
      params.push(Number(filters.semester));
      where += ` AND sp.current_semester = $${params.length}`;
    }
    if (filters.section?.trim()) {
      params.push(filters.section.trim());
      where += ` AND sp.section_code = $${params.length}`;
    }
    if (filters.status?.trim()) {
      params.push(filters.status.trim().toUpperCase());
      where += ` AND upper(COALESCE(sp.lifecycle_status, sp.status, 'ACTIVE')) = $${params.length}`;
    }

    const limit = Math.min(Math.max(filters.limit ?? 25, 1), 200);
    const offset = Math.max(filters.offset ?? 0, 0);
    params.push(limit, offset);

    const rows = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email, u.phone, u.dept_id,
              d.dept_name AS department_name,
              sp.enrollment_no, sp.prn_number, sp.batch, sp.current_semester,
              sp.section_code, sp.school_name, sp.program_name, sp.degree_name,
              sp.advisor_name, sp.advisor_user_id,
              COALESCE(sp.lifecycle_status, sp.status, 'ACTIVE') AS lifecycle_status,
              sp.status AS profile_status
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       ${where}
       ORDER BY u.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const [{ count }] = await this.db.query(
      `SELECT COUNT(*)::int AS count
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       ${where}`,
      params.slice(0, params.length - 2),
    );

    return { rows, total: count ?? 0, limit, offset };
  }

  async assignPlacement(
    tenantId: string,
    actorUserId: string,
    dto: {
      student_user_id: string;
      school_name?: string;
      department_name?: string;
      program_name?: string;
      degree_name?: string;
      batch?: string;
      semester?: number;
      section_code?: string;
      advisor_user_id?: string;
      advisor_name?: string;
      remarks?: string;
      source?: string;
    },
  ) {
    const studentId = dto.student_user_id;
    const userRows = await this.db.query(
      `SELECT user_id, dept_id FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, studentId],
    );
    if (!userRows[0]) throw new NotFoundException('Student not found');

    if (dto.department_name?.trim()) {
      const depts = await this.db.query(
        `SELECT dept_id FROM departments
         WHERE deleted_at IS NULL AND lower(dept_name) = lower($1)
         LIMIT 1`,
        [dto.department_name.trim()],
      );
      if (depts[0]?.dept_id) {
        await this.db.query(`UPDATE users SET dept_id = $2 WHERE user_id = $1`, [
          studentId,
          depts[0].dept_id,
        ]);
      }
    }

    await this.db.query(
      `INSERT INTO student_profiles (tenant_id, user_id, batch, current_semester, section_code, school_name, program_name, degree_name, advisor_user_id, advisor_name, status, lifecycle_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'ACTIVE', 'ENROLLED')
       ON CONFLICT (user_id) DO UPDATE SET
         tenant_id = COALESCE(student_profiles.tenant_id, EXCLUDED.tenant_id),
         batch = COALESCE(EXCLUDED.batch, student_profiles.batch),
         current_semester = COALESCE(EXCLUDED.current_semester, student_profiles.current_semester),
         section_code = COALESCE(EXCLUDED.section_code, student_profiles.section_code),
         school_name = COALESCE(EXCLUDED.school_name, student_profiles.school_name),
         program_name = COALESCE(EXCLUDED.program_name, student_profiles.program_name),
         degree_name = COALESCE(EXCLUDED.degree_name, student_profiles.degree_name),
         advisor_user_id = COALESCE(EXCLUDED.advisor_user_id, student_profiles.advisor_user_id),
         advisor_name = COALESCE(EXCLUDED.advisor_name, student_profiles.advisor_name),
         updated_at = NOW()`,
      [
        tenantId,
        studentId,
        dto.batch ?? null,
        dto.semester ?? null,
        dto.section_code ?? null,
        dto.school_name ?? null,
        dto.program_name ?? null,
        dto.degree_name ?? null,
        dto.advisor_user_id ?? null,
        dto.advisor_name ?? null,
      ],
    );

    const [history] = await this.db.query(
      `INSERT INTO registrar_placement_history
        (tenant_id, student_user_id, school_name, department_name, program_name, degree_name, batch, semester, section_code, advisor_user_id, advisor_name, changed_by, change_source, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        tenantId,
        studentId,
        dto.school_name ?? null,
        dto.department_name ?? null,
        dto.program_name ?? null,
        dto.degree_name ?? null,
        dto.batch ?? null,
        dto.semester ?? null,
        dto.section_code ?? null,
        dto.advisor_user_id ?? null,
        dto.advisor_name ?? null,
        actorUserId,
        dto.source ?? 'MANUAL',
        dto.remarks ?? null,
      ],
    );

    return history;
  }

  async bulkAssignPlacement(
    tenantId: string,
    actorUserId: string,
    rows: Array<{
      enrollment_no?: string;
      email?: string;
      school_name?: string;
      department_name?: string;
      program_name?: string;
      degree_name?: string;
      batch?: string;
      semester?: number;
      section_code?: string;
      advisor_name?: string;
    }>,
  ) {
    const results: Array<{ ok: boolean; key: string; error?: string }> = [];
    for (const row of rows) {
      const key = row.enrollment_no || row.email || 'unknown';
      try {
        let studentId: string | undefined;
        if (row.enrollment_no) {
          const found = await this.db.query(
            `SELECT sp.user_id FROM student_profiles sp
             JOIN users u ON u.user_id = sp.user_id
             WHERE u.tenant_id = $1 AND (sp.enrollment_no = $2 OR sp.prn_number = $2)
             LIMIT 1`,
            [tenantId, row.enrollment_no],
          );
          studentId = found[0]?.user_id;
        }
        if (!studentId && row.email) {
          const found = await this.db.query(
            `SELECT user_id FROM users WHERE tenant_id = $1 AND lower(official_email) = lower($2) LIMIT 1`,
            [tenantId, row.email],
          );
          studentId = found[0]?.user_id;
        }
        if (!studentId) throw new BadRequestException('Student not found');
        await this.assignPlacement(tenantId, actorUserId, {
          student_user_id: studentId,
          ...row,
          source: 'BULK_EXCEL',
        });
        results.push({ ok: true, key });
      } catch (e) {
        results.push({
          ok: false,
          key,
          error: e instanceof Error ? e.message : 'Failed',
        });
      }
    }
    return {
      total: rows.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    };
  }

  async placementHistory(tenantId: string, studentUserId?: string) {
    if (studentUserId) {
      return this.db.query(
        `SELECT * FROM registrar_placement_history
         WHERE tenant_id = $1 AND student_user_id = $2
         ORDER BY created_at DESC LIMIT 100`,
        [tenantId, studentUserId],
      );
    }
    return this.db.query(
      `SELECT h.*, u.name AS student_name
       FROM registrar_placement_history h
       JOIN users u ON u.user_id = h.student_user_id
       WHERE h.tenant_id = $1
       ORDER BY h.created_at DESC LIMIT 100`,
      [tenantId],
    );
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async changeLifecycle(
    tenantId: string,
    actorUserId: string,
    studentUserId: string,
    toStatus: string,
    remarks?: string,
  ) {
    const normalized = toStatus.trim().toUpperCase().replace(/\s+/g, '_');
    if (!LIFECYCLE.includes(normalized as LifecycleStatus)) {
      throw new BadRequestException(`Invalid status. Allowed: ${LIFECYCLE.join(', ')}`);
    }

    const current = await this.db.query(
      `SELECT COALESCE(sp.lifecycle_status, sp.status, 'ACTIVE') AS status
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, studentUserId],
    );
    if (!current[0]) throw new NotFoundException('Student not found');
    const fromStatus = String(current[0].status ?? 'ACTIVE').toUpperCase();

    const profileStatus =
      normalized === 'ACTIVE' || normalized === 'ENROLLED'
        ? 'ACTIVE'
        : normalized === 'SUSPENDED' || normalized === 'ON_LEAVE'
          ? 'INACTIVE'
          : normalized === 'WITHDRAWN'
            ? 'WITHDRAWN'
            : normalized === 'GRADUATED' || normalized === 'ALUMNI'
              ? 'GRADUATED'
              : 'ACTIVE';

    await this.db.query(
      `INSERT INTO student_profiles (tenant_id, user_id, status, lifecycle_status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id) DO UPDATE SET
         tenant_id = COALESCE(student_profiles.tenant_id, EXCLUDED.tenant_id),
         status = EXCLUDED.status,
         lifecycle_status = EXCLUDED.lifecycle_status,
         updated_at = NOW()`,
      [tenantId, studentUserId, profileStatus, normalized],
    );

    if (normalized === 'ALUMNI' || normalized === 'GRADUATED') {
      await this.db.query(
        `UPDATE student_profiles
         SET final_result = COALESCE(final_result, 'PASS'),
             degree_award_status = COALESCE(degree_award_status, 'AWARDED'),
             alumni_conversion_flag = CASE WHEN $2 = 'ALUMNI' THEN true ELSE alumni_conversion_flag END,
             tenant_id = COALESCE(tenant_id, $3)
         WHERE user_id = $1`,
        [studentUserId, normalized, tenantId],
      );
    }

    const [row] = await this.db.query(
      `INSERT INTO registrar_lifecycle_history
        (tenant_id, student_user_id, from_status, to_status, remarks, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, studentUserId, fromStatus, normalized, remarks ?? null, actorUserId],
    );
    return row;
  }

  async lifecycleHistory(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT h.*, u.name AS changed_by_name
       FROM registrar_lifecycle_history h
       LEFT JOIN users u ON u.user_id = h.changed_by
       WHERE h.tenant_id = $1 AND h.student_user_id = $2
       ORDER BY h.created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  // ── Semester registration (proxy + remarks) ──────────────────────────────

  async listSemesterRegistrations(
    tenantId: string,
    filters: {
      status?: string;
      semester?: number;
      department?: string;
      program?: string;
      q?: string;
    },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT r.*, u.name AS student_name, u.official_email,
             sp.enrollment_no, sp.prn_number, sp.program_name, sp.section_code,
             d.dept_name AS department_name, w.title AS window_title
      FROM exam_semester_registrations r
      JOIN users u ON u.user_id = r.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = r.student_user_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id
      LEFT JOIN exam_form_windows w ON w.window_id = r.window_id
      WHERE r.tenant_id = $1`;
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND r.status = $${params.length}`;
    }
    if (filters.semester) {
      params.push(filters.semester);
      sql += ` AND r.semester = $${params.length}`;
    }
    if (filters.department) {
      params.push(filters.department);
      sql += ` AND d.dept_name = $${params.length}`;
    }
    if (filters.program) {
      params.push(filters.program);
      sql += ` AND sp.program_name = $${params.length}`;
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      sql += ` AND (lower(u.name) LIKE $${params.length} OR lower(COALESCE(sp.enrollment_no,'')) LIKE $${params.length})`;
    }
    sql += ` ORDER BY COALESCE(r.reviewed_at, r.created_at) DESC NULLS LAST, r.created_at DESC LIMIT 200`;
    try {
      return await this.db.query(sql, params);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`Failed to list semester registrations: ${message}`);
    }
  }

  async reviewSemesterRegistration(
    tenantId: string,
    actorUserId: string,
    registrationId: string,
    status: 'APPROVED' | 'REJECTED' | 'SENT_BACK',
    remarks?: string,
  ) {
    const [row] = await this.db.query(
      `UPDATE exam_semester_registrations
       SET status = $3, reviewed_by = $4, reviewed_at = NOW(),
           registrar_remarks = $5
       WHERE tenant_id = $1 AND registration_id = $2
       RETURNING *`,
      [tenantId, registrationId, status, actorUserId, remarks ?? null],
    );
    if (!row) throw new NotFoundException('Registration not found');
    await this.notifyRegistrars(tenantId, {
      title: `Semester registration ${status.toLowerCase().replace('_', ' ')}`,
      message: `Registration ${registrationId.slice(0, 8)}… marked ${status}${remarks ? ` — ${remarks}` : ''}.`,
      actionLink: '/admin/semester-registrations',
      severity: status === 'APPROVED' ? 'success' : status === 'REJECTED' ? 'warning' : 'info',
      intent: 'status_update',
    });
    return row;
  }

  // ── Certificate desk ─────────────────────────────────────────────────────

  async listCertificates(
    tenantId: string,
    filters: { type?: string; status?: string; q?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT c.*, u.name AS student_name, sp.enrollment_no, sp.prn_number
      FROM registrar_certificate_requests c
      JOIN users u ON u.user_id = c.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = c.student_user_id
      WHERE c.tenant_id = $1`;
    if (filters.type) {
      params.push(filters.type);
      sql += ` AND c.certificate_type = $${params.length}`;
    }
    if (filters.status) {
      params.push(filters.status);
      sql += ` AND c.status = $${params.length}`;
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      sql += ` AND (lower(u.name) LIKE $${params.length} OR lower(COALESCE(sp.enrollment_no,'')) LIKE $${params.length})`;
    }
    sql += ` ORDER BY c.created_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  async createCertificate(
    tenantId: string,
    dto: { student_user_id: string; certificate_type: string; remarks?: string },
  ) {
    const [row] = await this.db.query(
      `INSERT INTO registrar_certificate_requests
        (tenant_id, student_user_id, certificate_type, status, remarks)
       VALUES ($1,$2,$3,'DRAFT',$4) RETURNING *`,
      [tenantId, dto.student_user_id, dto.certificate_type, dto.remarks ?? null],
    );
    return row;
  }

  async transitionCertificate(
    tenantId: string,
    actorUserId: string,
    requestId: string,
    action: 'GENERATE' | 'SIGN' | 'ISSUE' | 'REJECT',
    remarks?: string,
  ) {
    const [current] = await this.db.query(
      `SELECT * FROM registrar_certificate_requests WHERE tenant_id = $1 AND request_id = $2`,
      [tenantId, requestId],
    );
    if (!current) throw new NotFoundException('Certificate request not found');

    const currentStatus = String(current.status).toUpperCase();
    const certType = String(current.certificate_type).toUpperCase();
    const isDegreeDoc = certType === 'DEGREE' || certType === 'DUPLICATE_DEGREE';
    const allowed: Record<string, string[]> = {
      GENERATE: ['DRAFT', 'REJECTED'],
      SIGN: ['GENERATED'],
      ISSUE: ['SIGNED'],
      REJECT: ['DRAFT', 'GENERATED'],
    };
    if (!allowed[action]?.includes(currentStatus)) {
      throw new BadRequestException(
        `Cannot ${action} certificate in status ${currentStatus}. Allowed from: ${(allowed[action] ?? []).join(', ') || 'none'}.`,
      );
    }

    let status = currentStatus;
    let verificationCode: string | null = current.verification_code ?? null;
    const patch: Record<string, unknown> = { remarks: remarks ?? current.remarks };
    if (action === 'GENERATE') {
      status = 'GENERATED';
      patch.pdf_url = `/api/admin/registrar-desk/certificates/${requestId}/pdf`;
    } else if (action === 'SIGN') {
      const attestation = await this.assertSignatureAttestation(tenantId, actorUserId);
      if (isDegreeDoc && !attestation.configured) {
        throw new BadRequestException(
          'Degree certificates require IT-configured DSC metadata (serial/CA/expiry) and a signature image before signing.',
        );
      }
      status = 'SIGNED';
      patch.signed_at = new Date();
      patch.signed_by = actorUserId;
      await this.db.query(
        `INSERT INTO registrar_signing_history (tenant_id, document_label, action, status, signed_by, signed_by_name)
         SELECT $1, $2, $4, 'COMPLETED', $3, u.name
         FROM users u WHERE u.user_id = $3`,
        [
          tenantId,
          `${current.certificate_type} — ${requestId}`,
          actorUserId,
          attestation.actionLabel,
        ],
      );
    } else if (action === 'ISSUE') {
      if (isDegreeDoc) {
        await this.assertDegreeIssuanceAllowed(tenantId, current.student_user_id);
      }
      status = 'ISSUED';
      patch.issued_at = new Date();
      patch.issued_by = actorUserId;
      verificationCode = createHash('sha256')
        .update(`${requestId}:${current.student_user_id}:${Date.now()}`)
        .digest('hex')
        .slice(0, 16)
        .toUpperCase();
      await this.notifyRegistrars(tenantId, {
        title: isDegreeDoc ? 'Degree certificate issued' : 'Certificate issued',
        message: `${certType} issued for request ${requestId.slice(0, 8)}. Verify: ${verificationCode}`,
        actionLink: '/admin/certificates',
        severity: 'success',
        intent: 'status_update',
      });
    } else if (action === 'REJECT') {
      status = 'REJECTED';
    }

    const [row] = await this.db.query(
      `UPDATE registrar_certificate_requests
       SET status = $3, remarks = $4, pdf_url = COALESCE($5, pdf_url),
           signed_at = COALESCE($6, signed_at), signed_by = COALESCE($7, signed_by),
           issued_at = COALESCE($8, issued_at), issued_by = COALESCE($9, issued_by),
           verification_code = COALESCE($10, verification_code),
           updated_at = NOW()
       WHERE tenant_id = $1 AND request_id = $2
       RETURNING *`,
      [
        tenantId,
        requestId,
        status,
        patch.remarks,
        patch.pdf_url ?? null,
        patch.signed_at ?? null,
        patch.signed_by ?? null,
        patch.issued_at ?? null,
        patch.issued_by ?? null,
        verificationCode,
      ],
    );
    await this.audit(tenantId, actorUserId, `CERT_${action}`, requestId, {
      status,
      certificate_type: certType,
      verification_code: verificationCode,
    }, { status: currentStatus });
    return row;
  }

  async verifyCertificatePublic(code: string) {
    const normalized = String(code ?? '')
      .trim()
      .toUpperCase();
    if (!normalized) throw new BadRequestException('Verification code is required');
    const [row] = await this.db.query(
      `SELECT c.request_id, c.certificate_type, c.status, c.issued_at, c.verification_code,
              u.name AS student_name, sp.enrollment_no, sp.program_name, sp.degree_name,
              t.name AS university_name
       FROM registrar_certificate_requests c
       JOIN users u ON u.user_id = c.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = c.student_user_id
       LEFT JOIN tenants t ON t.tenant_id = c.tenant_id
       WHERE c.verification_code = $1 AND c.status = 'ISSUED'
       LIMIT 1`,
      [normalized],
    );
    if (!row) throw new NotFoundException('Certificate verification code not found or invalid');
    return {
      valid: true,
      verification_code: row.verification_code,
      certificate_type: row.certificate_type,
      student_name: row.student_name,
      enrollment_no: row.enrollment_no,
      program_name: row.program_name,
      degree_name: row.degree_name,
      university_name: row.university_name,
      issued_at: row.issued_at,
      status: row.status,
    };
  }

  // ── Reports ──────────────────────────────────────────────────────────────

  async reportsSummary(tenantId: string) {
    const [enrollment] = await this.db.query(
      `SELECT COUNT(*)::int AS total
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE u.tenant_id = $1 AND COALESCE(sp.lifecycle_status, sp.status) IN ('ENROLLED','ACTIVE')`,
      [tenantId],
    );
    const byStatus = await this.db.query(
      `SELECT COALESCE(sp.lifecycle_status, sp.status, 'ACTIVE') AS status, COUNT(*)::int AS count
       FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE u.tenant_id = $1
       GROUP BY 1
       ORDER BY 2 DESC`,
      [tenantId],
    );
    const byDept = await this.db.query(
      `SELECT COALESCE(d.dept_name, 'Unassigned') AS department, COUNT(*)::int AS count
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id AND lower(r.role_name) = 'student'
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
       GROUP BY 1
       ORDER BY 2 DESC
       LIMIT 20`,
      [tenantId],
    );
    const certs = await this.db.query(
      `SELECT certificate_type, status, COUNT(*)::int AS count
       FROM registrar_certificate_requests WHERE tenant_id = $1
       GROUP BY 1, 2`,
      [tenantId],
    );
    const [pendingRegs] = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM exam_semester_registrations
       WHERE tenant_id = $1 AND status IN ('SUBMITTED','PENDING','SENT_BACK')`,
      [tenantId],
    );
    const [graduated] = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM student_profiles sp
       JOIN users u ON u.user_id = sp.user_id
       WHERE u.tenant_id = $1 AND COALESCE(sp.lifecycle_status, sp.status) IN ('GRADUATED','ALUMNI')`,
      [tenantId],
    );

    return {
      enrollment_active: enrollment?.total ?? 0,
      graduated_alumni: graduated?.count ?? 0,
      pending_registrations: pendingRegs?.count ?? 0,
      status_breakdown: byStatus,
      department_stats: byDept,
      certificate_stats: certs,
    };
  }

  async reportsExportBuffer(
    tenantId: string,
    format: 'csv' | 'pdf' = 'csv',
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    const summary = await this.reportsSummary(tenantId);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'pdf') {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([595.28, 841.89]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const navy = rgb(0.043, 0.141, 0.278);
      let y = 800;
      page.drawText('Registrar Reports Summary', { x: 50, y, size: 16, font: bold, color: navy });
      y -= 28;
      const lines = [
        `Enrollment active: ${summary.enrollment_active}`,
        `Graduated / alumni: ${summary.graduated_alumni}`,
        `Pending registrations: ${summary.pending_registrations}`,
        '',
        'Lifecycle status',
        ...(summary.status_breakdown as Array<{ status: string; count: number }>).map(
          (r) => `  ${r.status}: ${r.count}`,
        ),
        '',
        'Departments',
        ...(summary.department_stats as Array<{ department: string; count: number }>)
          .slice(0, 15)
          .map((r) => `  ${r.department}: ${r.count}`),
      ];
      for (const line of lines) {
        if (y < 50) break;
        page.drawText(line.slice(0, 90), { x: 50, y, size: 10, font, color: navy });
        y -= 14;
      }
      const bytes = await pdfDoc.save();
      return {
        buffer: Buffer.from(bytes),
        filename: `registrar-reports-${stamp}.pdf`,
        contentType: 'application/pdf',
      };
    }

    const lines = [
      'Report,Value',
      `Enrollment Report,${summary.enrollment_active}`,
      `Graduation Report,${summary.graduated_alumni}`,
      `Pending Approvals,${summary.pending_registrations}`,
      '',
      'Status,Count',
      ...(summary.status_breakdown as Array<{ status: string; count: number }>).map(
        (r) => `${r.status},${r.count}`,
      ),
      '',
      'Department,Count',
      ...(summary.department_stats as Array<{ department: string; count: number }>).map(
        (r) => `"${String(r.department).replace(/"/g, '""')}",${r.count}`,
      ),
      '',
      'Certificate Type,Status,Count',
      ...(summary.certificate_stats as Array<{
        certificate_type: string;
        status: string;
        count: number;
      }>).map((r) => `${r.certificate_type},${r.status},${r.count}`),
    ];
    return {
      buffer: Buffer.from(lines.join('\n'), 'utf8'),
      filename: `registrar-reports-${stamp}.csv`,
      contentType: 'text/csv; charset=utf-8',
    };
  }

  async listRecentActivity(tenantId: string, limit = 25) {
    const rows = await this.db.query(
      `(
         SELECT 'certificate' AS kind, c.request_id::text AS id,
                (c.certificate_type || ' — ' || c.status) AS title,
                u.name AS actor_name, c.updated_at AS occurred_at
         FROM registrar_certificate_requests c
         LEFT JOIN users u ON u.user_id = COALESCE(c.issued_by, c.signed_by)
         WHERE c.tenant_id = $1
       )
       UNION ALL
       (
         SELECT 'petition' AS kind, p.petition_id::text AS id,
                (p.petition_type || ' — ' || p.status) AS title,
                u.name AS actor_name, p.updated_at AS occurred_at
         FROM registrar_petitions p
         LEFT JOIN users u ON u.user_id = p.decided_by
         WHERE p.tenant_id = $1
       )
       UNION ALL
       (
         SELECT 'signing' AS kind, h.sign_id::text AS id,
                (h.document_label || ' — ' || h.action) AS title,
                h.signed_by_name AS actor_name, h.created_at AS occurred_at
         FROM registrar_signing_history h
         WHERE h.tenant_id = $1
       )
       ORDER BY occurred_at DESC NULLS LAST
       LIMIT $2`,
      [tenantId, Math.min(limit, 50)],
    ).catch(() => []);
    return rows;
  }

  // ── Legal ────────────────────────────────────────────────────────────────

  private async safeLegalQuery<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    try {
      return await this.db.query(sql, params);
    } catch {
      // Tables may be missing until legal RTI migration runs — never 500 the desk.
      return [];
    }
  }

  listRti(tenantId: string) {
    return this.safeLegalQuery(
      `SELECT * FROM registrar_rti_requests WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async upsertRti(
    tenantId: string,
    actorUserId: string,
    dto: {
      rti_id?: string;
      reference_no: string;
      applicant_name: string;
      subject: string;
      department?: string;
      status?: string;
      due_date?: string;
      assigned_to?: string;
      reply_summary?: string;
    },
  ) {
    if (dto.rti_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_rti_requests SET
           reference_no=$3, applicant_name=$4, subject=$5, department=$6, status=$7,
           due_date=$8, assigned_to=$9, reply_summary=$10, updated_at=NOW()
         WHERE tenant_id=$1 AND rti_id=$2 RETURNING *`,
        [
          tenantId,
          dto.rti_id,
          dto.reference_no,
          dto.applicant_name,
          dto.subject,
          dto.department ?? null,
          dto.status ?? 'OPEN',
          dto.due_date ?? null,
          dto.assigned_to ?? null,
          dto.reply_summary ?? null,
        ],
      );
      if (!row) throw new NotFoundException('RTI request not found');
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_rti_requests
        (tenant_id, reference_no, applicant_name, subject, department, status, due_date, assigned_to, reply_summary, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        tenantId,
        dto.reference_no,
        dto.applicant_name,
        dto.subject,
        dto.department ?? null,
        dto.status ?? 'OPEN',
        dto.due_date ?? null,
        dto.assigned_to ?? null,
        dto.reply_summary ?? null,
        actorUserId,
      ],
    );
    return row;
  }

  listCourt(tenantId: string) {
    return this.safeLegalQuery(
      `SELECT * FROM registrar_court_cases WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
  }

  async upsertCourt(
    tenantId: string,
    dto: {
      case_id?: string;
      case_number: string;
      title: string;
      court_name?: string;
      status?: string;
      next_hearing?: string;
      counsel?: string;
    },
  ) {
    if (dto.case_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_court_cases SET
           case_number=$3, title=$4, court_name=$5, status=$6, next_hearing=$7, counsel=$8, updated_at=NOW()
         WHERE tenant_id=$1 AND case_id=$2 RETURNING *`,
        [
          tenantId,
          dto.case_id,
          dto.case_number,
          dto.title,
          dto.court_name ?? null,
          dto.status ?? 'ACTIVE',
          dto.next_hearing ?? null,
          dto.counsel ?? null,
        ],
      );
      if (!row) throw new NotFoundException('Court case not found');
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_court_cases
        (tenant_id, case_number, title, court_name, status, next_hearing, counsel)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [
        tenantId,
        dto.case_number,
        dto.title,
        dto.court_name ?? null,
        dto.status ?? 'ACTIVE',
        dto.next_hearing ?? null,
        dto.counsel ?? null,
      ],
    );
    return row;
  }

  listNotices(tenantId: string) {
    return this.safeLegalQuery(
      `SELECT * FROM registrar_legal_notices WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async upsertNotice(
    tenantId: string,
    dto: {
      notice_id?: string;
      notice_number: string;
      title: string;
      party?: string;
      status?: string;
      due_date?: string;
    },
  ) {
    if (dto.notice_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_legal_notices SET
           notice_number=$3, title=$4, party=$5, status=$6, due_date=$7, updated_at=NOW()
         WHERE tenant_id=$1 AND notice_id=$2 RETURNING *`,
        [
          tenantId,
          dto.notice_id,
          dto.notice_number,
          dto.title,
          dto.party ?? null,
          dto.status ?? 'OPEN',
          dto.due_date ?? null,
        ],
      );
      if (!row) throw new NotFoundException('Legal notice not found');
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_legal_notices
        (tenant_id, notice_number, title, party, status, due_date)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        tenantId,
        dto.notice_number,
        dto.title,
        dto.party ?? null,
        dto.status ?? 'OPEN',
        dto.due_date ?? null,
      ],
    );
    return row;
  }

  listDisciplinary(tenantId: string) {
    return this.safeLegalQuery(
      `SELECT * FROM registrar_disciplinary_cases WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
  }

  async upsertDisciplinary(
    tenantId: string,
    dto: {
      case_id?: string;
      case_number: string;
      student_name?: string;
      allegation: string;
      status?: string;
      committee?: string;
    },
  ) {
    if (dto.case_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_disciplinary_cases SET
           case_number=$3, student_name=$4, allegation=$5, status=$6, committee=$7, updated_at=NOW()
         WHERE tenant_id=$1 AND case_id=$2 RETURNING *`,
        [
          tenantId,
          dto.case_id,
          dto.case_number,
          dto.student_name ?? null,
          dto.allegation,
          dto.status ?? 'OPEN',
          dto.committee ?? null,
        ],
      );
      if (!row) throw new NotFoundException('Disciplinary case not found');
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_disciplinary_cases
        (tenant_id, case_number, student_name, allegation, status, committee)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        tenantId,
        dto.case_number,
        dto.student_name ?? null,
        dto.allegation,
        dto.status ?? 'OPEN',
        dto.committee ?? null,
      ],
    );
    return row;
  }

  async legalCompliance(tenantId: string) {
    const [rtiOpen] = await this.safeLegalQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM registrar_rti_requests
       WHERE tenant_id=$1 AND status IN ('OPEN','PENDING','IN_PROGRESS')`,
      [tenantId],
    );
    const [rtiDue] = await this.safeLegalQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM registrar_rti_requests
       WHERE tenant_id=$1 AND due_date IS NOT NULL AND due_date <= CURRENT_DATE + 7
         AND status IN ('OPEN','PENDING','IN_PROGRESS')`,
      [tenantId],
    );
    const [court] = await this.safeLegalQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM registrar_court_cases WHERE tenant_id=$1 AND status='ACTIVE'`,
      [tenantId],
    );
    const [notices] = await this.safeLegalQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM registrar_legal_notices WHERE tenant_id=$1 AND status='OPEN'`,
      [tenantId],
    );
    const [disc] = await this.safeLegalQuery<{ c: number }>(
      `SELECT COUNT(*)::int AS c FROM registrar_disciplinary_cases WHERE tenant_id=$1 AND status='OPEN'`,
      [tenantId],
    );
    return {
      rti_open: rtiOpen?.c ?? 0,
      rti_due_soon: rtiDue?.c ?? 0,
      court_active: court?.c ?? 0,
      notices_open: notices?.c ?? 0,
      disciplinary_open: disc?.c ?? 0,
    };
  }

  // ── Staff appointments ───────────────────────────────────────────────────

  listAppointments(tenantId: string) {
    return this.db.query(
      `SELECT * FROM registrar_staff_appointments WHERE tenant_id = $1 ORDER BY updated_at DESC`,
      [tenantId],
    );
  }

  async upsertAppointment(
    tenantId: string,
    dto: Record<string, unknown> & { appointment_id?: string; employee_id: string; candidate_name: string; position: string },
  ) {
    if (dto.appointment_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_staff_appointments SET
           employee_id=$3, candidate_name=$4, position=$5, department=$6, joining_date=$7,
           salary_package=$8, recruitment_status=$9, verification_status=$10, workflow_stage=$11,
           reporting_manager=$12, email=$13, phone=$14, salary_json=$15::jsonb, checklist_json=$16::jsonb,
           letter_status=$17, remarks=$18, updated_at=NOW()
         WHERE tenant_id=$1 AND appointment_id=$2 RETURNING *`,
        [
          tenantId,
          dto.appointment_id,
          dto.employee_id,
          dto.candidate_name,
          dto.position,
          dto.department ?? null,
          dto.joining_date ?? null,
          dto.salary_package ?? null,
          dto.recruitment_status ?? 'Selected',
          dto.verification_status ?? 'Pending',
          dto.workflow_stage ?? 'HR',
          dto.reporting_manager ?? null,
          dto.email ?? null,
          dto.phone ?? null,
          JSON.stringify(dto.salary_json ?? {}),
          JSON.stringify(dto.checklist_json ?? []),
          dto.letter_status ?? 'DRAFT',
          dto.remarks ?? null,
        ],
      );
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_staff_appointments
        (tenant_id, employee_id, candidate_name, position, department, joining_date, salary_package,
         recruitment_status, verification_status, workflow_stage, reporting_manager, email, phone,
         salary_json, checklist_json, letter_status, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17)
       RETURNING *`,
      [
        tenantId,
        dto.employee_id,
        dto.candidate_name,
        dto.position,
        dto.department ?? null,
        dto.joining_date ?? null,
        dto.salary_package ?? null,
        dto.recruitment_status ?? 'Selected',
        dto.verification_status ?? 'Pending',
        dto.workflow_stage ?? 'Registrar',
        dto.reporting_manager ?? null,
        dto.email ?? null,
        dto.phone ?? null,
        JSON.stringify(dto.salary_json ?? {}),
        JSON.stringify(dto.checklist_json ?? []),
        dto.letter_status ?? 'DRAFT',
        dto.remarks ?? null,
      ],
    );
    await this.logAppointmentActivity(tenantId, row.appointment_id, 'Appointment created', 'Registrar');
    return row;
  }

  async appointmentAction(
    tenantId: string,
    actorUserId: string,
    actorName: string,
    appointmentId: string,
    action: 'VERIFY' | 'APPROVE' | 'REJECT' | 'SIGN_ISSUE',
    remarks?: string,
  ) {
    const [current] = await this.db.query(
      `SELECT * FROM registrar_staff_appointments WHERE tenant_id=$1 AND appointment_id=$2`,
      [tenantId, appointmentId],
    );
    if (!current) throw new NotFoundException('Appointment not found');

    let patch: Record<string, string> = {};
    let event = String(action);
    let letterPdfUrl: string | null = null;
    if (action === 'VERIFY') {
      patch = { verification_status: 'Verified', workflow_stage: 'Registrar' };
      event = 'Documents verified';
    } else if (action === 'APPROVE') {
      patch = { recruitment_status: 'Offer Extended', workflow_stage: 'Registrar' };
      event = 'Appointment approved';
    } else if (action === 'REJECT') {
      patch = {
        verification_status: 'Rejected',
        recruitment_status: 'Withdrawn',
        workflow_stage: 'HR',
      };
      event = `Appointment rejected${remarks ? ` — ${remarks}` : ''}`;
    } else if (action === 'SIGN_ISSUE') {
      if (String(current.recruitment_status) !== 'Offer Extended') {
        throw new BadRequestException(
          'Approve the appointment (Offer Extended) before signing and issuing the letter',
        );
      }
      if (String(current.verification_status) !== 'Verified') {
        throw new BadRequestException(
          'Documents must be verified before signing and issuing the letter',
        );
      }
      if (String(current.letter_status) === 'ISSUED') {
        throw new BadRequestException('Appointment letter is already issued');
      }
      const attestation = await this.assertSignatureAttestation(
        tenantId,
        actorUserId,
      );
      patch = {
        letter_status: 'ISSUED',
        workflow_stage: 'Appointment Issued',
        verification_status: 'Verified',
      };
      letterPdfUrl = `/api/admin/registrar-desk/appointments/${appointmentId}/pdf`;
      event = 'Letter signed & issued';
      await this.db.query(
        `INSERT INTO registrar_signing_history
          (tenant_id, document_label, action, status, signed_by, signed_by_name)
         VALUES ($1,$2,$4,'COMPLETED',$5,$3)`,
        [
          tenantId,
          `Appointment — ${current.candidate_name}`,
          actorName,
          attestation.actionLabel,
          actorUserId,
        ],
      );
      await this.notifyRegistrars(tenantId, {
        title: 'Appointment letter issued',
        message: `${current.candidate_name} — ${current.position} letter signed and issued.`,
        actionLink: '/admin/staff-appointments',
        severity: 'success',
        intent: 'status_update',
      });
    }

    const [row] = await this.db.query(
      `UPDATE registrar_staff_appointments SET
         verification_status = COALESCE($3, verification_status),
         recruitment_status = COALESCE($4, recruitment_status),
         workflow_stage = COALESCE($5, workflow_stage),
         letter_status = COALESCE($6, letter_status),
         letter_pdf_url = COALESCE($8, letter_pdf_url),
         remarks = COALESCE($7, remarks),
         updated_at = NOW()
       WHERE tenant_id=$1 AND appointment_id=$2 RETURNING *`,
      [
        tenantId,
        appointmentId,
        patch.verification_status ?? null,
        patch.recruitment_status ?? null,
        patch.workflow_stage ?? null,
        patch.letter_status ?? null,
        remarks ?? null,
        letterPdfUrl,
      ],
    );
    await this.logAppointmentActivity(tenantId, appointmentId, event, actorName);
    return row;
  }

  async getAppointmentLetterPdfBuffer(
    tenantId: string,
    appointmentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [row] = await this.db.query(
      `SELECT * FROM registrar_staff_appointments
       WHERE tenant_id = $1 AND appointment_id = $2`,
      [tenantId, appointmentId],
    );
    if (!row) throw new NotFoundException('Appointment not found');
    if (String(row.letter_status) !== 'ISSUED') {
      throw new BadRequestException(
        'Appointment letter PDF is available only after Sign & issue',
      );
    }

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const navy = rgb(0.043, 0.141, 0.278);
    const muted = rgb(0.35, 0.35, 0.4);

    page.drawText('APPOINTMENT LETTER', {
      x: width / 2 - bold.widthOfTextAtSize('APPOINTMENT LETTER', 18) / 2,
      y: height - 100,
      size: 18,
      font: bold,
      color: navy,
    });
    page.drawText('Office of the Registrar', {
      x: width / 2 - font.widthOfTextAtSize('Office of the Registrar', 12) / 2,
      y: height - 125,
      size: 12,
      font,
      color: muted,
    });

    const lines = [
      `Employee ID: ${row.employee_id ?? '—'}`,
      `Candidate: ${row.candidate_name ?? '—'}`,
      `Position: ${row.position ?? '—'}`,
      `Department: ${row.department ?? '—'}`,
      `Joining date: ${row.joining_date ? String(row.joining_date).slice(0, 10) : '—'}`,
      `Salary package: ${row.salary_package ?? '—'}`,
      `Reporting manager: ${row.reporting_manager ?? '—'}`,
      `Letter status: ${row.letter_status ?? '—'}`,
      `Issued on: ${new Date().toLocaleDateString('en-IN')}`,
    ];
    let y = height - 190;
    for (const line of lines) {
      page.drawText(line, { x: 72, y, size: 12, font, color: navy });
      y -= 24;
    }
    page.drawText(
      'This letter confirms the appointment under the authority of the University Registrar.',
      { x: 72, y: y - 20, size: 11, font, color: muted },
    );
    page.drawText(
      'Signature attestation: metadata + signature image (not HSM/Class-3 crypto).',
      { x: 72, y: y - 40, size: 9, font, color: muted },
    );

    let signedBy: string | null = null;
    try {
      const [hist] = await this.db.query(
        `SELECT signed_by FROM registrar_signing_history
         WHERE tenant_id = $1 AND document_label LIKE $2
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, `Appointment — ${row.candidate_name}%`],
      );
      signedBy = hist?.signed_by ? String(hist.signed_by) : null;
    } catch {
      signedBy = null;
    }
    await this.embedSignatureImage(pdfDoc, page, tenantId, signedBy, width - 250, 95);

    page.drawText('Registrar', {
      x: width - 250,
      y: 78,
      size: 11,
      font: bold,
      color: navy,
    });

    const bytes = await pdfDoc.save();
    const safe = String(row.candidate_name ?? 'appointment')
      .replace(/[^\w-]+/g, '_')
      .slice(0, 40);
    return {
      buffer: Buffer.from(bytes),
      filename: `appointment-letter-${safe}.pdf`,
    };
  }

  private async embedSignatureImage(
    pdfDoc: PDFDocument,
    page: ReturnType<PDFDocument['addPage']>,
    tenantId: string,
    ownerUserId: string | null,
    x: number,
    y: number,
  ) {
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const navy = rgb(0.043, 0.141, 0.278);
    if (!ownerUserId) {
      page.drawText('_________________________', { x, y, size: 10, font, color: navy });
      return;
    }
    try {
      const [dsc] = await this.db.query(
        `SELECT signature_image_url FROM registrar_dsc_credentials
         WHERE tenant_id = $1 AND owner_user_id = $2`,
        [tenantId, ownerUserId],
      );
      const dataUrl = String(dsc?.signature_image_url ?? '');
      const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
      if (!match) {
        page.drawText('_________________________', { x, y, size: 10, font, color: navy });
        return;
      }
      const imgBytes = Buffer.from(match[2], 'base64');
      const embedded =
        match[1].toLowerCase() === 'png'
          ? await pdfDoc.embedPng(imgBytes)
          : await pdfDoc.embedJpg(imgBytes);
      const imgW = 130;
      const imgH = Math.min((embedded.height / embedded.width) * imgW, 48);
      page.drawImage(embedded, { x, y, width: imgW, height: imgH });
    } catch {
      page.drawText('_________________________', { x, y, size: 10, font, color: navy });
    }
  }

  listAppointmentActivity(tenantId: string) {
    return this.db.query(
      `SELECT a.*, s.candidate_name
       FROM registrar_appointment_activity a
       JOIN registrar_staff_appointments s ON s.appointment_id = a.appointment_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC LIMIT 100`,
      [tenantId],
    );
  }

  private async logAppointmentActivity(
    tenantId: string,
    appointmentId: string,
    event: string,
    actor: string,
  ) {
    await this.db.query(
      `INSERT INTO registrar_appointment_activity (tenant_id, appointment_id, event, actor)
       VALUES ($1,$2,$3,$4)`,
      [tenantId, appointmentId, event, actor],
    );
  }

  // ── Governance ───────────────────────────────────────────────────────────

  listGovernance(tenantId: string, category?: string, status?: string) {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM registrar_governance_tasks WHERE tenant_id = $1`;
    if (category) {
      params.push(category);
      sql += ` AND category = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }
    sql += ` ORDER BY updated_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  async upsertGovernance(
    tenantId: string,
    actorUserId: string,
    dto: {
      task_id?: string;
      title: string;
      category: string;
      body?: string;
      status?: string;
      priority?: string;
      due_date?: string;
      owner_name?: string;
    },
  ) {
    if (dto.task_id) {
      const [row] = await this.db.query(
        `UPDATE registrar_governance_tasks SET
           title=$3, category=$4, body=$5, status=$6, priority=$7, due_date=$8, owner_name=$9, updated_at=NOW()
         WHERE tenant_id=$1 AND task_id=$2 RETURNING *`,
        [
          tenantId,
          dto.task_id,
          dto.title,
          dto.category,
          dto.body ?? null,
          dto.status ?? 'PENDING',
          dto.priority ?? 'MEDIUM',
          dto.due_date ?? null,
          dto.owner_name ?? null,
        ],
      );
      return row;
    }
    const [row] = await this.db.query(
      `INSERT INTO registrar_governance_tasks
        (tenant_id, title, category, body, status, priority, due_date, owner_name, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        tenantId,
        dto.title,
        dto.category,
        dto.body ?? null,
        dto.status ?? 'PENDING',
        dto.priority ?? 'MEDIUM',
        dto.due_date ?? null,
        dto.owner_name ?? null,
        actorUserId,
      ],
    );
    return row;
  }

  async decideGovernance(
    tenantId: string,
    actorUserId: string,
    taskId: string,
    status: 'APPROVED' | 'REJECTED',
    decision_remarks?: string,
  ) {
    const [row] = await this.db.query(
      `UPDATE registrar_governance_tasks SET
         status=$3, decided_by=$4, decision_remarks=$5, updated_at=NOW()
       WHERE tenant_id=$1 AND task_id=$2 RETURNING *`,
      [tenantId, taskId, status, actorUserId, decision_remarks ?? null],
    );
    if (!row) throw new NotFoundException('Governance task not found');
    return row;
  }

  // ── DSC ──────────────────────────────────────────────────────────────────

  /**
   * Never auto-seed fake Class-3 CA credentials. IT Admin must configure
   * certificate metadata via configureDsc. Registrars may still upload a
   * signature image for visual attestation.
   */
  async getDsc(tenantId: string, ownerUserId: string, ownerName: string) {
    const [row] = await this.db.query(
      `SELECT * FROM registrar_dsc_credentials WHERE tenant_id=$1 AND owner_user_id=$2`,
      [tenantId, ownerUserId],
    );
    const history = await this.db.query(
      `SELECT * FROM registrar_signing_history WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50`,
      [tenantId],
    );
    if (!row) {
      return {
        certificate: null,
        history,
        configuration_required: true,
        owner_name: ownerName,
        message:
          'No DSC credential is configured. Upload a signature image for attestation, and ask IT Admin to register the official DSC metadata.',
      };
    }
    const status = this.normalizeDscStatus(row);
    return {
      certificate: { ...row, status },
      history,
      configuration_required: !['CONNECTED', 'EXPIRING'].includes(status),
    };
  }

  private normalizeDscStatus(row: {
    status?: string;
    expiry_date?: string | Date | null;
  }): string {
    const raw = String(row.status ?? 'NOT_CONFIGURED').toUpperCase();
    if (raw === 'RENEWAL_REQUESTED') return raw;
    if (!row.expiry_date && !['CONNECTED', 'EXPIRING', 'EXPIRED'].includes(raw)) {
      return 'NOT_CONFIGURED';
    }
    if (row.expiry_date) {
      const expiry = new Date(row.expiry_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (expiry < today) return 'EXPIRED';
      const in30 = new Date(today);
      in30.setDate(in30.getDate() + 30);
      if (expiry <= in30) return 'EXPIRING';
      if (raw === 'NOT_CONFIGURED' || raw === 'PENDING_IT_CONFIG') return raw;
      return 'CONNECTED';
    }
    return raw || 'NOT_CONFIGURED';
  }

  private async assertSignatureAttestation(
    tenantId: string,
    actorUserId: string,
  ): Promise<{ actionLabel: string; configured: boolean }> {
    const [dsc] = await this.db.query(
      `SELECT * FROM registrar_dsc_credentials WHERE tenant_id=$1 AND owner_user_id=$2`,
      [tenantId, actorUserId],
    );
    if (!dsc?.signature_image_url) {
      throw new BadRequestException(
        'Upload a signature image before signing. Official DSC metadata must be configured by IT Admin for Class-3 claims.',
      );
    }
    const status = this.normalizeDscStatus(dsc);
    if (status === 'EXPIRED') {
      throw new BadRequestException(
        'DSC certificate has expired. Request renewal before signing documents.',
      );
    }
    const configured = ['CONNECTED', 'EXPIRING'].includes(status) && !!dsc.serial_number;
    return {
      configured,
      actionLabel: configured
        ? 'Digitally Sign (configured DSC)'
        : 'Signature image attestation (DSC not configured)',
    };
  }

  async updateSignatureImage(
    tenantId: string,
    ownerUserId: string,
    signatureImageUrl: string | null,
  ) {
    const [user] = await this.db.query(
      `SELECT name FROM users WHERE tenant_id=$1 AND user_id=$2`,
      [tenantId, ownerUserId],
    );
    const [row] = await this.db.query(
      `INSERT INTO registrar_dsc_credentials
        (tenant_id, owner_user_id, owner_name, certificate_name, status, signature_image_url)
       VALUES ($1,$2,$3,'Awaiting IT Admin DSC configuration','NOT_CONFIGURED',$4)
       ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
         signature_image_url = EXCLUDED.signature_image_url,
         owner_name = COALESCE(registrar_dsc_credentials.owner_name, EXCLUDED.owner_name),
         updated_at = NOW()
       RETURNING *`,
      [tenantId, ownerUserId, user?.name ?? 'Registrar', signatureImageUrl],
    );
    return row;
  }

  async configureDsc(
    tenantId: string,
    ownerUserId: string,
    dto: {
      certificate_name: string;
      certificate_authority?: string;
      serial_number: string;
      valid_from?: string;
      expiry_date: string;
      issued_by?: string;
      owner_name?: string;
    },
  ) {
    if (!dto.certificate_name?.trim() || !dto.serial_number?.trim() || !dto.expiry_date) {
      throw new BadRequestException(
        'certificate_name, serial_number, and expiry_date are required',
      );
    }
    const [user] = await this.db.query(
      `SELECT name FROM users WHERE tenant_id=$1 AND user_id=$2`,
      [tenantId, ownerUserId],
    );
    const [row] = await this.db.query(
      `INSERT INTO registrar_dsc_credentials
        (tenant_id, owner_user_id, owner_name, certificate_name, certificate_authority,
         serial_number, valid_from, expiry_date, status, issued_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'CONNECTED',$9)
       ON CONFLICT (tenant_id, owner_user_id) DO UPDATE SET
         owner_name = COALESCE(EXCLUDED.owner_name, registrar_dsc_credentials.owner_name),
         certificate_name = EXCLUDED.certificate_name,
         certificate_authority = EXCLUDED.certificate_authority,
         serial_number = EXCLUDED.serial_number,
         valid_from = EXCLUDED.valid_from,
         expiry_date = EXCLUDED.expiry_date,
         issued_by = EXCLUDED.issued_by,
         status = 'CONNECTED',
         updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        ownerUserId,
        dto.owner_name?.trim() || user?.name || 'Registrar',
        dto.certificate_name.trim(),
        dto.certificate_authority?.trim() || null,
        dto.serial_number.trim(),
        dto.valid_from ?? null,
        dto.expiry_date,
        dto.issued_by?.trim() || null,
      ],
    );
    return { ...row, status: this.normalizeDscStatus(row) };
  }

  async requestDscRenewal(tenantId: string, ownerUserId: string, notes: string) {
    const [existing] = await this.db.query(
      `SELECT credential_id FROM registrar_dsc_credentials WHERE tenant_id=$1 AND owner_user_id=$2`,
      [tenantId, ownerUserId],
    );
    if (!existing) {
      throw new BadRequestException(
        'No DSC credential exists to renew. Ask IT Admin to configure the certificate first.',
      );
    }
    await this.db.query(
      `UPDATE registrar_dsc_credentials SET status='RENEWAL_REQUESTED', updated_at=NOW()
       WHERE tenant_id=$1 AND owner_user_id=$2`,
      [tenantId, ownerUserId],
    );
    await this.db.query(
      `INSERT INTO registrar_signing_history (tenant_id, document_label, action, status, signed_by, signed_by_name)
       SELECT $1, 'DSC Renewal', $2, 'PENDING', $3, u.name FROM users u WHERE u.user_id=$3`,
      [tenantId, notes || 'Renewal requested', ownerUserId],
    );
    await this.notifyRegistrars(tenantId, {
      title: 'DSC renewal requested',
      message: notes?.trim() || 'Registrar requested DSC certificate renewal from IT.',
      actionLink: '/admin/account/settings/digital-signature',
      severity: 'warning',
      intent: 'action_required',
    });
    await this.audit(tenantId, ownerUserId, 'DSC_RENEWAL_REQUESTED');
    return { ok: true };
  }

  async listSignQueue(tenantId: string) {
    const certificates = await this.db.query(
      `SELECT c.request_id, c.certificate_type, c.status, u.name AS student_name, sp.enrollment_no
       FROM registrar_certificate_requests c
       JOIN users u ON u.user_id = c.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = c.student_user_id
       WHERE c.tenant_id = $1 AND c.status = 'GENERATED'
       ORDER BY c.updated_at DESC
       LIMIT 100`,
      [tenantId],
    );
    const appointments = await this.db.query(
      `SELECT appointment_id, candidate_name, position, department, letter_status, recruitment_status
       FROM registrar_staff_appointments
       WHERE tenant_id = $1
         AND verification_status = 'Verified'
         AND recruitment_status = 'Offer Extended'
         AND letter_status <> 'ISSUED'
       ORDER BY updated_at DESC
       LIMIT 100`,
      [tenantId],
    );
    return {
      certificates,
      appointments,
      totals: {
        certificates: certificates.length,
        appointments: appointments.length,
      },
    };
  }

  async recordBulkSign(
    tenantId: string,
    actorUserId: string,
    actorName: string,
    queue: 'certificates' | 'appointments' | 'all' = 'certificates',
  ) {
    await this.assertSignatureAttestation(tenantId, actorUserId);
    const signed: Array<{ kind: string; id: string }> = [];
    const errors: Array<{ kind: string; id: string; message: string }> = [];

    if (queue === 'certificates' || queue === 'all') {
      const pending = await this.db.query(
        `SELECT request_id FROM registrar_certificate_requests
         WHERE tenant_id = $1 AND status = 'GENERATED'
         ORDER BY updated_at ASC LIMIT 50`,
        [tenantId],
      );
      for (const row of pending as Array<{ request_id: string }>) {
        try {
          await this.transitionCertificate(tenantId, actorUserId, row.request_id, 'SIGN');
          signed.push({ kind: 'certificate', id: row.request_id });
        } catch (err) {
          errors.push({
            kind: 'certificate',
            id: row.request_id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (queue === 'appointments' || queue === 'all') {
      const pending = await this.db.query(
        `SELECT appointment_id FROM registrar_staff_appointments
         WHERE tenant_id = $1
           AND verification_status = 'Verified'
           AND recruitment_status = 'Offer Extended'
           AND letter_status <> 'ISSUED'
         ORDER BY updated_at ASC LIMIT 50`,
        [tenantId],
      );
      for (const row of pending as Array<{ appointment_id: string }>) {
        try {
          await this.appointmentAction(
            tenantId,
            actorUserId,
            actorName,
            row.appointment_id,
            'SIGN_ISSUE',
          );
          signed.push({ kind: 'appointment', id: row.appointment_id });
        } catch (err) {
          errors.push({
            kind: 'appointment',
            id: row.appointment_id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    if (!signed.length && !errors.length) {
      throw new BadRequestException(
        'No documents are ready to sign. Generate certificates or approve appointments first.',
      );
    }

    await this.db.query(
      `INSERT INTO registrar_signing_history
        (tenant_id, document_label, action, status, signed_by, signed_by_name)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        tenantId,
        `Bulk queue — ${queue}`,
        `Signed ${signed.length} document(s)`,
        errors.length ? 'PARTIAL' : 'COMPLETED',
        actorUserId,
        actorName,
      ],
    );
    await this.db.query(
      `UPDATE registrar_dsc_credentials SET last_used_at=NOW(), updated_at=NOW()
       WHERE tenant_id=$1 AND owner_user_id=$2`,
      [tenantId, actorUserId],
    );
    await this.audit(tenantId, actorUserId, 'BULK_SIGN', undefined, {
      queue,
      signed_count: signed.length,
      error_count: errors.length,
    });
    return { signed, errors, signed_count: signed.length, error_count: errors.length };
  }

  // ── Enrollment queue & petitions ─────────────────────────────────────────

  async listEnrollmentQueue(
    tenantId: string,
    filters: { q?: string; status?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT l.lead_id, l.full_name, l.email, l.phone, l.stage, l.source,
             l.metadata, l.lead_score, l.created_at, l.updated_at,
             (l.stage = 'FEE_PAID'
               OR COALESCE((l.metadata->>'fee_paid')::boolean, false)
               OR COALESCE((l.metadata->>'fee_verified')::boolean, false)
             ) AS fee_verified,
             l.metadata->>'student_user_id' AS student_user_id,
             COALESCE(
               l.metadata->>'preferred_program',
               l.metadata->>'program_name',
               l.metadata->>'program'
             ) AS preferred_program,
             COALESCE(
               l.metadata->>'department_name',
               l.metadata->>'department'
             ) AS preferred_department,
             COALESCE(
               l.metadata->>'school_name',
               l.metadata->>'school'
             ) AS preferred_school,
             COALESCE(
               l.metadata->>'batch',
               to_char(NOW(), 'YYYY')
             ) AS preferred_batch
      FROM admissions_leads l
      WHERE l.tenant_id = $1
        AND l.deleted_at IS NULL
        AND (
          l.stage IN ('FEE_PAID', 'DOCUMENT_VERIFICATION', 'OFFERED', 'APPLICATION_SUBMITTED', 'ENROLLED')
          OR l.metadata->>'student_user_id' IS NOT NULL
        )`;
    if (filters.status?.trim()) {
      params.push(filters.status.trim().toUpperCase());
      sql += ` AND l.stage = $${params.length}`;
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(l.full_name) LIKE $${params.length}
        OR lower(COALESCE(l.email, '')) LIKE $${params.length}
        OR lower(COALESCE(l.phone, '')) LIKE $${params.length}
      )`;
    }
    sql += ` ORDER BY l.updated_at DESC NULLS LAST, l.created_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  async listEnrollmentRules(tenantId: string) {
    return this.db.query(
      `SELECT * FROM enrollment_id_rules
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY rule_name ASC`,
      [tenantId],
    );
  }

  async listEnrollmentHistory(tenantId: string, filters?: { q?: string }) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT r.*, u.name AS student_name, l.full_name AS lead_name,
             actor.name AS enrolled_by_name
      FROM registrar_enrollment_runs r
      LEFT JOIN users u ON u.user_id = r.student_user_id
      LEFT JOIN users actor ON actor.user_id = r.enrolled_by
      LEFT JOIN admissions_leads l ON l.lead_id = r.lead_id
      WHERE r.tenant_id = $1`;
    if (filters?.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(COALESCE(r.enrollment_no, '')) LIKE $${params.length}
        OR lower(COALESCE(u.name, '')) LIKE $${params.length}
        OR lower(COALESCE(l.full_name, '')) LIKE $${params.length}
      )`;
    }
    sql += ` ORDER BY r.created_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  private async assertEnrollmentNumberAvailable(
    tenantId: string,
    enrollmentNo: string,
    studentUserId: string,
  ) {
    const [dup] = await this.db.query(
      `SELECT user_id FROM student_profiles
       WHERE tenant_id = $1
         AND user_id <> $3
         AND (
           enrollment_no = $2
           OR enrollment_number = $2
           OR prn_number = $2
         )
       LIMIT 1`,
      [tenantId, enrollmentNo, studentUserId],
    );
    if (dup) {
      throw new BadRequestException(
        `Enrollment number ${enrollmentNo} is already assigned to another student.`,
      );
    }
  }

  private async resolveEnrollmentNumber(
    tenantId: string,
    dto: {
      rule_id?: string;
      department_name?: string;
      batch?: string;
    },
    lead: { metadata?: Record<string, unknown> | null },
  ): Promise<string> {
    const year = new Date().getFullYear();
    let ruleId = dto.rule_id?.trim();
    if (!ruleId) {
      const rules = await this.db.query(
        `SELECT rule_id FROM enrollment_id_rules
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY created_at ASC LIMIT 1`,
        [tenantId],
      );
      ruleId = rules[0]?.rule_id as string | undefined;
    }
    if (ruleId) {
      let deptCode = 'XX';
      const deptName =
        dto.department_name ??
        (typeof lead.metadata?.department === 'string'
          ? lead.metadata.department
          : undefined);
      if (deptName) {
        const depts = await this.db.query(
          `SELECT dept_name FROM departments
           WHERE deleted_at IS NULL AND lower(dept_name) = lower($1)
           LIMIT 1`,
          [deptName],
        );
        if (depts[0]?.dept_name) {
          deptCode = String(depts[0].dept_name)
            .replace(/[^A-Za-z0-9]/g, '')
            .slice(0, 6)
            .toUpperCase() || 'XX';
        }
      }
      const generated = await this.masterData.generateEnrollmentId(
        tenantId,
        ruleId,
        {
          YEAR: year,
          DEPT: deptCode,
          BATCH: dto.batch ?? String(lead.metadata?.batch ?? 'GEN'),
        },
      );
      return generated.enrollment_id;
    }
    return `ENR-${year}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }

  async enrollCandidate(
    tenantId: string,
    actorUserId: string,
    dto: {
      lead_id?: string;
      email?: string;
      full_name?: string;
      rule_id?: string;
      school_name?: string;
      department_name?: string;
      program_name?: string;
      degree_name?: string;
      batch?: string;
      semester?: number;
      section_code?: string;
      advisor_name?: string;
      remarks?: string;
      require_fee_paid?: boolean;
    },
  ) {
    let leadRow: Record<string, unknown> | null = null;

    if (dto.lead_id) {
      const rows = await this.db.query(
        `SELECT * FROM admissions_leads
         WHERE lead_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [dto.lead_id, tenantId],
      );
      if (!rows[0]) throw new NotFoundException('Lead not found');
      leadRow = rows[0];
    } else if (dto.email?.trim()) {
      const email = dto.email.trim().toLowerCase();
      const rows = await this.db.query(
        `SELECT * FROM admissions_leads
         WHERE tenant_id = $1 AND lower(email) = $2 AND deleted_at IS NULL
         ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, email],
      );
      if (rows[0]) {
        leadRow = rows[0];
      } else if (dto.full_name?.trim()) {
        const [created] = await this.db.query(
          `INSERT INTO admissions_leads (tenant_id, full_name, email, stage, metadata)
           VALUES ($1, $2, $3, 'FEE_PAID', '{}'::jsonb) RETURNING *`,
          [tenantId, dto.full_name.trim(), email],
        );
        leadRow = created;
      } else {
        throw new BadRequestException(
          'No lead found for email. Provide full_name to create a minimal lead.',
        );
      }
    } else {
      throw new BadRequestException('lead_id or email is required');
    }

    const lead = leadRow as unknown as Lead;
    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const stage = String(lead.stage ?? '').toUpperCase();

    if (dto.require_fee_paid !== false) {
      const feeOk =
        stage === 'FEE_PAID' ||
        metadata.fee_paid === true ||
        metadata.fee_verified === true;
      if (!feeOk) {
        throw new BadRequestException(
          'Fee payment not verified. Candidate must be FEE_PAID or have fee_verified metadata.',
        );
      }
    }

    const enrollmentNo = await this.resolveEnrollmentNumber(
      tenantId,
      dto,
      lead,
    ).catch(async () => {
      // Rule generation can fail for misconfigured templates — still enroll with a unique ID.
      const year = new Date().getFullYear();
      return `ENR-${year}-${randomBytes(3).toString('hex').toUpperCase()}`;
    });
    let studentUserId =
      typeof metadata.student_user_id === 'string'
        ? metadata.student_user_id
        : '';
    let tempPassword: string | undefined;
    const feeVerified =
      stage === 'FEE_PAID' ||
      metadata.fee_paid === true ||
      metadata.fee_verified === true;

    const placementDefaults = {
      school_name:
        dto.school_name?.trim() ||
        (typeof metadata.school === 'string' ? metadata.school : undefined) ||
        (typeof metadata.school_name === 'string'
          ? metadata.school_name
          : undefined),
      department_name:
        dto.department_name?.trim() ||
        (typeof metadata.department === 'string'
          ? metadata.department
          : undefined) ||
        (typeof metadata.department_name === 'string'
          ? metadata.department_name
          : undefined),
      program_name:
        dto.program_name?.trim() ||
        (typeof metadata.preferred_program === 'string'
          ? metadata.preferred_program
          : undefined) ||
        (typeof metadata.program === 'string' ? metadata.program : undefined) ||
        (typeof metadata.program_name === 'string'
          ? metadata.program_name
          : undefined),
      degree_name:
        dto.degree_name?.trim() ||
        (typeof metadata.degree === 'string' ? metadata.degree : undefined) ||
        (typeof metadata.degree_name === 'string'
          ? metadata.degree_name
          : undefined),
      batch:
        dto.batch?.trim() ||
        (typeof metadata.batch === 'string' ? metadata.batch : undefined) ||
        String(new Date().getFullYear()),
      semester: dto.semester,
      section_code: dto.section_code?.trim() || undefined,
      advisor_name: dto.advisor_name?.trim() || undefined,
    };

    try {
      if (dto.rule_id) {
        lead.metadata = { ...metadata, enrollment_rule_id: dto.rule_id };
        await this.db.query(
          `UPDATE admissions_leads SET metadata = $2::jsonb, updated_at = NOW() WHERE lead_id = $1`,
          [lead.lead_id, JSON.stringify(lead.metadata)],
        );
      }

      if (studentUserId) {
        await this.assertEnrollmentNumberAvailable(
          tenantId,
          enrollmentNo,
          studentUserId,
        );
        await this.db.query(
          `UPDATE student_profiles
           SET enrollment_no = $2,
               enrollment_number = $2,
               prn_number = $2,
               tenant_id = COALESCE(tenant_id, $3),
               updated_at = NOW()
           WHERE user_id = $1`,
          [studentUserId, enrollmentNo, tenantId],
        );
      } else {
        const provisioned = await this.admissions.provisionStudentFromLead(
          lead,
          tenantId,
        );
        studentUserId = provisioned.user_id;
        tempPassword = provisioned.temp_password;
        await this.assertEnrollmentNumberAvailable(
          tenantId,
          enrollmentNo,
          studentUserId,
        );
        await this.db.query(
          `UPDATE student_profiles
           SET enrollment_no = $2,
               enrollment_number = $2,
               prn_number = $2,
               tenant_id = COALESCE(tenant_id, $3),
               updated_at = NOW()
           WHERE user_id = $1`,
          [studentUserId, enrollmentNo, tenantId],
        );
      }

      await this.assignPlacement(tenantId, actorUserId, {
        student_user_id: studentUserId,
        school_name: placementDefaults.school_name,
        department_name: placementDefaults.department_name,
        program_name: placementDefaults.program_name,
        degree_name: placementDefaults.degree_name,
        batch: placementDefaults.batch,
        semester: placementDefaults.semester,
        section_code: placementDefaults.section_code,
        advisor_name: placementDefaults.advisor_name,
        remarks: dto.remarks,
        source: 'REGISTRAR_ENROLLMENT',
      });

      await this.changeLifecycle(
        tenantId,
        actorUserId,
        studentUserId,
        'ENROLLED',
        dto.remarks,
      );
      await this.changeLifecycle(
        tenantId,
        actorUserId,
        studentUserId,
        'ACTIVE',
        dto.remarks,
      );

      await this.db.query(
        `UPDATE admissions_leads
         SET stage = 'ENROLLED',
             metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb,
             updated_at = NOW()
         WHERE lead_id = $1`,
        [
          lead.lead_id,
          JSON.stringify({
            student_user_id: studentUserId,
            enrollment_no: enrollmentNo,
            enrolled_at: new Date().toISOString(),
            fee_verified: feeVerified,
          }),
        ],
      );

      await this.db.query(
        `INSERT INTO registrar_enrollment_runs
          (tenant_id, lead_id, student_user_id, enrollment_no, prn_number, fee_verified,
           program_name, department_name, school_name, batch, semester, section_code,
           degree_name, status, enrolled_by, remarks)
         VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,'COMPLETED',$13,$14)`,
        [
          tenantId,
          lead.lead_id,
          studentUserId,
          enrollmentNo,
          feeVerified,
          placementDefaults.program_name ?? null,
          placementDefaults.department_name ?? null,
          placementDefaults.school_name ?? null,
          placementDefaults.batch ?? null,
          placementDefaults.semester ?? null,
          placementDefaults.section_code ?? null,
          placementDefaults.degree_name ?? null,
          actorUserId,
          dto.remarks ?? null,
        ],
      );

      await this.notifyRegistrars(tenantId, {
        title: 'Student enrolled',
        message: `${lead.full_name ?? 'Student'} enrolled as ${enrollmentNo}.`,
        actionLink: '/admin/enrollment',
        severity: 'success',
        intent: 'status_update',
      });
      await this.audit(tenantId, actorUserId, 'ENROLL_STUDENT', studentUserId, {
        enrollment_no: enrollmentNo,
        lead_id: lead.lead_id,
        credentials_provisioned: Boolean(tempPassword),
      });

      return {
        student_user_id: studentUserId,
        enrollment_no: enrollmentNo,
        credentials_provisioned: Boolean(tempPassword),
      };
    } catch (err) {
      await this.db.query(
        `INSERT INTO registrar_enrollment_runs
          (tenant_id, lead_id, student_user_id, enrollment_no, fee_verified,
           program_name, department_name, school_name, batch, semester, section_code,
           degree_name, status, enrolled_by, remarks)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'FAILED',$13,$14)`,
        [
          tenantId,
          lead.lead_id,
          studentUserId || null,
          enrollmentNo,
          feeVerified,
          placementDefaults.program_name ?? null,
          placementDefaults.department_name ?? null,
          placementDefaults.school_name ?? null,
          placementDefaults.batch ?? null,
          placementDefaults.semester ?? null,
          placementDefaults.section_code ?? null,
          placementDefaults.degree_name ?? null,
          actorUserId,
          err instanceof Error ? err.message : 'Enrollment failed',
        ],
      );
      throw err;
    }
  }

  async listPetitions(
    tenantId: string,
    filters?: { status?: string; type?: string; q?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `SELECT * FROM registrar_petitions WHERE tenant_id = $1`;
    if (filters?.status) {
      params.push(filters.status.toUpperCase());
      sql += ` AND status = $${params.length}`;
    }
    if (filters?.type) {
      params.push(filters.type.toUpperCase());
      sql += ` AND petition_type = $${params.length}`;
    }
    if (filters?.q?.trim()) {
      params.push(`%${filters.q.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(student_name) LIKE $${params.length}
        OR lower(COALESCE(enrollment_no, '')) LIKE $${params.length}
      )`;
    }
    sql += ` ORDER BY updated_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  async createPetition(
    tenantId: string,
    actorUserId: string,
    dto: {
      petition_type: string;
      student_user_id?: string;
      student_name: string;
      enrollment_no?: string;
      current_value?: string;
      requested_value: string;
      reason?: string;
      documents_json?: unknown[];
    },
  ) {
    const [row] = await this.db.query(
      `INSERT INTO registrar_petitions
        (tenant_id, petition_type, student_user_id, student_name, enrollment_no,
         current_value, requested_value, reason, documents_json, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10) RETURNING *`,
      [
        tenantId,
        dto.petition_type.toUpperCase(),
        dto.student_user_id ?? null,
        dto.student_name,
        dto.enrollment_no ?? null,
        dto.current_value ?? null,
        dto.requested_value,
        dto.reason ?? null,
        JSON.stringify(dto.documents_json ?? []),
        actorUserId,
      ],
    );
    return row;
  }

  async decidePetition(
    tenantId: string,
    actorUserId: string,
    petitionId: string,
    status: 'APPROVED' | 'REJECTED' | 'ISSUED',
    remarks?: string,
  ) {
    const [current] = await this.db.query(
      `SELECT * FROM registrar_petitions WHERE tenant_id = $1 AND petition_id = $2`,
      [tenantId, petitionId],
    );
    if (!current) throw new NotFoundException('Petition not found');

    const normalized = status.toUpperCase() as 'APPROVED' | 'REJECTED' | 'ISSUED';
    if (!['APPROVED', 'REJECTED', 'ISSUED'].includes(normalized)) {
      throw new BadRequestException('Invalid petition decision status');
    }

    let finalStatus = normalized;
    if (
      normalized === 'ISSUED' ||
      (normalized === 'APPROVED' &&
        ['TRANSFER_CERTIFICATE', 'MIGRATION_CERTIFICATE'].includes(
          String(current.petition_type),
        ))
    ) {
      if (
        ['TRANSFER_CERTIFICATE', 'MIGRATION_CERTIFICATE'].includes(
          String(current.petition_type),
        ) &&
        normalized === 'APPROVED'
      ) {
        finalStatus = 'ISSUED';
      }
    }

    let certificateRequestId: string | null =
      (current.certificate_request_id as string | null) ?? null;

    if (finalStatus === 'APPROVED' || finalStatus === 'ISSUED') {
      if (current.petition_type === 'NAME_CORRECTION' && current.student_user_id) {
        await this.db.query(
          `UPDATE users SET name = $2, updated_at = NOW() WHERE user_id = $1 AND tenant_id = $3`,
          [current.student_user_id, current.requested_value, tenantId],
        );
      }
      if (current.petition_type === 'COURSE_CHANGE' && current.student_user_id) {
        await this.db.query(
          `UPDATE student_profiles
           SET program_name = $2,
               tenant_id = COALESCE(tenant_id, $3),
               updated_at = NOW()
           WHERE user_id = $1`,
          [current.student_user_id, current.requested_value, tenantId],
        );
      }
      if (
        ['TRANSFER_CERTIFICATE', 'MIGRATION_CERTIFICATE'].includes(
          String(current.petition_type),
        ) &&
        current.student_user_id &&
        !certificateRequestId
      ) {
        const certType =
          String(current.petition_type) === 'MIGRATION_CERTIFICATE'
            ? 'MIGRATION'
            : 'TRANSFER';
        const cert = await this.createCertificate(tenantId, {
          student_user_id: current.student_user_id,
          certificate_type: certType,
          remarks:
            remarks?.trim() ||
            `Auto-created from ${String(current.petition_type).replace(/_/g, ' ')} petition`,
        });
        certificateRequestId = cert.request_id as string;
        await this.transitionCertificate(
          tenantId,
          actorUserId,
          certificateRequestId,
          'GENERATE',
          remarks,
        );
      }
    }

    const [row] = await this.db.query(
      `UPDATE registrar_petitions
       SET status = $3, registrar_remarks = $4, decided_by = $5, decided_at = NOW(),
           certificate_request_id = COALESCE($6, certificate_request_id),
           updated_at = NOW()
       WHERE tenant_id = $1 AND petition_id = $2
       RETURNING *`,
      [
        tenantId,
        petitionId,
        finalStatus,
        remarks ?? null,
        actorUserId,
        certificateRequestId,
      ],
    );

    await this.notifyRegistrars(tenantId, {
      title: `Petition ${finalStatus.toLowerCase()}`,
      message: `${String(current.petition_type).replace(/_/g, ' ')} for ${current.student_name} → ${finalStatus}${certificateRequestId ? ' (certificate draft created)' : ''}.`,
      actionLink: certificateRequestId
        ? '/admin/certificates'
        : '/admin/academic-petitions',
      severity: finalStatus === 'REJECTED' ? 'warning' : 'success',
      intent: 'status_update',
    });

    return row;
  }

  private computeHealthScore(input: {
    pendingApprovals: number;
    verificationRequests: number;
    documentsPending: number;
    slaBreaches?: number;
  }): number {
    let score = 96;
    score -= Math.min(18, Math.sqrt(Math.max(0, input.pendingApprovals)) * 2.4);
    score -= Math.min(
      18,
      Math.sqrt(Math.max(0, input.verificationRequests)) * 2.8,
    );
    score -= Math.min(14, Math.sqrt(Math.max(0, input.documentsPending)) * 2.2);
    score -= Math.min(16, (input.slaBreaches ?? 0) * 3.5);
    return Math.max(55, Math.min(100, Math.round(score)));
  }

  async dashboardKpis(tenantId: string) {
    const countOrZero = async (sql: string, params: unknown[] = []) => {
      try {
        const [row] = await this.db.query(sql, params);
        return Number(row?.count ?? 0);
      } catch {
        return 0;
      }
    };

    const students = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id AND lower(r.role_name) = 'student'
         WHERE u.tenant_id = $1 AND u.is_active = true`,
        [tenantId],
      ),
    };
    const faculty = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count
         FROM users u
         JOIN user_roles ur ON ur.user_id = u.user_id
         JOIN roles r ON r.role_id = ur.role_id AND lower(r.role_name) IN ('faculty', 'hod', 'dean')
         WHERE u.tenant_id = $1 AND u.is_active = true`,
        [tenantId],
      ),
    };
    const departments = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM departments WHERE deleted_at IS NULL`,
      ),
    };
    const admissionsToday = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM admissions_leads
         WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE AND deleted_at IS NULL`,
        [tenantId],
      ),
    };
    const pendingRegs = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM exam_semester_registrations
         WHERE tenant_id = $1 AND status IN ('SUBMITTED','PENDING','SENT_BACK')`,
        [tenantId],
      ),
    };
    const pendingPetitions = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM registrar_petitions
         WHERE tenant_id = $1 AND status = 'PENDING'`,
        [tenantId],
      ),
    };
    const pendingGov = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM registrar_governance_tasks
         WHERE tenant_id = $1 AND status = 'PENDING'`,
        [tenantId],
      ),
    };
    const pendingCerts = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM registrar_certificate_requests
         WHERE tenant_id = $1 AND status IN ('DRAFT','GENERATED')`,
        [tenantId],
      ),
    };
    const verifications = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM users
         WHERE tenant_id = $1 AND onboarding_status = 'PENDING_ADMIN_APPROVAL'`,
        [tenantId],
      ),
    };
    const pendingEnrollments = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count
         FROM admissions_leads l
         WHERE l.tenant_id = $1
           AND l.deleted_at IS NULL
           AND (
             l.stage = 'FEE_PAID'
             OR COALESCE((l.metadata->>'fee_paid')::boolean, false)
             OR COALESCE((l.metadata->>'fee_verified')::boolean, false)
           )
           AND COALESCE(l.metadata->>'student_user_id', '') = ''
           AND upper(COALESCE(l.stage, '')) <> 'ENROLLED'`,
        [tenantId],
      ),
    };
    const pendingDegree = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count
         FROM degree_eligibility_audits a
         WHERE a.tenant_id = $1
           AND upper(COALESCE(a.final_status, '')) = 'ELIGIBLE'
           AND upper(COALESCE(a.registrar_decision, 'PENDING')) = 'PENDING'`,
        [tenantId],
      ),
    };
    const bulkDocs = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM student_bulk_upload_runs
         WHERE tenant_id = $1 AND (
           rows_failed > 0
           OR lower(status) LIKE '%pending%'
           OR lower(status) LIKE '%processing%'
           OR lower(status) LIKE '%review%'
         )`,
        [tenantId],
      ),
    };
    const petitionDocs = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM registrar_petitions
         WHERE tenant_id = $1 AND status = 'PENDING'
           AND jsonb_array_length(COALESCE(documents_json, '[]'::jsonb)) > 0`,
        [tenantId],
      ),
    };
    const slaBreaches = {
      count: await countOrZero(
        `SELECT COUNT(*)::int AS count FROM helpdesk_tickets
         WHERE tenant_id = $1 AND status != 'RESOLVED' AND sla_deadline < NOW()`,
        [tenantId],
      ),
    };

    const pendingRegistrations = pendingRegs?.count ?? 0;
    const pendingPetitionsCount = pendingPetitions?.count ?? 0;
    const pendingCertificates = pendingCerts?.count ?? 0;
    const pendingGovernance = pendingGov?.count ?? 0;
    const pendingDegreeEligibility = pendingDegree?.count ?? 0;
    const pendingEnrollmentCount = pendingEnrollments?.count ?? 0;
    const pendingApprovals =
      pendingRegistrations +
      pendingPetitionsCount +
      pendingGovernance +
      pendingCertificates +
      pendingDegreeEligibility;
    const verificationRequests = verifications?.count ?? 0;
    const documentsPending = (bulkDocs?.count ?? 0) + (petitionDocs?.count ?? 0);

    return {
      total_students: students?.count ?? 0,
      total_faculty: faculty?.count ?? 0,
      active_departments: departments?.count ?? 0,
      admissions_today: admissionsToday?.count ?? 0,
      pending_enrollments: pendingEnrollmentCount,
      pending_approvals: pendingApprovals,
      verification_requests: verificationRequests,
      documents_pending: documentsPending,
      pending_registrations: pendingRegistrations,
      pending_petitions: pendingPetitionsCount,
      pending_certificates: pendingCertificates,
      pending_governance: pendingGovernance,
      pending_degree_eligibility: pendingDegreeEligibility,
      health_score: this.computeHealthScore({
        pendingApprovals,
        verificationRequests,
        documentsPending,
        slaBreaches: slaBreaches?.count ?? 0,
      }),
    };
  }

  async listDegreeEligibility(tenantId: string, q?: string) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT a.*, u.name AS student_name, u.official_email,
             sp.enrollment_no, sp.prn_number, sp.program_name, sp.batch,
             d.dept_name AS department_name,
             decider.name AS registrar_decided_by_name
      FROM degree_eligibility_audits a
      JOIN users u ON u.user_id = a.student_user_id
      LEFT JOIN student_profiles sp ON sp.user_id = a.student_user_id
      LEFT JOIN departments d ON d.dept_id = u.dept_id
      LEFT JOIN users decider ON decider.user_id = a.registrar_decided_by
      WHERE a.tenant_id = $1`;
    if (q?.trim()) {
      params.push(`%${q.trim().toLowerCase()}%`);
      sql += ` AND (
        lower(u.name) LIKE $${params.length}
        OR lower(COALESCE(sp.enrollment_no, '')) LIKE $${params.length}
        OR lower(COALESCE(sp.prn_number, '')) LIKE $${params.length}
      )`;
    }
    sql += ` ORDER BY a.checked_at DESC LIMIT 200`;
    return this.db.query(sql, params);
  }

  private async assertDegreeIssuanceAllowed(
    tenantId: string,
    studentUserId: string,
  ) {
    const [audit] = await this.db.query(
      `SELECT audit_id, final_status, registrar_decision
       FROM degree_eligibility_audits
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY checked_at DESC
       LIMIT 1`,
      [tenantId, studentUserId],
    );
    if (!audit) {
      throw new BadRequestException(
        'Degree issuance blocked: no Exam Cell eligibility audit found for this student.',
      );
    }
    if (String(audit.final_status).toUpperCase() !== 'ELIGIBLE') {
      throw new BadRequestException(
        'Degree issuance blocked: Exam Cell final status must be ELIGIBLE.',
      );
    }
    if (String(audit.registrar_decision ?? 'PENDING').toUpperCase() !== 'APPROVED') {
      throw new BadRequestException(
        'Degree issuance blocked: Registrar must approve degree eligibility before issue.',
      );
    }
  }

  async decideDegreeEligibility(
    tenantId: string,
    actorUserId: string,
    auditId: string,
    decision: 'APPROVED' | 'REJECTED',
    remarks?: string,
  ) {
    const normalized = String(decision ?? '').toUpperCase() as 'APPROVED' | 'REJECTED';
    if (!['APPROVED', 'REJECTED'].includes(normalized)) {
      throw new BadRequestException('Decision must be APPROVED or REJECTED');
    }
    const [audit] = await this.db.query(
      `SELECT * FROM degree_eligibility_audits WHERE tenant_id = $1 AND audit_id = $2`,
      [tenantId, auditId],
    );
    if (!audit) throw new NotFoundException('Degree eligibility audit not found');

    if (
      normalized === 'APPROVED' &&
      String(audit.final_status).toUpperCase() !== 'ELIGIBLE'
    ) {
      throw new BadRequestException(
        'Only audits with Exam Cell status ELIGIBLE can be approved for degree issuance.',
      );
    }
    if (normalized === 'APPROVED' && !remarks?.trim()) {
      throw new BadRequestException(
        'Approval remarks are required for Registrar degree approval.',
      );
    }

    const [row] = await this.db.query(
      `UPDATE degree_eligibility_audits
       SET registrar_decision = $3,
           registrar_remarks = $4,
           registrar_decided_by = $5,
           registrar_decided_at = NOW()
       WHERE tenant_id = $1 AND audit_id = $2
       RETURNING *`,
      [tenantId, auditId, normalized, remarks?.trim() || null, actorUserId],
    );

    await this.db.query(
      `INSERT INTO registrar_degree_approval_history
        (tenant_id, audit_id, student_user_id, decision, remarks, decided_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [
        tenantId,
        auditId,
        audit.student_user_id,
        normalized,
        remarks?.trim() || null,
        actorUserId,
      ],
    );

    await this.notifyRegistrars(tenantId, {
      title:
        normalized === 'APPROVED'
          ? 'Degree eligibility approved'
          : 'Degree eligibility rejected',
      message: `Registrar ${normalized.toLowerCase()} degree eligibility for student ${String(audit.student_user_id).slice(0, 8)}.`,
      actionLink: '/admin/degree-eligibility',
      severity: normalized === 'APPROVED' ? 'success' : 'warning',
      intent: 'action_required',
    });

    return row;
  }

  async degreeApprovalHistory(tenantId: string, auditId: string) {
    return this.db.query(
      `SELECT h.*, u.name AS decided_by_name
       FROM registrar_degree_approval_history h
       LEFT JOIN users u ON u.user_id = h.decided_by
       WHERE h.tenant_id = $1 AND h.audit_id = $2
       ORDER BY h.created_at DESC`,
      [tenantId, auditId],
    );
  }

  async getCertificatePdfBuffer(
    tenantId: string,
    requestId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const [cert] = await this.db.query(
      `SELECT c.*, u.name AS student_name, sp.enrollment_no, sp.prn_number,
              sp.program_name, sp.batch, sp.degree_name, d.dept_name AS department_name
       FROM registrar_certificate_requests c
       JOIN users u ON u.user_id = c.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = c.student_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE c.tenant_id = $1 AND c.request_id = $2`,
      [tenantId, requestId],
    );
    if (!cert) throw new NotFoundException('Certificate request not found');

    const issuedDate = cert.issued_at
      ? new Date(cert.issued_at).toLocaleDateString('en-IN')
      : new Date().toLocaleDateString('en-IN');
    const enrollmentNo = String(cert.enrollment_no ?? cert.prn_number ?? '—');
    const certType = String(cert.certificate_type).replace(/_/g, ' ');
    const studentName = String(cert.student_name ?? 'Student');
    const verification = String(cert.verification_code ?? '').trim()
      || createHash('sha256')
          .update(`${requestId}:${cert.student_user_id}:${cert.status}`)
          .digest('hex')
          .slice(0, 16)
          .toUpperCase();

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 portrait
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const bold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
    const navy = rgb(0.043, 0.141, 0.278);
    const gold = rgb(0.84, 0.66, 0.27);
    const muted = rgb(0.35, 0.35, 0.4);

    page.drawRectangle({
      x: 36,
      y: 36,
      width: width - 72,
      height: height - 72,
      borderColor: gold,
      borderWidth: 2.5,
    });
    page.drawRectangle({
      x: 44,
      y: 44,
      width: width - 88,
      height: height - 88,
      borderColor: navy,
      borderWidth: 0.75,
    });

    const title = `CERTIFICATE OF ${certType.toUpperCase()}`;
    page.drawText(title, {
      x: width / 2 - bold.widthOfTextAtSize(title, 16) / 2,
      y: height - 110,
      size: 16,
      font: bold,
      color: navy,
    });
    page.drawText('Office of the Registrar', {
      x: width / 2 - font.widthOfTextAtSize('Office of the Registrar', 12) / 2,
      y: height - 132,
      size: 12,
      font,
      color: muted,
    });

    page.drawText('This is to certify that', {
      x: width / 2 - font.widthOfTextAtSize('This is to certify that', 12) / 2,
      y: height - 200,
      size: 12,
      font,
      color: navy,
    });
    page.drawText(studentName, {
      x: width / 2 - bold.widthOfTextAtSize(studentName, 20) / 2,
      y: height - 240,
      size: 20,
      font: bold,
      color: navy,
    });

    const lines = [
      `Enrollment / PRN: ${enrollmentNo}`,
      cert.program_name ? `Program: ${cert.program_name}` : null,
      cert.department_name ? `Department: ${cert.department_name}` : null,
      cert.batch ? `Batch: ${cert.batch}` : null,
      cert.degree_name ? `Degree: ${cert.degree_name}` : null,
      `Status: ${cert.status}`,
      `Date of issue / generation: ${issuedDate}`,
    ].filter(Boolean) as string[];

    let y = height - 290;
    for (const line of lines) {
      page.drawText(line, { x: 90, y, size: 11, font, color: navy });
      y -= 22;
    }

    if (cert.remarks) {
      y -= 10;
      page.drawText(`Remarks: ${String(cert.remarks).slice(0, 180)}`, {
        x: 90,
        y,
        size: 10,
        font,
        color: muted,
      });
      y -= 24;
    }

    page.drawText(`Verification code: ${verification}`, {
      x: 90,
      y: 160,
      size: 9,
      font,
      color: muted,
    });
    page.drawText(`Verify at /api/verify/registrar-certificate/${verification}`, {
      x: 90,
      y: 146,
      size: 8,
      font,
      color: muted,
    });
    page.drawText(`Request ID: ${requestId}`, {
      x: 90,
      y: 132,
      size: 9,
      font,
      color: muted,
    });

    const signedLabel = cert.signed_at
      ? `Signed: ${new Date(cert.signed_at).toLocaleString('en-IN')}`
      : 'Signature: pending';
    page.drawText(signedLabel, {
      x: width - 250,
      y: 120,
      size: 10,
      font,
      color: navy,
    });

    // Embed Registrar signature image when available (attestation overlay).
    if (cert.signed_by) {
      try {
        const [dsc] = await this.db.query(
          `SELECT signature_image_url FROM registrar_dsc_credentials
           WHERE tenant_id = $1 AND owner_user_id = $2`,
          [tenantId, cert.signed_by],
        );
        const dataUrl = String(dsc?.signature_image_url ?? '');
        const match = dataUrl.match(
          /^data:image\/(png|jpe?g);base64,(.+)$/i,
        );
        if (match) {
          const imgBytes = Buffer.from(match[2], 'base64');
          const embedded =
            match[1].toLowerCase() === 'png'
              ? await pdfDoc.embedPng(imgBytes)
              : await pdfDoc.embedJpg(imgBytes);
          const imgW = 130;
          const imgH = (embedded.height / embedded.width) * imgW;
          page.drawImage(embedded, {
            x: width - 250,
            y: 95,
            width: imgW,
            height: Math.min(imgH, 48),
          });
        } else {
          page.drawText('_________________________', {
            x: width - 250,
            y: 95,
            size: 10,
            font,
            color: navy,
          });
        }
      } catch {
        page.drawText('_________________________', {
          x: width - 250,
          y: 95,
          size: 10,
          font,
          color: navy,
        });
      }
    } else {
      page.drawText('_________________________', {
        x: width - 250,
        y: 95,
        size: 10,
        font,
        color: navy,
      });
    }
    page.drawText('Registrar', {
      x: width - 250,
      y: 78,
      size: 11,
      font: bold,
      color: navy,
    });

    const bytes = await pdfDoc.save();
    const safeType = String(cert.certificate_type).toLowerCase().replace(/[^a-z0-9]+/g, '-');
    return {
      buffer: Buffer.from(bytes),
      filename: `${safeType}-${enrollmentNo.replace(/[^\w-]+/g, '_') || requestId.slice(0, 8)}.pdf`,
    };
  }

  async getWorkflowStatus(tenantId: string, studentUserId: string) {
    const [user] = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email, u.onboarding_status
       FROM users u WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, studentUserId],
    );
    if (!user) throw new NotFoundException('Student not found');

    const [lead] = await this.db
      .query(
        `SELECT stage, metadata FROM admissions_leads
         WHERE tenant_id = $1
           AND (
             metadata->>'student_user_id' = $2
             OR metadata->>'user_id' = $2
           )
         ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST
         LIMIT 1`,
        [tenantId, studentUserId],
      )
      .catch(() => []);
    const [profile] = await this.db
      .query(
        `SELECT lifecycle_status, status, program_name, section_code, enrollment_no
         FROM student_profiles WHERE user_id = $1`,
        [studentUserId],
      )
      .catch(() => []);
    const [semReg] = await this.db
      .query(
        `SELECT status FROM exam_semester_registrations
         WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'APPROVED'
         ORDER BY COALESCE(reviewed_at, created_at) DESC NULLS LAST
         LIMIT 1`,
        [tenantId, studentUserId],
      )
      .catch(() => []);
    const [cert] = await this.db
      .query(
        `SELECT status FROM registrar_certificate_requests
         WHERE tenant_id = $1 AND student_user_id = $2 AND status = 'ISSUED'
         LIMIT 1`,
        [tenantId, studentUserId],
      )
      .catch(() => []);
    const [degree] = await this.db
      .query(
        `SELECT final_status, registrar_decision FROM degree_eligibility_audits
         WHERE tenant_id = $1 AND student_user_id = $2
         ORDER BY checked_at DESC LIMIT 1`,
        [tenantId, studentUserId],
      )
      .catch(() => []);

    const leadStage = String(lead?.stage ?? '').toUpperCase();
    const lifecycle = String(
      profile?.lifecycle_status ?? profile?.status ?? '',
    ).toUpperCase();
    const feePaid =
      leadStage === 'FEE_PAID' ||
      lead?.metadata?.fee_paid === true ||
      lead?.metadata?.fee_verified === true ||
      ['ENROLLED', 'ACTIVE'].includes(leadStage);

    return {
      student_user_id: studentUserId,
      steps: {
        admission: {
          completed: !!lead || !!profile?.enrollment_no,
          label: 'Admission',
          detail: leadStage || 'Not linked',
        },
        fee: {
          completed: feePaid,
          label: 'Fee verification',
          detail: feePaid ? 'Verified' : 'Pending',
        },
        enrollment: {
          completed: ['ENROLLED', 'ACTIVE', 'GRADUATED', 'ALUMNI'].includes(
            lifecycle,
          ) || leadStage === 'ENROLLED',
          label: 'Enrollment',
          detail: profile?.enrollment_no ?? 'Pending',
        },
        placement: {
          completed: !!(profile?.program_name && profile?.section_code),
          label: 'Academic placement',
          detail: profile?.program_name ?? 'Not assigned',
        },
        semester_reg: {
          completed: !!semReg,
          label: 'Semester registration',
          detail: semReg ? 'Approved' : 'Not approved',
        },
        certificates: {
          completed: !!cert,
          label: 'Certificates',
          detail: cert ? 'Issued' : 'None issued',
        },
        graduation: {
          completed:
            lifecycle === 'GRADUATED' ||
            lifecycle === 'ALUMNI' ||
            (degree?.final_status === 'ELIGIBLE' &&
              String(degree?.registrar_decision ?? '').toUpperCase() ===
                'APPROVED'),
          label: 'Graduation',
          detail:
            degree?.registrar_decision && degree?.final_status
              ? `${degree.final_status} · Registrar ${degree.registrar_decision}`
              : (degree?.final_status ?? lifecycle ?? 'In progress'),
        },
      },
    };
  }

  // ── Student records (Registrar 360) ──────────────────────────────────────

  async getStudentRecord(tenantId: string, studentUserId: string) {
    const [row] = await this.db.query(
      `SELECT u.user_id, u.name, u.official_email, u.phone, u.is_active, u.dept_id,
              d.dept_name AS department_name,
              sp.enrollment_no, sp.enrollment_number, sp.prn_number, sp.admission_number,
              sp.program_name, sp.degree_name, sp.school_name, sp.batch,
              sp.current_semester, sp.section_code, sp.advisor_name,
              sp.lifecycle_status, sp.status, sp.tenant_id AS profile_tenant_id
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1 AND u.user_id = $2
       LIMIT 1`,
      [tenantId, studentUserId],
    );
    if (!row) throw new NotFoundException('Student not found');

    const [lifecycle, placement, documents] = await Promise.all([
      this.lifecycleHistory(tenantId, studentUserId).catch(() => []),
      this.placementHistory(tenantId, studentUserId).catch(() => []),
      this.listStudentDocuments(tenantId, studentUserId).catch(() => []),
    ]);

    return {
      profile: row,
      lifecycle_history: lifecycle,
      placement_history: placement,
      documents,
    };
  }

  async updateStudentRecord(
    tenantId: string,
    actorUserId: string,
    studentUserId: string,
    dto: {
      name?: string;
      phone?: string;
      school_name?: string;
      department_name?: string;
      program_name?: string;
      degree_name?: string;
      batch?: string;
      semester?: number;
      section_code?: string;
      advisor_name?: string;
      lifecycle_status?: string;
      remarks?: string;
    },
  ) {
    const [user] = await this.db.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, studentUserId],
    );
    if (!user) throw new NotFoundException('Student not found');

    if (dto.name?.trim()) {
      await this.db.query(
        `UPDATE users SET name = $2, updated_at = NOW() WHERE user_id = $1 AND tenant_id = $3`,
        [studentUserId, dto.name.trim(), tenantId],
      );
    }
    if (dto.phone !== undefined) {
      await this.db.query(
        `UPDATE users SET phone = $2, updated_at = NOW() WHERE user_id = $1 AND tenant_id = $3`,
        [studentUserId, dto.phone?.trim() || null, tenantId],
      );
    }

    await this.assignPlacement(tenantId, actorUserId, {
      student_user_id: studentUserId,
      school_name: dto.school_name,
      department_name: dto.department_name,
      program_name: dto.program_name,
      degree_name: dto.degree_name,
      batch: dto.batch,
      semester: dto.semester,
      section_code: dto.section_code,
      advisor_name: dto.advisor_name,
      remarks: dto.remarks,
      source: 'REGISTRAR_STUDENT_RECORD',
    });

    if (dto.lifecycle_status?.trim()) {
      await this.changeLifecycle(
        tenantId,
        actorUserId,
        studentUserId,
        dto.lifecycle_status,
        dto.remarks,
      );
    }

    return this.getStudentRecord(tenantId, studentUserId);
  }

  async listStudentDocuments(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT document_id, category, title, file_url, source_transaction_id, created_at
       FROM student_documents
       WHERE tenant_id = $1 AND student_user_id = $2
       ORDER BY created_at DESC`,
      [tenantId, studentUserId],
    );
  }

  async addStudentDocument(
    tenantId: string,
    studentUserId: string,
    dto: { category?: string; title: string; file_url: string },
  ) {
    if (!dto.title?.trim() || !dto.file_url?.trim()) {
      throw new BadRequestException('title and file_url are required');
    }
    const [user] = await this.db.query(
      `SELECT user_id FROM users WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, studentUserId],
    );
    if (!user) throw new NotFoundException('Student not found');

    const [row] = await this.db.query(
      `INSERT INTO student_documents
        (tenant_id, student_user_id, category, title, file_url)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING document_id, category, title, file_url, created_at`,
      [
        tenantId,
        studentUserId,
        dto.category?.trim() || 'REGISTRAR',
        dto.title.trim(),
        dto.file_url.trim(),
      ],
    );
    return row;
  }
}
