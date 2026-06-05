import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HrEntityContextService } from './hr-entity-context.service';

@Injectable()
export class HrDashboardService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly entityCtx: HrEntityContextService,
  ) {}

  async getMasterDashboard(tenantId: string, entityId: number) {
    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + '-01';
    const entityFilter = this.entityCtx.entityFilterSql('p', 2);

    const [headcountRow] = await this.dataSource.query<
      Array<{ total: string; new_joiners: string; exits: string }>
    >(
      `SELECT
         COUNT(*) FILTER (WHERE u.is_active) AS total,
         COUNT(*) FILTER (
           WHERE p.joining_date >= $3::date AND p.joining_date <= CURRENT_DATE
         ) AS new_joiners,
         COUNT(*) FILTER (
           WHERE rr.last_working_day >= $3::date
             AND rr.last_working_day <= CURRENT_DATE
             AND rr.status IN ('FNF_PENDING', 'FNF_COMPLETED', 'HR_PROCESSING')
         ) AS exits
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
       LEFT JOIN hr_resignation_requests rr
         ON rr.user_id = u.user_id AND rr.tenant_id = u.tenant_id
       WHERE u.tenant_id = $1 AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}`,
      [tenantId, entityId, monthStart],
    );

    const [attendanceRow] = await this.dataSource.query<
      Array<{ present: string; absent: string; on_leave: string; late: string; total_staff: string }>
    >(
      `WITH staff AS (
         SELECT u.user_id FROM users u
         JOIN roles r ON r.role_id = u.role_id
         JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1 AND u.is_active = true
           AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')${entityFilter}
       )
       SELECT
         COUNT(*) FILTER (
           WHERE da.status = 'PRESENT' OR da.calculated_status IN ('FULL_DAY', 'HALF_DAY')
         ) AS present,
         COUNT(*) FILTER (
           WHERE da.status = 'ABSENT' OR da.calculated_status = 'ABSENT'
         ) AS absent,
         COUNT(*) FILTER (WHERE da.calculated_status = 'LATE_COMING') AS late,
         (SELECT COUNT(*) FROM staff s
          JOIN staff_leave_requests sl ON sl.staff_user_id = s.user_id
          WHERE sl.tenant_id = $1
            AND sl.status IN ('PENDING', 'HOD_APPROVED', 'HR_APPROVED')
            AND sl.start_date <= $3::date AND sl.end_date >= $3::date
         ) AS on_leave,
         (SELECT COUNT(*) FROM staff) AS total_staff
       FROM staff s
       LEFT JOIN hr_daily_attendance da ON da.user_id = s.user_id AND da.date = $3::date`,
      [tenantId, entityId, today],
    );

    const totalStaff = Math.max(Number(attendanceRow?.total_staff ?? 0), 1);
    const present = Number(attendanceRow?.present ?? 0);
    const absent = Number(attendanceRow?.absent ?? 0);
    const onLeave = Number(attendanceRow?.on_leave ?? 0);
    const late = Number(attendanceRow?.late ?? 0);
    const accounted = present + absent + onLeave + late;
    const unmarked = Math.max(totalStaff - accounted, 0);

    const [pendingLeaves] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM staff_leave_requests sl
       JOIN hr_employee_profiles p ON p.user_id = sl.staff_user_id AND p.tenant_id = sl.tenant_id
       WHERE sl.tenant_id = $1 AND sl.request_type = 'LEAVE'
         AND sl.status IN ('PENDING', 'HOD_APPROVED')${entityFilter}`,
      [tenantId, entityId],
    );

    const [pendingRegularizations] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM staff_leave_requests sl
       JOIN hr_employee_profiles p ON p.user_id = sl.staff_user_id AND p.tenant_id = sl.tenant_id
       WHERE sl.tenant_id = $1 AND sl.request_type = 'REGULARIZATION'
         AND sl.status IN ('PENDING', 'HOD_APPROVED')${entityFilter}`,
      [tenantId, entityId],
    );

    const [pendingFnf] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM hr_resignation_requests rr
       WHERE rr.tenant_id = $1 AND rr.status IN ('FNF_PENDING', 'HR_PROCESSING')${entityFilter.replace('p.', 'rr.')}`,
      [tenantId, entityId],
    );

    const attritionRows = await this.dataSource.query<
      Array<{ month_label: string; exits: string; headcount: string }>
    >(
      `WITH months AS (
         SELECT generate_series(
           date_trunc('month', CURRENT_DATE - INTERVAL '11 months'),
           date_trunc('month', CURRENT_DATE),
           '1 month'::interval
         )::date AS month_start
       )
       SELECT
         to_char(m.month_start, 'Mon YY') AS month_label,
         COALESCE((
           SELECT COUNT(*) FROM hr_resignation_requests rr
           WHERE rr.tenant_id = $1
             AND rr.entity_id = $2
             AND date_trunc('month', rr.last_working_day) = m.month_start
             AND rr.status IN ('FNF_PENDING', 'FNF_COMPLETED', 'HR_PROCESSING')
         ), 0)::text AS exits,
         COALESCE((
           SELECT COUNT(*) FROM hr_employee_profiles p
           JOIN users u ON u.user_id = p.user_id
           WHERE p.tenant_id = $1 AND p.entity_id = $2 AND u.is_active = true
         ), 1)::text AS headcount
       FROM months m
       ORDER BY m.month_start`,
      [tenantId, entityId],
    );

    const attritionTrend = attritionRows.map((row) => {
      const exits = Number(row.exits);
      const headcount = Math.max(Number(row.headcount), 1);
      return {
        month: row.month_label,
        turnover_pct: Math.round((exits / headcount) * 1000) / 10,
        exits,
      };
    });

    return {
      headcount_snapshot: {
        total_employees: Number(headcountRow?.total ?? 0),
        new_joiners_this_month: Number(headcountRow?.new_joiners ?? 0),
        exits_this_month: Number(headcountRow?.exits ?? 0),
      },
      today_attendance: {
        present_pct: Math.round((present / totalStaff) * 1000) / 10,
        absent_pct: Math.round((absent / totalStaff) * 1000) / 10,
        on_leave_pct: Math.round((onLeave / totalStaff) * 1000) / 10,
        late_pct: Math.round((late / totalStaff) * 1000) / 10,
        unmarked_pct: Math.round((unmarked / totalStaff) * 1000) / 10,
        chart: [
          { name: 'Present', value: present, pct: Math.round((present / totalStaff) * 1000) / 10 },
          { name: 'Absent', value: absent, pct: Math.round((absent / totalStaff) * 1000) / 10 },
          { name: 'On Leave', value: onLeave, pct: Math.round((onLeave / totalStaff) * 1000) / 10 },
          { name: 'Late', value: late, pct: Math.round((late / totalStaff) * 1000) / 10 },
        ],
      },
      pending_actions: {
        leave_approvals: Number(pendingLeaves?.count ?? 0),
        regularizations: Number(pendingRegularizations?.count ?? 0),
        fnf_clearances: Number(pendingFnf?.count ?? 0),
        items: [
          {
            label: 'Pending Leave Approvals',
            count: Number(pendingLeaves?.count ?? 0),
            href: '/hr/leaves',
          },
          {
            label: 'Pending Regularizations',
            count: Number(pendingRegularizations?.count ?? 0),
            href: '/hr/leaves',
          },
          {
            label: 'Pending FNF Clearances',
            count: Number(pendingFnf?.count ?? 0),
            href: '/hr/offboarding',
          },
        ],
      },
      attrition_trend: attritionTrend,
    };
  }
}
