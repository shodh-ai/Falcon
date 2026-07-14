import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { HrFieldEncryptionService } from '../../common/crypto/hr-field-encryption.service';
import { getInitialOnboardingStatusForRole } from '../student-onboarding/onboarding-portal.util';
import { HrEntityContextService } from './hr-entity-context.service';
import { HrChecklistService } from './hr-checklist.service';
import { HrOnboardingWorkflowService } from './hr-onboarding-workflow.service';
import {
  DEFAULT_PAGE_LIMIT,
  type PaginatedResponse,
  parsePageParams,
} from '../../common/utils/pagination';
import { CacheService } from '../../core/redis/cache.service';

const API_POINTS: Record<string, number> = {
  JOURNAL: 10,
  CONFERENCE: 8,
  PATENT: 15,
  BOOK: 12,
  BOOK_CHAPTER: 5,
  OTHER: 3,
};

@Injectable()
export class HrAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly crypto: HrFieldEncryptionService,
    private readonly config: ConfigService,
    private readonly entityCtx: HrEntityContextService,
    private readonly checklists: HrChecklistService,
    private readonly onboardingWorkflow: HrOnboardingWorkflowService,
    private readonly cache: CacheService,
  ) {}

  async listRoles(_tenantId: string) {
    return this.dataSource.query(
      `SELECT role_id, role_name FROM roles
       WHERE role_name NOT IN ('Student', 'Applicant', 'Parent')
       ORDER BY role_name`,
    );
  }

  async listDepartments(_tenantId: string) {
    return this.dataSource.query(
      `SELECT dept_id, dept_name FROM departments ORDER BY dept_name`,
    );
  }

  async listDirectory(
    tenantId: string,
    entityId: number,
    viewerUserId?: string,
    viewerRoles: string[] = [],
    options?: { limit?: number; offset?: number; q?: string },
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { limit, offset } = parsePageParams(
      options?.limit,
      options?.offset,
      DEFAULT_PAGE_LIMIT,
    );
    const roleKey = [...viewerRoles].sort().join(',');
    const cacheKey = `hr_dir:${tenantId}:${entityId}:${viewerUserId ?? 'all'}:${roleKey}:${limit}:${offset}:${options?.q?.trim().toLowerCase() ?? ''}`;
    return this.cache.getOrSet(
      cacheKey,
      () =>
        this.fetchDirectoryPage(
          tenantId,
          entityId,
          { limit, offset, q: options?.q },
          viewerUserId,
          viewerRoles,
        ),
      900,
    );
  }

  private async fetchDirectoryPage(
    tenantId: string,
    entityId: number,
    options: { limit: number; offset: number; q?: string },
    viewerUserId?: string,
    viewerRoles: string[] = [],
  ): Promise<PaginatedResponse<Record<string, unknown>>> {
    const { limit, offset } = options;
    const params: unknown[] = [tenantId, entityId];
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);
    let deptClause = '';
    if (viewerUserId) {
      const scope = await this.dataSource.query<
        Array<{ department_scope: number[] | null }>
      >(
        `SELECT department_scope FROM hr_access_controls
         WHERE tenant_id = $1 AND user_id = $2 AND department_scope IS NOT NULL
         LIMIT 1`,
        [tenantId, viewerUserId],
      );
      const isMaster = viewerRoles.some((r) =>
        ['HRAdmin', 'SuperAdmin', 'HR', 'President'].includes(r),
      );
      const deptIds = scope[0]?.department_scope;
      if (!isMaster && deptIds?.length) {
        params.push(deptIds);
        deptClause = ` AND u.dept_id = ANY($${params.length})`;
      }
    }
    let searchClause = '';
    if (options?.q?.trim()) {
      params.push(`%${options.q.trim().toLowerCase()}%`);
      const idx = params.length;
      searchClause = ` AND (
        LOWER(u.name) LIKE $${idx}
        OR LOWER(u.official_email) LIKE $${idx}
        OR LOWER(p.employee_id) LIKE $${idx}
        OR LOWER(d.dept_name) LIKE $${idx}
        OR LOWER(p.designation) LIKE $${idx}
      )`;
    }

    const baseFrom = `
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN org_entities oe ON oe.entity_id = p.entity_id
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       WHERE u.tenant_id = $1
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}${deptClause}${searchClause}`;

    const countRows = await this.dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total ${baseFrom}`,
      params,
    );
    const total = Number(countRows[0]?.total ?? 0);

    params.push(limit, offset);
    const data = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
              r.role_name AS role, d.dept_name AS department,
              p.employee_id, p.designation, p.joining_date, p.entity_id,
              oe.entity_name,
              ro.name AS reporting_officer_name
       ${baseFrom}
       ORDER BY u.name ASC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { data, total, limit, offset };
  }

  async getEmployee360(
    tenantId: string,
    userId: string,
    includeSensitive = false,
  ) {
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active, u.reporting_officer_id,
              u.role_id, u.dept_id, u.salary_base,
              r.role_name AS role, d.dept_name AS department,
              p.profile_id, p.employee_id, p.designation, p.joining_date, p.org_unit_id,
              p.pan_encrypted, p.aadhaar_encrypted, p.bank_account_encrypted, p.ifsc_code, p.pf_uan,
              ro.name AS reporting_officer_name, ou.unit_name AS org_unit_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN hr_org_units ou ON ou.unit_id = p.org_unit_id
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Employee not found');
    const row = rows[0];
    const pan = includeSensitive
      ? this.crypto.decrypt(row.pan_encrypted)
      : null;
    const aadhaar = includeSensitive
      ? this.crypto.decrypt(row.aadhaar_encrypted)
      : null;
    const bank = includeSensitive
      ? this.crypto.decrypt(row.bank_account_encrypted)
      : null;

    const documents = await this.dataSource.query(
      `SELECT d.document_id, d.document_type, d.file_name, d.verification_status, d.uploaded_at,
              uploader.name AS uploaded_by_name
       FROM hr_employee_documents d
       LEFT JOIN users uploader ON uploader.user_id = d.uploaded_by
       WHERE d.tenant_id = $1 AND d.user_id = $2
       ORDER BY d.uploaded_at DESC`,
      [tenantId, userId],
    );

    return {
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      role_id: row.role_id != null ? Number(row.role_id) : null,
      department: row.department,
      dept_id: row.dept_id != null ? Number(row.dept_id) : null,
      salary_base: row.salary_base ?? null,
      is_active: row.is_active,
      employee_id: row.employee_id,
      designation: row.designation ?? row.role,
      joining_date: row.joining_date,
      reporting_officer_id: row.reporting_officer_id ?? null,
      reporting_officer_name: row.reporting_officer_name,
      org_unit_id: row.org_unit_id,
      org_unit_name: row.org_unit_name,
      ifsc_code: row.ifsc_code,
      pf_uan: row.pf_uan,
      kyc: {
        pan_masked: this.crypto.maskPan(this.crypto.decrypt(row.pan_encrypted)),
        aadhaar_masked: this.crypto.maskAadhaar(
          this.crypto.decrypt(row.aadhaar_encrypted),
        ),
        bank_masked: this.crypto.maskBank(
          this.crypto.decrypt(row.bank_account_encrypted),
        ),
        pan: includeSensitive ? pan : undefined,
        aadhaar: includeSensitive ? aadhaar : undefined,
        bank_account: includeSensitive ? bank : undefined,
      },
      documents,
    };
  }

  async revealKyc(
    tenantId: string,
    targetUserId: string,
    revealedByUserId: string,
    fieldGroup: 'PAN' | 'AADHAAR' | 'BANK' | 'ALL',
    ipAddress?: string,
  ) {
    await this.dataSource.query(
      `INSERT INTO hr_kyc_reveal_audit (tenant_id, target_user_id, revealed_by_user_id, field_group, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, targetUserId, revealedByUserId, fieldGroup, ipAddress ?? null],
    );
    return this.getEmployee360(tenantId, targetUserId, true);
  }

  private async resolveEntityId(
    tenantId: string,
    preferred?: number | null,
  ): Promise<number> {
    if (preferred != null) return preferred;
    const rows = await this.dataSource.query<Array<{ entity_id: number }>>(
      `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND is_active = true ORDER BY entity_id LIMIT 1`,
      [tenantId],
    );
    const entityId = rows[0]?.entity_id;
    if (!entityId) {
      throw new BadRequestException(
        'No organization entity configured for this tenant',
      );
    }
    return entityId;
  }

  async upsertEmployeeProfile(
    tenantId: string,
    userId: string,
    dto: {
      employee_id?: string;
      designation?: string;
      joining_date?: string;
      pan_number?: string;
      aadhaar_number?: string;
      bank_account_no?: string;
      ifsc_code?: string;
      pf_uan?: string;
      org_unit_id?: string;
      entity_id?: number;
    },
  ) {
    const entityId = await this.resolveEntityId(tenantId, dto.entity_id);
    const pan =
      dto.pan_number !== undefined
        ? this.crypto.encrypt(dto.pan_number)
        : undefined;
    const aadhaar =
      dto.aadhaar_number !== undefined
        ? this.crypto.encrypt(dto.aadhaar_number)
        : undefined;
    const bank =
      dto.bank_account_no !== undefined
        ? this.crypto.encrypt(dto.bank_account_no)
        : undefined;
    const employeeId =
      dto.employee_id ??
      `SGVU-${userId.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_profiles (
         tenant_id, user_id, employee_id, designation, joining_date,
         pan_encrypted, aadhaar_encrypted, bank_account_encrypted, ifsc_code, pf_uan,
         org_unit_id, entity_id, updated_at
       ) VALUES ($1,$2::uuid,$3,$4,COALESCE($5::date, CURRENT_DATE),
         $6,$7,$8,$9,$10,$11,$12, NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         employee_id = COALESCE(EXCLUDED.employee_id, hr_employee_profiles.employee_id),
         designation = COALESCE(EXCLUDED.designation, hr_employee_profiles.designation),
         joining_date = COALESCE(EXCLUDED.joining_date, hr_employee_profiles.joining_date),
         org_unit_id = COALESCE(EXCLUDED.org_unit_id, hr_employee_profiles.org_unit_id),
         entity_id = COALESCE(EXCLUDED.entity_id, hr_employee_profiles.entity_id),
         pan_encrypted = COALESCE(EXCLUDED.pan_encrypted, hr_employee_profiles.pan_encrypted),
         aadhaar_encrypted = COALESCE(EXCLUDED.aadhaar_encrypted, hr_employee_profiles.aadhaar_encrypted),
         bank_account_encrypted = COALESCE(EXCLUDED.bank_account_encrypted, hr_employee_profiles.bank_account_encrypted),
         ifsc_code = COALESCE(EXCLUDED.ifsc_code, hr_employee_profiles.ifsc_code),
         pf_uan = COALESCE(EXCLUDED.pf_uan, hr_employee_profiles.pf_uan),
         updated_at = NOW()
       RETURNING profile_id`,
      [
        tenantId,
        userId,
        employeeId,
        dto.designation ?? null,
        dto.joining_date ?? null,
        pan ?? null,
        aadhaar ?? null,
        bank ?? null,
        dto.ifsc_code ?? null,
        dto.pf_uan ?? null,
        dto.org_unit_id ?? null,
        entityId,
      ],
    );
    await this.dataSource.query(
      `UPDATE users SET entity_id = $2 WHERE user_id = $1 AND (entity_id IS NULL OR entity_id IS DISTINCT FROM $2)`,
      [userId, entityId],
    );
    await this.cache.delByPrefix(`hr_dir:${tenantId}:`);
    return rows[0];
  }

  async invalidateDirectoryCache(tenantId: string) {
    await this.cache.delByPrefix(`hr_dir:${tenantId}:`);
  }

  async listLeaveBalancesGrid(
    tenantId: string,
    year: number,
    entityId: number,
  ) {
    return this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id,
              MAX(CASE WHEN b.leave_type = 'CL' THEN b.entitled - b.used END) AS cl_balance,
              MAX(CASE WHEN b.leave_type = 'SL' THEN b.entitled - b.used END) AS sl_balance,
              MAX(CASE WHEN b.leave_type = 'EL' THEN b.entitled - b.used END) AS el_balance,
              MAX(CASE WHEN b.leave_type = 'MATERNITY' THEN b.entitled - b.used END) AS maternity_balance
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN hr_leave_balances b ON b.user_id = u.user_id AND b.year = $3
       WHERE u.tenant_id = $1 AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
         ${this.entityCtx.entityFilterSql('p', 2)}
       GROUP BY u.user_id, u.name, p.employee_id
       ORDER BY u.name`,
      [tenantId, entityId, year],
    );
  }

  async adjustLeaveBalance(
    tenantId: string,
    userId: string,
    dto: { leave_type: string; year: number; delta: number; reason?: string },
  ) {
    const existing = await this.dataSource.query(
      `SELECT balance_id, entitled, used FROM hr_leave_balances
       WHERE user_id = $1 AND leave_type = $2 AND year = $3`,
      [userId, dto.leave_type, dto.year],
    );
    if (existing[0]) {
      const entitled = Number(existing[0].entitled) + dto.delta;
      await this.dataSource.query(
        `UPDATE hr_leave_balances SET entitled = $2, updated_at = NOW() WHERE balance_id = $1`,
        [existing[0].balance_id, entitled],
      );
    } else {
      await this.dataSource.query(
        `INSERT INTO hr_leave_balances (user_id, leave_type, year, entitled, used)
         VALUES ($1, $2, $3, GREATEST($4, 0), 0)`,
        [userId, dto.leave_type, dto.year, dto.delta],
      );
    }
    return {
      user_id: userId,
      leave_type: dto.leave_type,
      adjustment: dto.delta,
    };
  }

  async ingestBiometricPunches(
    tenantId: string,
    punches: {
      employee_id: string;
      punch_time: string;
      device_id?: string;
      punch_type: 'IN' | 'OUT';
      entity_id?: number;
    }[],
    entityId?: number,
  ) {
    for (const punch of punches) {
      await this.dataSource.query(
        `INSERT INTO hr_biometric_logs (tenant_id, entity_id, employee_id, punch_time, device_id, punch_type)
         VALUES ($1, $2, $3, $4::timestamptz, $5, $6)`,
        [
          tenantId,
          punch.entity_id ?? entityId ?? null,
          punch.employee_id,
          punch.punch_time,
          punch.device_id ?? null,
          punch.punch_type,
        ],
      );
    }
    return this.processBiometricLogs(tenantId);
  }

  async processBiometricLogs(tenantId: string) {
    const logs = await this.dataSource.query(
      `SELECT log_id, employee_id, punch_time, punch_type
       FROM hr_biometric_logs
       WHERE tenant_id = $1 AND processed = FALSE
       ORDER BY punch_time ASC
       LIMIT 500`,
      [tenantId],
    );

    let processed = 0;
    for (const log of logs) {
      const profile = await this.dataSource.query(
        `SELECT user_id FROM hr_employee_profiles
         WHERE tenant_id = $1 AND employee_id = $2 LIMIT 1`,
        [tenantId, log.employee_id],
      );
      if (!profile[0]) continue;
      const userId = profile[0].user_id;
      const workDate = new Date(log.punch_time).toISOString().slice(0, 10);
      const punchHour = new Date(log.punch_time).getHours();
      const punchMin = new Date(log.punch_time).getMinutes();
      const late = punchHour > 9 || (punchHour === 9 && punchMin > 15);
      const status = late ? 'LATE' : 'PRESENT';

      if (log.punch_type === 'IN') {
        await this.dataSource.query(
          `INSERT INTO hr_staff_attendance (user_id, work_date, check_in_at, status, source)
           VALUES ($1, $2, $3::timestamptz, $4, 'BIOMETRIC')
           ON CONFLICT (user_id, work_date) DO UPDATE SET
             check_in_at = COALESCE(hr_staff_attendance.check_in_at, EXCLUDED.check_in_at),
             status = EXCLUDED.status,
             source = 'BIOMETRIC'`,
          [userId, workDate, log.punch_time, status],
        );
      } else {
        await this.dataSource.query(
          `UPDATE hr_staff_attendance SET check_out_at = $3::timestamptz
           WHERE user_id = $1 AND work_date = $2`,
          [userId, workDate, log.punch_time],
        );
      }
      await this.dataSource.query(
        `UPDATE hr_biometric_logs SET processed = TRUE WHERE log_id = $1`,
        [log.log_id],
      );
      processed += 1;
    }
    return { processed, pending: logs.length - processed };
  }

  async listPayPackages(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT pkg.*, u.name AS employee_name, p.employee_id
       FROM hr_employee_pay_packages pkg
       JOIN users u ON u.user_id = pkg.user_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = pkg.tenant_id
       WHERE pkg.tenant_id = $1 ${this.entityCtx.entityFilterSql('p', 2)}
       ORDER BY u.name`,
      [tenantId, entityId],
    );
  }

  async upsertPayPackage(
    tenantId: string,
    dto: {
      user_id: string;
      basic_pay: number;
      hra?: number;
      da?: number;
      pf_deduction?: number;
      tds_deduction?: number;
      other_deductions?: number;
    },
  ) {
    const gross = dto.basic_pay + (dto.hra ?? 0) + (dto.da ?? 0);
    const net =
      gross -
      (dto.pf_deduction ?? 0) -
      (dto.tds_deduction ?? 0) -
      (dto.other_deductions ?? 0);
    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_pay_packages (
         tenant_id, user_id, basic_pay, hra, da, pf_deduction, tds_deduction, other_deductions, net_salary, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         basic_pay = EXCLUDED.basic_pay, hra = EXCLUDED.hra, da = EXCLUDED.da,
         pf_deduction = EXCLUDED.pf_deduction, tds_deduction = EXCLUDED.tds_deduction,
         other_deductions = EXCLUDED.other_deductions, net_salary = EXCLUDED.net_salary, updated_at = NOW()
       RETURNING *`,
      [
        tenantId,
        dto.user_id,
        dto.basic_pay,
        dto.hra ?? 0,
        dto.da ?? 0,
        dto.pf_deduction ?? 0,
        dto.tds_deduction ?? 0,
        dto.other_deductions ?? 0,
        net,
      ],
    );
    return rows[0];
  }

  async calculateApiScore(tenantId: string, userId: string, year: number) {
    const logs = await this.dataSource.query(
      `SELECT publication_type, indexing_type FROM faculty_research_logs
       WHERE tenant_id = $1 AND faculty_user_id = $2
         AND EXTRACT(YEAR FROM COALESCE(published_date, created_at::date)) = $3`,
      [tenantId, userId, year],
    );
    let score = 0;
    const breakdown: Record<string, number> = {};
    for (const log of logs) {
      let pts = API_POINTS[log.publication_type] ?? 3;
      if (log.indexing_type === 'SCOPUS') pts += 2;
      score += pts;
      breakdown[log.publication_type] =
        (breakdown[log.publication_type] ?? 0) + pts;
    }
    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_appraisals (tenant_id, user_id, appraisal_year, auto_api_score, api_breakdown, calculated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,NOW())
       ON CONFLICT (tenant_id, user_id, appraisal_year) DO UPDATE SET
         auto_api_score = EXCLUDED.auto_api_score,
         api_breakdown = EXCLUDED.api_breakdown,
         calculated_at = NOW()
       RETURNING *`,
      [tenantId, userId, year, score, JSON.stringify(breakdown)],
    );
    return rows[0];
  }

  async listAppraisalsWithApi(
    tenantId: string,
    year: number,
    entityId: number,
  ) {
    const faculty = await this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Faculty', 'HOD', 'Dean')
         ${this.entityCtx.entityFilterSql('p', 2)}`,
      [tenantId, entityId],
    );
    for (const f of faculty) {
      await this.calculateApiScore(tenantId, f.user_id, year);
    }
    return this.dataSource.query(
      `SELECT a.*, u.name AS employee_name, p.employee_id
       FROM hr_employee_appraisals a
       JOIN users u ON u.user_id = a.user_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1 AND a.appraisal_year = $3
         ${this.entityCtx.entityFilterSql('p', 2)}
       ORDER BY a.auto_api_score DESC`,
      [tenantId, entityId, year],
    );
  }

  async listPromotionCandidates(tenantId: string, entityId: number) {
    const year = new Date().getFullYear();
    return this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id, p.designation, p.joining_date,
              a.auto_api_score,
              EXTRACT(YEAR FROM age(CURRENT_DATE, p.joining_date)) AS years_of_service,
              ph.to_designation AS last_promotion_to,
              ph.effective_date AS last_promotion_date,
              CASE
                WHEN a.auto_api_score >= 50 AND EXTRACT(YEAR FROM age(CURRENT_DATE, p.joining_date)) >= 5
                THEN 'ELIGIBLE'
                ELSE 'NOT_YET'
              END AS promotion_eligibility
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = $1
       LEFT JOIN hr_employee_appraisals a ON a.user_id = u.user_id AND a.appraisal_year = $3 AND a.tenant_id = $1
       LEFT JOIN LATERAL (
         SELECT to_designation, effective_date FROM hr_promotion_history
         WHERE employee_user_id = u.user_id AND tenant_id = $1
         ORDER BY effective_date DESC LIMIT 1
       ) ph ON TRUE
       WHERE u.tenant_id = $1 AND r.role_name IN ('Faculty', 'HOD')
         ${this.entityCtx.entityFilterSql('p', 2)}
       ORDER BY a.auto_api_score DESC NULLS LAST`,
      [tenantId, entityId, year],
    );
  }

  async hireApplicant(
    tenantId: string,
    applicantId: string,
    _hrUserId: string,
  ) {
    const applicant = await this.dataSource.query(
      `SELECT * FROM hr_applicants WHERE applicant_id = $1 AND tenant_id = $2`,
      [applicantId, tenantId],
    );
    if (!applicant[0]) throw new NotFoundException('Applicant not found');
    const a = applicant[0];
    if (a.stage !== 'HIRED' && a.stage !== 'OFFERED') {
      throw new BadRequestException('Move candidate to OFFERED or HIRED first');
    }

    const entityId = await this.resolveEntityId(
      tenantId,
      a.entity_id as number | null,
    );
    const email = String(a.email).toLowerCase();

    if (a.hired_user_id) {
      const spawn = await this.onboardingWorkflow.spawnTasksForEmployee(
        tenantId,
        entityId,
        a.hired_user_id,
      );
      return {
        user_id: a.hired_user_id,
        email,
        onboarding_triggered: spawn.spawned > 0,
        already_hired: true,
        onboarding_spawn: spawn,
      };
    }

    const role = await this.dataSource.query(
      `SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1`,
    );
    const passwordHash = await bcrypt.hash('Welcome@123', 10);
    const onboardingStatus = getInitialOnboardingStatusForRole('Faculty');
    const userRows = await this.dataSource.query(
      `INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active, entity_id, onboarding_status, onboarding_profile)
       VALUES ($1, $2, $3, $4, $5, true, $6, $7, '{}'::jsonb)
       ON CONFLICT (tenant_id, official_email) DO UPDATE SET
         name = EXCLUDED.name,
         is_active = true,
         entity_id = COALESCE(users.entity_id, EXCLUDED.entity_id),
         onboarding_status = CASE
           WHEN users.onboarding_status IN (
             'COMPLETED', 'PENDING_DOCUMENTS', 'PENDING_ADMIN_APPROVAL', 'PENDING_PASSWORD_RESET'
           ) THEN users.onboarding_status
           ELSE EXCLUDED.onboarding_status
         END
       RETURNING user_id`,
      [
        tenantId,
        a.name,
        email,
        role[0]?.role_id ?? 2,
        passwordHash,
        entityId,
        onboardingStatus,
      ],
    );
    const userId = userRows[0].user_id;
    await this.dataSource.query(
      `INSERT INTO user_roles (user_id, role_id, is_primary)
       SELECT $1, $2, true
       ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
      [userId, role[0]?.role_id ?? 2],
    );
    await this.upsertEmployeeProfile(tenantId, userId, {
      employee_id: `SGVU-${applicantId.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      designation: 'Assistant Professor',
      joining_date: new Date().toISOString().slice(0, 10),
      entity_id: entityId,
    });
    await this.dataSource.query(
      `INSERT INTO user_entity_access (user_id, entity_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, entity_id) DO NOTHING`,
      [userId, entityId],
    );
    await this.dataSource.query(
      `UPDATE hr_applicants SET stage = 'HIRED', hired_user_id = $2, updated_at = NOW() WHERE applicant_id = $1`,
      [applicantId, userId],
    );
    const spawn = await this.onboardingWorkflow.spawnTasksForEmployee(
      tenantId,
      entityId,
      userId,
    );
    return {
      user_id: userId,
      email,
      onboarding_triggered: spawn.spawned > 0,
      onboarding_spawn: spawn,
    };
  }

  validateBiometricWebhook(secret?: string) {
    const expected = this.config.get<string>('HR_BIOMETRIC_WEBHOOK_SECRET');
    if (!expected) return true;
    if (secret !== expected)
      throw new ForbiddenException('Invalid biometric webhook secret');
    return true;
  }
}
