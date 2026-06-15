import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HrLeavePolicyService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  listPolicies(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT * FROM hr_leave_policies WHERE tenant_id = $1 AND entity_id = $2 ORDER BY leave_name`,
      [tenantId, entityId],
    );
  }

  async createPolicy(tenantId: string, entityId: number, dto: Record<string, unknown>) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_leave_policies (
         tenant_id, entity_id, leave_name, leave_code, leave_count, disbursement_cycle,
         is_paid, requires_document_proof, allow_clubbing, sandwich_rule_enabled, sandwich_counts_weekends, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        tenantId,
        entityId,
        dto.leave_name,
        dto.leave_code,
        dto.leave_count,
        dto.disbursement_cycle ?? 'YEARLY',
        dto.is_paid ?? true,
        dto.requires_document_proof ?? false,
        dto.allow_clubbing ?? false,
        dto.sandwich_rule_enabled ?? false,
        dto.sandwich_counts_weekends ?? true,
        dto.status ?? 'ACTIVE',
      ],
    );
    return rows[0];
  }

  async updatePolicy(tenantId: string, entityId: number, policyId: string, dto: Record<string, unknown>) {
    const rows = await this.dataSource.query(
      `UPDATE hr_leave_policies SET
         leave_name = COALESCE($4, leave_name),
         leave_count = COALESCE($5, leave_count),
         disbursement_cycle = COALESCE($6, disbursement_cycle),
         is_paid = COALESCE($7, is_paid),
         requires_document_proof = COALESCE($8, requires_document_proof),
         allow_clubbing = COALESCE($9, allow_clubbing),
         sandwich_rule_enabled = COALESCE($10, sandwich_rule_enabled),
         sandwich_counts_weekends = COALESCE($11, sandwich_counts_weekends),
         status = COALESCE($12, status)
       WHERE tenant_id = $1 AND entity_id = $2 AND policy_id = $3 RETURNING *`,
      [
        tenantId,
        entityId,
        policyId,
        dto.leave_name ?? null,
        dto.leave_count ?? null,
        dto.disbursement_cycle ?? null,
        dto.is_paid ?? null,
        dto.requires_document_proof ?? null,
        dto.allow_clubbing ?? null,
        dto.sandwich_rule_enabled ?? null,
        dto.sandwich_counts_weekends ?? null,
        dto.status ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Leave policy not found');
    return rows[0];
  }

  async deletePolicy(tenantId: string, entityId: number, policyId: string) {
    const res = await this.dataSource.query(
      `DELETE FROM hr_leave_policies WHERE tenant_id = $1 AND entity_id = $2 AND policy_id = $3 RETURNING *`,
      [tenantId, entityId, policyId],
    );
    if (!res[0]) throw new NotFoundException('Leave policy not found');
    return { success: true };
  }

  async validateLeaveApplication(
    tenantId: string,
    entityId: number,
    userId: string,
    dto: { leave_type: string; start_date: string; end_date: string },
  ) {
    const policies = await this.dataSource.query(
      `SELECT * FROM hr_leave_policies
       WHERE tenant_id = $1 AND entity_id = $2 AND leave_code = $3 AND status = 'ACTIVE'`,
      [tenantId, entityId, dto.leave_type],
    );
    const policy = policies[0];
    if (!policy) return { valid: true };

    const year = new Date(dto.start_date).getFullYear();
    const balanceRows = await this.dataSource.query(
      `SELECT entitled, used FROM hr_leave_policy_balances
       WHERE user_id = $1 AND policy_id = $2 AND year = $3`,
      [userId, policy.policy_id, year],
    );
    const entitled = Number(balanceRows[0]?.entitled ?? policy.leave_count);
    const used = Number(balanceRows[0]?.used ?? 0);
    const days = this.countDays(dto.start_date, dto.end_date, policy);

    if (days > entitled - used) {
      throw new BadRequestException(`Insufficient ${dto.leave_type} balance (${entitled - used} remaining)`);
    }

    if (!policy.allow_clubbing) {
      const adjacent = await this.dataSource.query(
        `SELECT 1 FROM staff_leave_requests
         WHERE staff_user_id = $1 AND tenant_id = $2 AND status NOT IN ('REJECTED')
           AND (
             end_date = ($3::date - INTERVAL '1 day')::date
             OR start_date = ($4::date + INTERVAL '1 day')::date
           )
         LIMIT 1`,
        [userId, tenantId, dto.start_date, dto.end_date],
      );
      if (adjacent[0]) {
        throw new BadRequestException('Clubbing not allowed for this leave type');
      }
    }

    return { valid: true, days_requested: days };
  }

  private countDays(start: string, end: string, policy: { sandwich_rule_enabled: boolean; sandwich_counts_weekends: boolean }) {
    const s = new Date(start);
    const e = new Date(end);
    let days = 0;
    for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay();
      if (policy.sandwich_rule_enabled && policy.sandwich_counts_weekends) {
        days += 1;
      } else if (dow !== 0 && dow !== 6) {
        days += 1;
      }
    }
    return days;
  }

  async accrueYearlyBalances(tenantId: string, entityId: number, year: number) {
    const policies = await this.listPolicies(tenantId, entityId);
    const staff = await this.dataSource.query(
      `SELECT user_id FROM hr_employee_profiles WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, entityId],
    );
    for (const p of policies) {
      if (p.disbursement_cycle !== 'YEARLY' && p.disbursement_cycle !== 'ON_JOIN') continue;
      for (const s of staff) {
        await this.dataSource.query(
          `INSERT INTO hr_leave_policy_balances (user_id, policy_id, year, entitled, used)
           VALUES ($1,$2,$3,$4,0)
           ON CONFLICT (user_id, policy_id, year) DO UPDATE SET entitled = EXCLUDED.entitled`,
          [s.user_id, p.policy_id, year, p.leave_count],
        );
      }
    }
    return { accrued: policies.length * staff.length };
  }
}
