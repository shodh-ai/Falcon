import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HrRulesService } from './hr-rules.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import type { DayCalculationResult } from './attendance-calculation.service';

export type DynamicRuleDto = {
  rule_name: string;
  condition_type: string;
  operator: string;
  threshold_value: number;
  threshold_unit: string;
  action_type: string;
  action_payload?: Record<string, unknown>;
  priority?: number;
  is_active?: boolean;
};

type DynamicRule = DynamicRuleDto & {
  rule_id: string;
  tenant_id: string;
  entity_id: number;
};

@Injectable()
export class HrDynamicRulesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly legacyRules: HrRulesService,
    private readonly notify: NotificationEmitterService,
  ) {}

  listRules(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT * FROM hr_dynamic_rules
       WHERE tenant_id = $1 AND entity_id = $2
       ORDER BY priority ASC, rule_name ASC`,
      [tenantId, entityId],
    );
  }

  async createRule(tenantId: string, entityId: number, dto: DynamicRuleDto) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_dynamic_rules (
         tenant_id, entity_id, rule_name, condition_type, operator,
         threshold_value, threshold_unit, action_type, action_payload, priority, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11)
       RETURNING *`,
      [
        tenantId,
        entityId,
        dto.rule_name,
        dto.condition_type,
        dto.operator,
        dto.threshold_value,
        dto.threshold_unit,
        dto.action_type,
        JSON.stringify(dto.action_payload ?? {}),
        dto.priority ?? 100,
        dto.is_active ?? true,
      ],
    );
    return rows[0];
  }

  async updateRule(
    tenantId: string,
    entityId: number,
    ruleId: string,
    dto: Partial<DynamicRuleDto>,
  ) {
    const rows = await this.dataSource.query(
      `UPDATE hr_dynamic_rules SET
         rule_name = COALESCE($4, rule_name),
         condition_type = COALESCE($5, condition_type),
         operator = COALESCE($6, operator),
         threshold_value = COALESCE($7, threshold_value),
         threshold_unit = COALESCE($8, threshold_unit),
         action_type = COALESCE($9, action_type),
         action_payload = COALESCE($10::jsonb, action_payload),
         priority = COALESCE($11, priority),
         is_active = COALESCE($12, is_active)
       WHERE tenant_id = $1 AND entity_id = $2 AND rule_id = $3
       RETURNING *`,
      [
        tenantId,
        entityId,
        ruleId,
        dto.rule_name ?? null,
        dto.condition_type ?? null,
        dto.operator ?? null,
        dto.threshold_value ?? null,
        dto.threshold_unit ?? null,
        dto.action_type ?? null,
        dto.action_payload ? JSON.stringify(dto.action_payload) : null,
        dto.priority ?? null,
        dto.is_active ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Rule not found');
    return rows[0];
  }

  async deleteRule(tenantId: string, entityId: number, ruleId: string) {
    const rows = await this.dataSource.query(
      `DELETE FROM hr_dynamic_rules WHERE tenant_id = $1 AND entity_id = $2 AND rule_id = $3 RETURNING rule_id`,
      [tenantId, entityId, ruleId],
    );
    if (!rows[0]) throw new NotFoundException('Rule not found');
    return { deleted: true };
  }

  private compare(
    operator: string,
    actual: number,
    threshold: number,
  ): boolean {
    switch (operator) {
      case 'GT':
        return actual > threshold;
      case 'GTE':
        return actual >= threshold;
      case 'LT':
        return actual < threshold;
      case 'LTE':
        return actual <= threshold;
      case 'EQ':
        return actual === threshold;
      default:
        return false;
    }
  }

  async evaluateRulesForDay(
    tenantId: string,
    entityId: number,
    userId: string,
    date: string,
    result: DayCalculationResult,
  ) {
    const monthYear = `${String(new Date(date).getMonth() + 1).padStart(2, '0')}-${new Date(date).getFullYear()}`;
    const rules = (await this.listRules(tenantId, entityId)) as DynamicRule[];
    const active = rules.filter((r) => r.is_active);

    for (const rule of active) {
      const threshold = Number(rule.threshold_value);
      let matched = false;
      let metric = 0;

      if (rule.condition_type === 'PUNCH_OUT_EARLY') {
        if (!result.last_out_time || result.calculated_status === 'ABSENT')
          continue;
        const shiftEnd = this.shiftDateTime(date, result.shift.end_time, 0);
        metric = Math.round(
          (shiftEnd.getTime() - result.last_out_time.getTime()) / 60000,
        );
        if (metric > 0)
          matched = this.compare(rule.operator, metric, threshold);
      } else if (rule.condition_type === 'PUNCH_IN_LATE') {
        if (!result.first_in_time) continue;
        const shiftStart = this.shiftDateTime(
          date,
          result.shift.start_time,
          result.shift.grace_period_mins,
        );
        metric = Math.round(
          (result.first_in_time.getTime() - shiftStart.getTime()) / 60000,
        );
        if (metric > 0)
          matched = this.compare(rule.operator, metric, threshold);
      } else if (rule.condition_type === 'MISSED_PUNCH') {
        matched = !result.first_in_time || !result.last_out_time;
        metric = matched ? 1 : 0;
        matched = this.compare(rule.operator, metric, threshold);
      } else if (rule.condition_type === 'OCCURRENCE_COUNT') {
        const trackType =
          (rule.action_payload?.track_type as string) ?? 'EARLY_GOING';
        if (
          trackType === 'EARLY_GOING' &&
          result.last_out_time &&
          result.calculated_status !== 'ABSENT'
        ) {
          const maxMins = Number(rule.action_payload?.max_mins ?? 20);
          const shiftEnd = this.shiftDateTime(date, result.shift.end_time, 0);
          const minutesEarly = Math.round(
            (shiftEnd.getTime() - result.last_out_time.getTime()) / 60000,
          );
          if (minutesEarly <= 0 || minutesEarly > maxMins) continue;
          const tracker = await this.legacyRules.incrementEarlyGoing(
            tenantId,
            entityId,
            userId,
            monthYear,
            date,
          );
          metric = Number(tracker.early_goings_count);
          matched = this.compare(rule.operator, metric, threshold);
        }
      }

      if (!matched) continue;
      await this.applyAction(
        tenantId,
        entityId,
        userId,
        date,
        monthYear,
        rule,
        metric,
      );
    }
  }

  private async applyAction(
    tenantId: string,
    entityId: number,
    userId: string,
    date: string,
    monthYear: string,
    rule: DynamicRule,
    metric: number,
  ) {
    switch (rule.action_type) {
      case 'DEDUCT_HALF_DAY':
        await this.dataSource.query(
          `UPDATE hr_daily_attendance SET calculated_status = 'HALF_DAY', status = 'HALF_DAY'
           WHERE user_id = $1 AND date = $2`,
          [userId, date],
        );
        break;
      case 'MARK_LOP':
        await this.dataSource.query(
          `UPDATE hr_daily_attendance SET calculated_status = 'LOP', status = 'LOP'
           WHERE user_id = $1 AND date = $2`,
          [userId, date],
        );
        break;
      case 'DEDUCT_CL':
        await this.dataSource.query(
          `UPDATE hr_leave_balances SET used = used + 0.5
           WHERE user_id = $1 AND leave_type = 'CL' AND year = $2`,
          [userId, new Date(date).getFullYear()],
        );
        break;
      case 'RETROACTIVE_PENALTY': {
        const daysDeducted = Number(rule.action_payload?.days_deducted ?? 2);
        await this.legacyRules.recordPayrollDeduction(
          tenantId,
          entityId,
          userId,
          monthYear,
          'DYNAMIC_RULE_RETROACTIVE',
          0,
          daysDeducted,
          `${rule.rule_name}: occurrence threshold met (metric=${metric}).`,
        );
        this.notify.penaltyApplied({
          tenantId,
          userId,
          message: rule.rule_name,
          leaveType: 'PENALTY',
          startDate: date,
          endDate: date,
        });
        break;
      }
      default:
        break;
    }
  }

  private shiftDateTime(date: string, time: string, graceMins: number) {
    const [h, m] = time.split(':').map(Number);
    const d = new Date(`${date}T00:00:00`);
    d.setHours(h, m + graceMins, 0, 0);
    return d;
  }
}
