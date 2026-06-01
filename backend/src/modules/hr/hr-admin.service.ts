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
  ) {}

  async listDirectory(tenantId: string) {
    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active,
              r.role_name AS role, d.dept_name AS department,
              p.employee_id, p.designation, p.joining_date,
              ro.name AS reporting_officer_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       WHERE u.tenant_id = $1
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
       ORDER BY u.name ASC`,
      [tenantId],
    );
  }

  async getEmployee360(tenantId: string, userId: string, includeSensitive = false) {
    const rows = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, u.is_active, u.reporting_officer_id,
              r.role_name AS role, d.dept_name AS department,
              p.profile_id, p.employee_id, p.designation, p.joining_date,
              p.pan_encrypted, p.aadhaar_encrypted, p.bank_account_encrypted, p.ifsc_code, p.pf_uan,
              ro.name AS reporting_officer_name
       FROM users u
       LEFT JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN users ro ON ro.user_id = u.reporting_officer_id
       WHERE u.tenant_id = $1 AND u.user_id = $2`,
      [tenantId, userId],
    );
    if (!rows[0]) throw new NotFoundException('Employee not found');
    const row = rows[0];
    const pan = includeSensitive ? this.crypto.decrypt(row.pan_encrypted) : null;
    const aadhaar = includeSensitive ? this.crypto.decrypt(row.aadhaar_encrypted) : null;
    const bank = includeSensitive ? this.crypto.decrypt(row.bank_account_encrypted) : null;

    const documents = await this.dataSource.query(
      `SELECT document_id, document_type, file_url, verification_status, uploaded_at
       FROM hr_employee_documents WHERE tenant_id = $1 AND user_id = $2 ORDER BY uploaded_at DESC`,
      [tenantId, userId],
    );

    return {
      user_id: row.user_id,
      name: row.name,
      email: row.email,
      role: row.role,
      department: row.department,
      is_active: row.is_active,
      employee_id: row.employee_id,
      designation: row.designation ?? row.role,
      joining_date: row.joining_date,
      reporting_officer_name: row.reporting_officer_name,
      ifsc_code: row.ifsc_code,
      pf_uan: row.pf_uan,
      kyc: {
        pan_masked: this.crypto.maskPan(this.crypto.decrypt(row.pan_encrypted)),
        aadhaar_masked: this.crypto.maskAadhaar(this.crypto.decrypt(row.aadhaar_encrypted)),
        bank_masked: this.crypto.maskBank(this.crypto.decrypt(row.bank_account_encrypted)),
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
    },
  ) {
    const pan = dto.pan_number !== undefined ? this.crypto.encrypt(dto.pan_number) : undefined;
    const aadhaar = dto.aadhaar_number !== undefined ? this.crypto.encrypt(dto.aadhaar_number) : undefined;
    const bank = dto.bank_account_no !== undefined ? this.crypto.encrypt(dto.bank_account_no) : undefined;

    const rows = await this.dataSource.query(
      `INSERT INTO hr_employee_profiles (
         tenant_id, user_id, employee_id, designation, joining_date,
         pan_encrypted, aadhaar_encrypted, bank_account_encrypted, ifsc_code, pf_uan, updated_at
       ) VALUES ($1,$2,COALESCE($3, 'SGVU-' || substr($2::text, 1, 8)), $4, COALESCE($5::date, CURRENT_DATE),
         $6,$7,$8,$9,$10, NOW())
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         employee_id = COALESCE(EXCLUDED.employee_id, hr_employee_profiles.employee_id),
         designation = COALESCE(EXCLUDED.designation, hr_employee_profiles.designation),
         joining_date = COALESCE(EXCLUDED.joining_date, hr_employee_profiles.joining_date),
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
        dto.employee_id ?? null,
        dto.designation ?? null,
        dto.joining_date ?? null,
        pan ?? null,
        aadhaar ?? null,
        bank ?? null,
        dto.ifsc_code ?? null,
        dto.pf_uan ?? null,
      ],
    );
    return rows[0];
  }

  async listLeaveBalancesGrid(tenantId: string, year: number) {
    return this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id,
              MAX(CASE WHEN b.leave_type = 'CL' THEN b.entitled - b.used END) AS cl_balance,
              MAX(CASE WHEN b.leave_type = 'SL' THEN b.entitled - b.used END) AS sl_balance,
              MAX(CASE WHEN b.leave_type = 'EL' THEN b.entitled - b.used END) AS el_balance,
              MAX(CASE WHEN b.leave_type = 'MATERNITY' THEN b.entitled - b.used END) AS maternity_balance
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id
       LEFT JOIN hr_leave_balances b ON b.user_id = u.user_id AND b.year = $2
       WHERE u.tenant_id = $1 AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
       GROUP BY u.user_id, u.name, p.employee_id
       ORDER BY u.name`,
      [tenantId, year],
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
    return { user_id: userId, leave_type: dto.leave_type, adjustment: dto.delta };
  }

  async ingestBiometricPunches(
    tenantId: string,
    punches: { employee_id: string; punch_time: string; device_id?: string; punch_type: 'IN' | 'OUT' }[],
  ) {
    for (const punch of punches) {
      await this.dataSource.query(
        `INSERT INTO hr_biometric_logs (tenant_id, employee_id, punch_time, device_id, punch_type)
         VALUES ($1, $2, $3::timestamptz, $4, $5)`,
        [tenantId, punch.employee_id, punch.punch_time, punch.device_id ?? null, punch.punch_type],
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
      await this.dataSource.query(`UPDATE hr_biometric_logs SET processed = TRUE WHERE log_id = $1`, [log.log_id]);
      processed += 1;
    }
    return { processed, pending: logs.length - processed };
  }

  async listPayPackages(tenantId: string) {
    return this.dataSource.query(
      `SELECT pkg.*, u.name AS employee_name, p.employee_id
       FROM hr_employee_pay_packages pkg
       JOIN users u ON u.user_id = pkg.user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id
       WHERE pkg.tenant_id = $1
       ORDER BY u.name`,
      [tenantId],
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
    const gross =
      dto.basic_pay + (dto.hra ?? 0) + (dto.da ?? 0);
    const net =
      gross - (dto.pf_deduction ?? 0) - (dto.tds_deduction ?? 0) - (dto.other_deductions ?? 0);
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
      breakdown[log.publication_type] = (breakdown[log.publication_type] ?? 0) + pts;
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

  async listAppraisalsWithApi(tenantId: string, year: number) {
    const faculty = await this.dataSource.query(
      `SELECT u.user_id, u.name, p.employee_id, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Faculty', 'HOD', 'Dean')`,
      [tenantId],
    );
    for (const f of faculty) {
      await this.calculateApiScore(tenantId, f.user_id, year);
    }
    return this.dataSource.query(
      `SELECT a.*, u.name AS employee_name, p.employee_id
       FROM hr_employee_appraisals a
       JOIN users u ON u.user_id = a.user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id
       WHERE a.tenant_id = $1 AND a.appraisal_year = $2
       ORDER BY a.auto_api_score DESC`,
      [tenantId, year],
    );
  }

  async listPromotionCandidates(tenantId: string) {
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
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = $1
       LEFT JOIN hr_employee_appraisals a ON a.user_id = u.user_id AND a.appraisal_year = $2 AND a.tenant_id = $1
       LEFT JOIN LATERAL (
         SELECT to_designation, effective_date FROM hr_promotion_history
         WHERE employee_user_id = u.user_id AND tenant_id = $1
         ORDER BY effective_date DESC LIMIT 1
       ) ph ON TRUE
       WHERE u.tenant_id = $1 AND r.role_name IN ('Faculty', 'HOD')
       ORDER BY a.auto_api_score DESC NULLS LAST`,
      [tenantId, year],
    );
  }

  async hireApplicant(tenantId: string, applicantId: string, hrUserId: string) {
    const applicant = await this.dataSource.query(
      `SELECT * FROM hr_applicants WHERE applicant_id = $1 AND tenant_id = $2`,
      [applicantId, tenantId],
    );
    if (!applicant[0]) throw new NotFoundException('Applicant not found');
    const a = applicant[0];
    if (a.stage !== 'HIRED' && a.stage !== 'OFFERED') {
      throw new BadRequestException('Move candidate to OFFERED or HIRED first');
    }

    const role = await this.dataSource.query(
      `SELECT role_id FROM roles WHERE role_name = 'Faculty' LIMIT 1`,
    );
    const passwordHash = await bcrypt.hash('Welcome@123', 10);
    const email = a.email.toLowerCase();
    const userRows = await this.dataSource.query(
      `INSERT INTO users (tenant_id, name, official_email, role_id, password_hash, is_active)
       VALUES ($1, $2, $3, $4, $5, true)
       ON CONFLICT (tenant_id, official_email) DO UPDATE SET name = EXCLUDED.name, is_active = true
       RETURNING user_id`,
      [tenantId, a.name, email, role[0]?.role_id ?? 2, passwordHash],
    );
    const userId = userRows[0].user_id;
    await this.upsertEmployeeProfile(tenantId, userId, {
      employee_id: `SGVU-${applicantId.slice(0, 8).toUpperCase()}`,
      designation: 'Assistant Professor',
      joining_date: new Date().toISOString().slice(0, 10),
    });
    await this.dataSource.query(
      `UPDATE hr_applicants SET stage = 'HIRED', hired_user_id = $2, updated_at = NOW() WHERE applicant_id = $1`,
      [applicantId, userId],
    );
    await this.dataSource.query(
      `INSERT INTO hr_clearance_tasks (tenant_id, applicant_id, lifecycle_type, department_owner, task_name, status, due_date)
       VALUES ($1, $2, 'ONBOARDING', 'IT', 'Create @mygyanvihar.com email', 'PENDING', CURRENT_DATE + 3),
              ($1, $2, 'ONBOARDING', 'HR', 'Print employee ID card', 'PENDING', CURRENT_DATE + 5)`,
      [tenantId, applicantId],
    );
    return { user_id: userId, email, onboarding_triggered: true };
  }

  validateBiometricWebhook(secret?: string) {
    const expected = this.config.get<string>('HR_BIOMETRIC_WEBHOOK_SECRET');
    if (!expected) return true;
    if (secret !== expected) throw new ForbiddenException('Invalid biometric webhook secret');
    return true;
  }
}
