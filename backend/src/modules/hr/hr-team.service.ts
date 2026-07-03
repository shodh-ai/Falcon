import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import type { StaffRequestType } from '../../entities/staff-leave-request.entity';
import { AttendanceCalculationService } from './attendance-calculation.service';
import {
  HrTeamScopeService,
  parseTeamScope,
  type TeamScope,
} from './hr-team-scope.service';
import { HrWorkforceService } from './hr-workforce.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { CacheService } from '../../core/redis/cache.service';
import { canAccessTeamApprovals } from './utils/reporting-officer.util';

export type TeamRequestTab =
  | 'LEAVE'
  | 'REGULARIZATION'
  | 'ON_DUTY'
  | 'COMP_OFF_CREDIT'
  | 'DOCUMENT'
  | 'APPRAISAL'
  | 'ATTENDANCE_OVERRIDE';

const TAB_TO_TYPE: Record<TeamRequestTab, string> = {
  LEAVE: 'LEAVE',
  REGULARIZATION: 'REGULARIZATION',
  ON_DUTY: 'ON_DUTY',
  COMP_OFF_CREDIT: 'COMP_OFF_CREDIT',
  DOCUMENT: 'DOCUMENT',
  APPRAISAL: 'APPRAISAL',
  ATTENDANCE_OVERRIDE: 'ATTENDANCE_OVERRIDE',
};

@Injectable()
export class HrTeamService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly scope: HrTeamScopeService,
    private readonly attendanceCalc: AttendanceCalculationService,
    private readonly workforce: HrWorkforceService,
    private readonly notify: NotificationEmitterService,
    private readonly cache: CacheService,
  ) {}

  private async assertTeamApprovalAccess(
    managerId: string,
    tenantId: string,
    roles: string[] = [],
  ): Promise<boolean> {
    return canAccessTeamApprovals(
      (sql, params) => this.dataSource.query(sql, params),
      tenantId,
      managerId,
      roles,
    );
  }

  private monthRange(month: string) {
    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const start = `${year}-${String(monthNum).padStart(2, '0')}-01`;
    const end = `${year}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
    return { year, monthNum, daysInMonth, start, end };
  }

  private formatClock(d: Date | null | undefined) {
    if (!d) return null;
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private cellColor(
    status: string,
    bottomLine: string,
  ): 'red' | 'yellow' | 'green' | 'gray' {
    if (status === 'ABSENT' || bottomLine === 'Absent') return 'red';
    if (
      bottomLine.startsWith('On Duty') ||
      bottomLine.startsWith('Leave') ||
      status === 'PENDING_REQUEST'
    ) {
      return 'yellow';
    }
    if (['FULL_DAY', 'LATE_COMING', 'EARLY_GOING', 'HALF_DAY'].includes(status))
      return 'green';
    if (status === 'WEEK_OFF' || status === 'HOLIDAY') return 'gray';
    return 'gray';
  }

  async getScopeCounts(managerId: string, tenantId: string) {
    return this.scope.getScopeCounts(managerId, tenantId);
  }

  async getDashboard(
    managerId: string,
    tenantId: string,
    scopeRaw?: string,
    month?: string,
  ) {
    const scope = parseTeamScope(scopeRaw);
    const monthKey = month ?? new Date().toISOString().slice(0, 7);
    const { start, end } = this.monthRange(monthKey);
    const { clause, params } = this.scope.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      1,
    );

    const metrics = await this.dataSource.query<
      Array<{
        avg_hours: string | null;
        avg_leave_days: string | null;
        avg_early: string | null;
        avg_late: string | null;
        attendance_pct: string | null;
        team_size: string;
      }>
    >(
      `WITH team AS (
         SELECT u.user_id FROM users u WHERE 1=1 ${clause}
       ),
       per_user AS (
         SELECT
           t.user_id,
           AVG(a.total_hours) FILTER (WHERE a.total_hours IS NOT NULL) AS avg_hours,
           AVG(CASE WHEN a.calculated_status = 'EARLY_GOING' THEN 1.0 ELSE 0.0 END) AS early_pct,
           AVG(CASE WHEN a.calculated_status = 'LATE_COMING' THEN 1.0 ELSE 0.0 END) AS late_pct,
           AVG(CASE WHEN a.calculated_status IN ('FULL_DAY','LATE_COMING','EARLY_GOING','HALF_DAY') THEN 1.0 ELSE 0.0 END) AS present_pct,
           COALESCE((
             SELECT SUM(
               GREATEST(0, LEAST(r.end_date, $4::date) - GREATEST(r.start_date, $3::date) + 1)
             )::int
             FROM staff_leave_requests r
             WHERE r.staff_user_id = t.user_id
               AND r.request_type = 'LEAVE'
               AND r.status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
               AND r.start_date <= $4 AND r.end_date >= $3
           ), 0) AS leave_days
         FROM team t
         LEFT JOIN hr_daily_attendance a
           ON a.user_id = t.user_id
          AND a.date BETWEEN $3 AND $4
          AND EXTRACT(DOW FROM a.date) NOT IN (0, 6)
         GROUP BY t.user_id
       )
       SELECT
         ROUND(AVG(pu.avg_hours)::numeric, 2) AS avg_hours,
         ROUND(AVG(pu.leave_days)::numeric, 2) AS avg_leave_days,
         ROUND(AVG(pu.early_pct)::numeric * 100, 1) AS avg_early,
         ROUND(AVG(pu.late_pct)::numeric * 100, 1) AS avg_late,
         ROUND(AVG(pu.present_pct)::numeric * 100, 1) AS attendance_pct,
         (SELECT COUNT(*)::text FROM team) AS team_size
       FROM per_user pu`,
      [...params, start, end],
    );

    const m = metrics[0] ?? {};

    const onTime = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause})
       SELECT t.name, t.user_id,
              COUNT(*) FILTER (WHERE a.calculated_status = 'FULL_DAY') AS on_time_days
       FROM team t
       JOIN hr_daily_attendance a ON a.user_id = t.user_id
       WHERE a.date BETWEEN $3 AND $4
       GROUP BY t.user_id, t.name
       ORDER BY on_time_days DESC
       LIMIT 5`,
      [...params, start, end],
    );

    const leastLeaves = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause}),
       leave_cnt AS (
         SELECT t.user_id, t.name,
                COALESCE(SUM(
                  GREATEST(0, LEAST(r.end_date, $4::date) - GREATEST(r.start_date, $3::date) + 1)
                ), 0)::int AS leave_days
         FROM team t
         LEFT JOIN staff_leave_requests r ON r.staff_user_id = t.user_id
           AND r.request_type = 'LEAVE'
           AND r.status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
           AND r.start_date <= $4 AND r.end_date >= $3
         GROUP BY t.user_id, t.name
       )
       SELECT name, user_id, leave_days FROM leave_cnt ORDER BY leave_days ASC, name LIMIT 5`,
      [...params, start, end],
    );

    const topHours = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause})
       SELECT t.name, t.user_id, ROUND(AVG(a.total_hours)::numeric, 2) AS avg_hours
       FROM team t
       JOIN hr_daily_attendance a ON a.user_id = t.user_id
       WHERE a.date BETWEEN $3 AND $4 AND a.total_hours IS NOT NULL
       GROUP BY t.user_id, t.name
       ORDER BY avg_hours DESC
       LIMIT 5`,
      [...params, start, end],
    );

    const unplannedLeaves = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause})
       SELECT t.name, t.user_id, COUNT(*)::int AS cnt
       FROM team t
       JOIN staff_leave_requests r ON r.staff_user_id = t.user_id
       WHERE r.request_type = 'LEAVE'
         AND r.leave_type IN ('CL','SL')
         AND r.status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
         AND r.start_date BETWEEN $3 AND $4
       GROUP BY t.user_id, t.name
       ORDER BY cnt DESC
       LIMIT 5`,
      [...params, start, end],
    );

    const mostLeaves = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause}),
       leave_cnt AS (
         SELECT t.user_id, t.name,
                COALESCE(SUM(
                  GREATEST(0, LEAST(r.end_date, $4::date) - GREATEST(r.start_date, $3::date) + 1)
                ), 0)::int AS cnt
         FROM team t
         LEFT JOIN staff_leave_requests r ON r.staff_user_id = t.user_id
           AND r.request_type = 'LEAVE'
           AND r.status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
           AND r.start_date <= $4 AND r.end_date >= $3
         GROUP BY t.user_id, t.name
       )
       SELECT name, user_id, cnt FROM leave_cnt ORDER BY cnt DESC, name LIMIT 5`,
      [...params, start, end],
    );

    const lowestHours = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause})
       SELECT t.name, t.user_id, ROUND(AVG(a.total_hours)::numeric, 2) AS avg_hours
       FROM team t
       JOIN hr_daily_attendance a ON a.user_id = t.user_id
       WHERE a.date BETWEEN $3 AND $4 AND a.total_hours IS NOT NULL
       GROUP BY t.user_id, t.name
       ORDER BY avg_hours ASC
       LIMIT 5`,
      [...params, start, end],
    );

    const lateEarly = await this.dataSource.query(
      `WITH team AS (SELECT u.user_id, u.name FROM users u WHERE 1=1 ${clause})
       SELECT t.name, t.user_id,
              COUNT(*) FILTER (WHERE a.calculated_status IN ('LATE_COMING','EARLY_GOING'))::int AS anomaly_count
       FROM team t
       JOIN hr_daily_attendance a ON a.user_id = t.user_id
       WHERE a.date BETWEEN $3 AND $4
       GROUP BY t.user_id, t.name
       HAVING COUNT(*) FILTER (WHERE a.calculated_status IN ('LATE_COMING','EARLY_GOING')) > 3
       ORDER BY anomaly_count DESC
       LIMIT 5`,
      [...params, start, end],
    );

    return {
      scope,
      month: monthKey,
      team_size: Number(m.team_size ?? 0),
      metrics: {
        avg_working_hours: Number(m.avg_hours ?? 0),
        avg_leave_taken: Number(m.avg_leave_days ?? 0),
        avg_early_going_pct: Number(m.avg_early ?? 0),
        avg_late_arrival_pct: Number(m.avg_late ?? 0),
        attendance_pct: Number(m.attendance_pct ?? 0),
      },
      leaderboard: {
        on_time_arrival: onTime,
        least_leaves: leastLeaves,
        top_working_hours: topHours,
        lowest_working_hours: lowestHours,
      },
      need_attention: {
        most_leaves: mostLeaves,
        unplanned_leaves: unplannedLeaves,
        late_early_anomalies: lateEarly,
      },
    };
  }

  async getAttendanceMatrix(
    managerId: string,
    tenantId: string,
    scopeRaw?: string,
    month?: string,
  ) {
    const scope = parseTeamScope(scopeRaw);
    const monthKey = month ?? new Date().toISOString().slice(0, 7);
    const cacheKey = `hr_team_att:${tenantId}:${managerId}:${scope}:${monthKey}`;
    return this.cache.getOrSet(
      cacheKey,
      () => this.buildAttendanceMatrix(managerId, tenantId, scope, monthKey),
      600,
    );
  }

  private async buildAttendanceMatrix(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
    monthKey: string,
  ) {
    const { daysInMonth, start, end } = this.monthRange(monthKey);
    const members = await this.scope.listScopedUsers(
      managerId,
      tenantId,
      scope,
    );
    if (!members.length) {
      return {
        scope,
        month: monthKey,
        days_in_month: daysInMonth,
        employees: [],
      };
    }

    const entityRows = await this.dataSource.query<
      Array<{ entity_id: number }>
    >(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [managerId, tenantId],
    );
    const entityId = Number(entityRows[0]?.entity_id ?? 1);
    const userIds = members.map((m) => m.user_id);

    const [calendars, leaveRows] = await Promise.all([
      this.attendanceCalc.buildMonthCalendarsBatch(
        userIds,
        monthKey,
        tenantId,
        entityId,
      ),
      this.dataSource.query<
        Array<{
          staff_user_id: string;
          start_date: string;
          end_date: string;
          leave_type: string;
          request_type: string;
          status: string;
        }>
      >(
        `SELECT staff_user_id, start_date, end_date, leave_type, request_type, status
         FROM staff_leave_requests
         WHERE staff_user_id = ANY($1::uuid[])
           AND status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
           AND start_date <= $3 AND end_date >= $2`,
        [userIds, start, end],
      ),
    ]);

    const leavesByUser = new Map<string, typeof leaveRows>();
    for (const row of leaveRows) {
      const list = leavesByUser.get(row.staff_user_id) ?? [];
      list.push(row);
      leavesByUser.set(row.staff_user_id, list);
    }

    const employees = members.map((m) => {
      const cal = calendars.get(m.user_id);
      const shift = cal?.shift ?? {
        full_day_min_hours: 8,
        half_day_min_hours: 4,
        grace_period_mins: 15,
        shift_id: '',
        shift_name: 'Default',
        start_time: '09:00:00',
        end_time: '17:00:00',
        week_off_day: 0,
      };
      const requiredLabel = `${String(shift.full_day_min_hours ?? 8).padStart(2, '0')}:00 Hrs`;
      const userLeaves = leavesByUser.get(m.user_id) ?? [];
      const odRows = userLeaves.filter((r) => r.request_type === 'ON_DUTY');
      const days = (cal?.days ?? []).map((d) => {
        const leave = userLeaves.find((r) => {
          if (r.request_type === 'ON_DUTY') return false;
          return d.date >= r.start_date && d.date <= r.end_date;
        });
        const od = odRows.find(
          (r) => d.date >= r.start_date && d.date <= r.end_date,
        );

        let bottomLine: string;
        if (leave) {
          bottomLine = `Leave(${leave.leave_type})`;
        } else if (od) {
          bottomLine = 'On Duty';
        } else if (d.calculated_status === 'ABSENT') {
          bottomLine = 'Absent';
        } else if (d.first_in_time && d.last_out_time) {
          bottomLine = `${this.formatClock(d.first_in_time)}-${this.formatClock(d.last_out_time)}`;
        } else if (d.calculated_status === 'WEEK_OFF') {
          bottomLine = 'Week Off';
        } else if (d.calculated_status === 'HOLIDAY') {
          bottomLine = 'Holiday';
        } else {
          bottomLine = d.calculated_status.replace(/_/g, ' ');
        }

        const topLine =
          d.calculated_status === 'WEEK_OFF' ||
          d.calculated_status === 'HOLIDAY'
            ? '—'
            : requiredLabel;

        return {
          date: d.date,
          top_line: topLine,
          bottom_line: bottomLine,
          calculated_status: d.calculated_status,
          color: this.cellColor(d.calculated_status, bottomLine),
        };
      });

      return {
        user_id: m.user_id,
        name: m.name,
        employee_id: m.employee_id,
        days,
      };
    });

    return { scope, month: monthKey, days_in_month: daysInMonth, employees };
  }

  async exportAttendanceExcel(
    managerId: string,
    tenantId: string,
    scopeRaw?: string,
    month?: string,
  ): Promise<Buffer> {
    const matrix = await this.getAttendanceMatrix(
      managerId,
      tenantId,
      scopeRaw,
      month,
    );
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Team Attendance');
    const headers = [
      'Employee ID',
      'Name',
      ...Array.from({ length: matrix.days_in_month }, (_, i) => String(i + 1)),
    ];
    sheet.addRow(headers);
    sheet.getRow(1).font = { bold: true };

    for (const emp of matrix.employees) {
      const dayMap = new Map(
        emp.days.map((d) => [
          d.date.slice(8, 10),
          `${d.top_line} | ${d.bottom_line}`,
        ]),
      );
      sheet.addRow([
        emp.employee_id ?? emp.user_id.slice(0, 8),
        emp.name,
        ...Array.from(
          { length: matrix.days_in_month },
          (_, i) => dayMap.get(String(i + 1).padStart(2, '0')) ?? '—',
        ),
      ]);
    }

    sheet.getColumn(2).width = 28;
    const buf = await wb.xlsx.writeBuffer();
    return Buffer.from(buf);
  }

  async getPendingCounts(
    managerId: string,
    tenantId: string,
    scopeRaw?: string,
    roles: string[] = [],
  ) {
    const scope = parseTeamScope(scopeRaw);
    const empty = {
      leaves: 0,
      regularization: 0,
      onDuty: 0,
      compOff: 0,
      documents: 0,
      appraisals: 0,
      attendanceOverrides: 0,
    };
    if (!(await this.assertTeamApprovalAccess(managerId, tenantId, roles))) {
      return { scope, ...empty };
    }

    const members = await this.scope.listScopedUsers(
      managerId,
      tenantId,
      scope,
    );
    const userIds = members.map((m) => m.user_id);

    if (!userIds.length) {
      return { scope, ...empty };
    }

    const workflowRows = await this.dataSource.query<
      Array<{ request_type: string; count: string }>
    >(
      `SELECT r.request_type, COUNT(*)::text AS count
       FROM staff_leave_requests r
       WHERE r.tenant_id = $1
         AND r.status = 'PENDING'
         AND r.current_approver_user_id = $2
         AND r.staff_user_id = ANY($3::uuid[])
       GROUP BY r.request_type`,
      [tenantId, managerId, userIds],
    );

    const { clause, params } = this.scope.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      2,
    );

    const [docRow] = await this.dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM hr_employee_documents d
       WHERE d.tenant_id = $1
         AND d.verification_status = 'PENDING'
         AND d.user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})`,
      [tenantId, ...params],
    );

    const [appraisalRow] = await this.dataSource.query<
      Array<{ count: string }>
    >(
      `SELECT COUNT(*)::text AS count
       FROM hr_employee_appraisals a
       WHERE a.tenant_id = $1
         AND a.hr_final_status = 'HOD_REVIEW'
         AND a.user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})`,
      [tenantId, ...params],
    );

    const [attendanceOverrideRow] = await this.dataSource.query<
      Array<{ count: string }>
    >(
      `SELECT COUNT(*)::text AS count
       FROM course_attendance_overrides o
       WHERE o.tenant_id = $1
         AND o.status = 'PENDING'
         AND o.faculty_user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})`,
      [tenantId, ...params],
    );

    const byType = Object.fromEntries(
      workflowRows.map((r) => [r.request_type, Number(r.count)]),
    );

    return {
      scope,
      leaves: byType.LEAVE ?? 0,
      regularization: byType.REGULARIZATION ?? 0,
      onDuty: byType.ON_DUTY ?? 0,
      compOff: byType.COMP_OFF_CREDIT ?? 0,
      documents: Number(docRow?.count ?? 0),
      appraisals: Number(appraisalRow?.count ?? 0),
      attendanceOverrides: Number(attendanceOverrideRow?.count ?? 0),
    };
  }

  async listTeamRequests(
    managerId: string,
    tenantId: string,
    scopeRaw?: string,
    tab?: string,
    roles: string[] = [],
  ) {
    const scope = parseTeamScope(scopeRaw);
    if (!(await this.assertTeamApprovalAccess(managerId, tenantId, roles))) {
      return { count: 0, tab: tab?.toUpperCase() ?? 'LEAVE', items: [] };
    }

    const requestTab = (tab?.toUpperCase() ?? 'LEAVE') as TeamRequestTab;
    const tabKey = TAB_TO_TYPE[requestTab] ?? 'LEAVE';

    if (tabKey === 'DOCUMENT') {
      return this.listDocumentApprovals(managerId, tenantId, scope);
    }
    if (tabKey === 'APPRAISAL') {
      return this.listAppraisalApprovals(managerId, tenantId, scope);
    }
    if (tabKey === 'ATTENDANCE_OVERRIDE') {
      return this.listAttendanceOverrides(managerId, tenantId, scope);
    }

    const members = await this.scope.listScopedUsers(
      managerId,
      tenantId,
      scope,
    );
    const userIds = members.map((m) => m.user_id);
    if (!userIds.length) {
      return { scope, tab: tabKey, count: 0, items: [] };
    }

    const rows = await this.dataSource.query(
      `SELECT r.leave_id, r.request_type, r.leave_type, r.start_date, r.end_date,
              r.regularization_date, r.reason, r.status, r.applied_at,
              u.name AS employee_name, u.official_email AS employee_email,
              p.employee_id
       FROM staff_leave_requests r
       JOIN users u ON u.user_id = r.staff_user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = r.tenant_id
       WHERE r.tenant_id = $1
         AND r.status = 'PENDING'
         AND r.current_approver_user_id = $2
         AND r.request_type = $3
         AND r.staff_user_id = ANY($4::uuid[])
       ORDER BY r.applied_at ASC`,
      [tenantId, managerId, tabKey, userIds],
    );

    return {
      scope,
      tab: tabKey,
      count: rows.length,
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.leave_id,
        leave_id: r.leave_id,
        request_type: r.request_type,
        leave_type: r.leave_type,
        start_date: r.start_date,
        end_date: r.end_date,
        regularization_date: r.regularization_date,
        applied_date: r.start_date ?? r.regularization_date,
        raised_on: r.applied_at,
        reason: r.reason,
        status: r.status,
        employee: {
          name: r.employee_name,
          email: r.employee_email,
          employee_id: r.employee_id,
        },
      })),
    };
  }

  private async listDocumentApprovals(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
  ) {
    const { clause, params } = this.scope.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      2,
    );
    const rows = await this.dataSource.query(
      `SELECT d.document_id, d.document_type, d.uploaded_at, d.verification_status,
              u.name AS employee_name, u.official_email AS employee_email, p.employee_id
       FROM hr_employee_documents d
       JOIN users u ON u.user_id = d.user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = d.tenant_id
       WHERE d.tenant_id = $1
         AND d.verification_status = 'PENDING'
         AND d.user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})
       ORDER BY d.uploaded_at ASC`,
      [tenantId, ...params],
    );

    return {
      scope,
      tab: 'DOCUMENT',
      count: rows.length,
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.document_id,
        document_id: r.document_id,
        request_type: 'DOCUMENT',
        leave_type: r.document_type,
        applied_date:
          (r.uploaded_at as Date)?.toISOString?.()?.slice(0, 10) ?? null,
        raised_on: r.uploaded_at,
        reason: `Document verification: ${r.document_type}`,
        status: r.verification_status,
        employee: {
          name: r.employee_name,
          email: r.employee_email,
          employee_id: r.employee_id,
        },
      })),
    };
  }

  private async listAppraisalApprovals(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
  ) {
    const { clause, params } = this.scope.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      2,
    );
    const rows = await this.dataSource.query(
      `SELECT a.appraisal_record_id, a.appraisal_year, a.auto_api_score, a.hod_rating, a.hr_final_status,
              u.name AS employee_name, u.official_email AS employee_email, p.employee_id
       FROM hr_employee_appraisals a
       JOIN users u ON u.user_id = a.user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = a.tenant_id
       WHERE a.tenant_id = $1
         AND a.hr_final_status = 'HOD_REVIEW'
         AND a.user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})
       ORDER BY a.appraisal_year DESC`,
      [tenantId, ...params],
    );

    return {
      scope,
      tab: 'APPRAISAL',
      count: rows.length,
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.appraisal_record_id,
        appraisal_id: r.appraisal_record_id,
        request_type: 'APPRAISAL',
        leave_type: `Appraisal ${r.appraisal_year}`,
        applied_date: String(r.appraisal_year),
        raised_on: null,
        reason: `API score: ${r.auto_api_score ?? '—'}`,
        status: r.hr_final_status,
        employee: {
          name: r.employee_name,
          email: r.employee_email,
          employee_id: r.employee_id,
        },
      })),
    };
  }

  private async listAttendanceOverrides(
    managerId: string,
    tenantId: string,
    scope: TeamScope,
  ) {
    const { clause, params } = this.scope.scopeUserFilterSql(
      managerId,
      tenantId,
      scope,
      'u',
      2,
    );
    const rows = await this.dataSource.query(
      `SELECT o.request_id, o.date, o.status, o.created_at,
              c.course_name, c.course_code,
              u.name AS employee_name, u.official_email AS employee_email, p.employee_id,
              s.name AS student_name
       FROM course_attendance_overrides o
       JOIN users u ON u.user_id = o.faculty_user_id
       JOIN users s ON s.user_id = o.student_user_id
       JOIN academic_courses c ON c.course_id = o.course_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = o.tenant_id
       WHERE o.tenant_id = $1
         AND o.status = 'PENDING'
         AND o.faculty_user_id IN (SELECT u.user_id FROM users u WHERE 1=1 ${clause})
       ORDER BY o.created_at ASC`,
      [tenantId, ...params],
    );

    return {
      scope,
      tab: 'ATTENDANCE_OVERRIDE',
      count: rows.length,
      items: rows.map((r: Record<string, unknown>) => ({
        id: r.request_id,
        request_id: r.request_id,
        request_type: 'ATTENDANCE_OVERRIDE',
        leave_type: 'Attendance Adjustment',
        applied_date: r.date,
        raised_on: r.created_at,
        reason: `${r.student_name} in ${r.course_code}`,
        status: r.status,
        employee: {
          name: r.employee_name,
          email: r.employee_email,
          employee_id: r.employee_id,
        },
      })),
    };
  }

  async bulkActOnRequests(
    managerId: string,
    tenantId: string,
    ids: string[],
    action: 'APPROVE' | 'REJECT',
    comment?: string,
    tab?: string,
    roles: string[] = [],
  ) {
    if (!(await this.assertTeamApprovalAccess(managerId, tenantId, roles))) {
      throw new BadRequestException(
        'Team approval features are not enabled for your account',
      );
    }
    if (!ids.length) throw new BadRequestException('No requests selected');
    const tabKey = (tab?.toUpperCase() ?? 'LEAVE') as TeamRequestTab;

    if (tabKey === 'DOCUMENT') {
      const status = action === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
      await this.dataSource.query(
        `UPDATE hr_employee_documents SET verification_status = $1 WHERE document_id = ANY($2::uuid[])`,
        [status, ids],
      );
      return { processed: ids.length, action, tab: tabKey };
    }

    if (tabKey === 'APPRAISAL') {
      const status = action === 'APPROVE' ? 'HR_APPROVED' : 'RETURNED';
      await this.dataSource.query(
        `UPDATE hr_employee_appraisals SET hr_final_status = $1 WHERE appraisal_record_id = ANY($2::uuid[])`,
        [status, ids],
      );
      return { processed: ids.length, action, tab: tabKey };
    }

    if (tabKey === 'ATTENDANCE_OVERRIDE') {
      const status = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';
      await this.dataSource.query(
        `UPDATE course_attendance_overrides SET status = $1 WHERE request_id = ANY($2::uuid[])`,
        [status, ids],
      );

      if (action === 'APPROVE') {
        const rows = await this.dataSource.query<
          Array<{
            request_id: string;
            tenant_id: string;
            course_id: string;
            faculty_user_id: string;
            student_user_id: string;
            date: string;
          }>
        >(
          `SELECT request_id, tenant_id, course_id, faculty_user_id, student_user_id, date FROM course_attendance_overrides WHERE request_id = ANY($1::uuid[])`,
          [ids],
        );

        for (const r of rows) {
          // Log it as present
          await this.dataSource.query(
            `INSERT INTO course_attendance_logs (tenant_id, course_id, faculty_user_id, date, attendance_data)
             VALUES ($1, $2, $3, $4, $5::jsonb)
             ON CONFLICT (tenant_id, course_id, faculty_user_id, date) DO UPDATE SET
               attendance_data = (
                 SELECT jsonb_agg(
                   CASE
                     WHEN elem->>'student_id' = $6 THEN jsonb_build_object('student_id', $6, 'status', 'PRESENT')
                     ELSE elem
                   END
                 )
                 FROM jsonb_array_elements(
                   CASE
                     WHEN jsonb_typeof(course_attendance_logs.attendance_data) = 'array' THEN course_attendance_logs.attendance_data
                     ELSE '[]'::jsonb
                   END
                 ) AS elem
               ) || (
                 SELECT CASE
                   WHEN NOT EXISTS (
                     SELECT 1 FROM jsonb_array_elements(
                       CASE
                         WHEN jsonb_typeof(course_attendance_logs.attendance_data) = 'array' THEN course_attendance_logs.attendance_data
                         ELSE '[]'::jsonb
                       END
                     ) AS e WHERE e->>'student_id' = $6
                   )
                   THEN jsonb_build_array(jsonb_build_object('student_id', $6, 'status', 'PRESENT'))
                   ELSE '[]'::jsonb
                 END
               )`,
            [
              r.tenant_id,
              r.course_id,
              r.faculty_user_id,
              r.date,
              JSON.stringify([
                { student_id: r.student_user_id, status: 'PRESENT' },
              ]),
              r.student_user_id,
            ],
          );

          // Need to recalculate percents. Let's just do it directly.
          await this.dataSource.query(
            `WITH session_data AS (
               SELECT elem.value AS entry
               FROM course_attendance_logs cal
               CROSS JOIN LATERAL jsonb_array_elements(cal.attendance_data) AS elem
               WHERE cal.tenant_id = $1 AND cal.course_id = $2
             ),
             student_stats AS (
               SELECT
                 entry->>'student_id' AS student_id,
                 COUNT(*)::int AS total_sessions,
                 SUM(
                   CASE WHEN entry->>'status' IN ('PRESENT', 'LATE', 'EXCUSED') THEN 1 ELSE 0 END
                 )::int AS present_sessions
               FROM session_data
               GROUP BY entry->>'student_id'
             )
             UPDATE student_course_enrollments e
             SET attendance_percent = CASE
                 WHEN s.total_sessions = 0 THEN 0
                 ELSE ROUND((s.present_sessions::numeric / s.total_sessions) * 100, 2)
               END
             FROM student_stats s
             WHERE e.tenant_id = $1
               AND e.course_id = $2
               AND e.student_user_id::text = s.student_id`,
            [r.tenant_id, r.course_id],
          );
        }
      }

      return { processed: ids.length, action, tab: tabKey };
    }

    const results: unknown[] = [];
    for (const leaveId of ids) {
      const row = await this.workforce.actOnTeamRequest(
        managerId,
        tenantId,
        leaveId,
        action,
        comment,
      );
      results.push(row);
    }
    return { processed: results.length, action, tab: tabKey };
  }

  async sendAttentionAction(
    managerId: string,
    tenantId: string,
    targetUserId: string,
    action: 'WARNING_EMAIL' | 'SCHEDULE_1ON1',
    message?: string,
  ) {
    const manager = await this.dataSource.query(
      `SELECT name FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [managerId, tenantId],
    );
    const staff = await this.dataSource.query(
      `SELECT name, official_email FROM users WHERE user_id = $1 AND tenant_id = $2`,
      [targetUserId, tenantId],
    );
    if (!staff[0]) throw new BadRequestException('Team member not found');

    const title =
      action === 'WARNING_EMAIL'
        ? 'Attendance concern — manager notice'
        : '1-on-1 meeting scheduled';
    const body =
      message ??
      (action === 'WARNING_EMAIL'
        ? `${manager[0]?.name ?? 'Your manager'} has flagged attendance patterns that need attention. Please connect at the earliest.`
        : `${manager[0]?.name ?? 'Your manager'} would like to schedule a 1-on-1 to discuss attendance and workload.`);

    await this.dataSource.query(
      `INSERT INTO falcon_notifications (tenant_id, user_id, category, title, message, action_link)
       VALUES ($1, $2, 'HR', $3, $4, '/ess/calendar')`,
      [tenantId, targetUserId, title, body],
    );

    if (action === 'WARNING_EMAIL') {
      this.notify.attendanceWarning({
        tenantId,
        userId: targetUserId,
        title,
        message: body,
        actionLink: '/ess/calendar',
        attendancePercent: 0,
      });
    }

    return {
      ok: true,
      action,
      recipient: staff[0].official_email,
      notified: true,
    };
  }

  async listAllPendingForAdmin(tenantId: string, entityId?: number) {
    const entityClause =
      entityId != null ? ' AND (r.entity_id = $2 OR r.entity_id IS NULL)' : '';
    const params: unknown[] = [tenantId];
    if (entityId != null) params.push(entityId);

    const rows = await this.dataSource.query(
      `SELECT r.leave_id, r.request_type, r.leave_type, r.start_date, r.end_date,
              r.regularization_date, r.reason, r.status, r.applied_at, r.current_approver_user_id,
              u.name AS employee_name, p.employee_id,
              approver.name AS approver_name
       FROM staff_leave_requests r
       JOIN users u ON u.user_id = r.staff_user_id
       LEFT JOIN hr_employee_profiles p ON p.user_id = u.user_id AND p.tenant_id = r.tenant_id
       LEFT JOIN users approver ON approver.user_id = r.current_approver_user_id
       WHERE r.tenant_id = $1 AND r.status = 'PENDING'${entityClause}
       ORDER BY r.applied_at ASC`,
      params,
    );

    return { count: rows.length, items: rows };
  }

  async adminOverrideRequest(
    adminUserId: string,
    tenantId: string,
    leaveId: string,
    action: 'APPROVE' | 'REJECT',
    comment?: string,
  ) {
    return this.workforce.actOnTeamRequest(
      adminUserId,
      tenantId,
      leaveId,
      action,
      comment,
      {
        adminOverride: true,
      },
    );
  }

  async getMemberSummary(
    managerId: string,
    memberUserId: string,
    tenantId: string,
    scopeRaw?: string,
    month?: string,
  ) {
    const scope = parseTeamScope(scopeRaw);
    const monthKey = month ?? new Date().toISOString().slice(0, 7);
    const { year, start, end } = this.monthRange(monthKey);
    const members = await this.scope.listScopedUsers(
      managerId,
      tenantId,
      scope,
    );
    if (!members.some((m) => m.user_id === memberUserId)) {
      throw new ForbiddenException('Employee not in your reporting scope');
    }

    const entityRows = await this.dataSource.query<Array<{ entity_id: number }>>(
      `SELECT entity_id FROM hr_employee_profiles WHERE user_id = $1 AND tenant_id = $2 LIMIT 1`,
      [memberUserId, tenantId],
    );
    const entityId = Number(entityRows[0]?.entity_id ?? 1);

    const [attRows, leaveDaysRows, balanceRows, shiftRows] = await Promise.all([
      this.dataSource.query<
        Array<{
          date: string;
          calculated_status: string;
          total_hours: string | null;
        }>
      >(
        `SELECT date::text, calculated_status, total_hours::text
         FROM hr_daily_attendance
         WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
        [memberUserId, start, end],
      ),
      this.dataSource.query<Array<{ days: string }>>(
        `SELECT COALESCE(SUM(
           GREATEST(0, LEAST(end_date, $4::date) - GREATEST(start_date, $3::date) + 1)
         ), 0)::text AS days
         FROM staff_leave_requests
         WHERE staff_user_id = $1 AND tenant_id = $2
           AND request_type = 'LEAVE'
           AND status IN ('PENDING','HOD_APPROVED','HR_APPROVED')
           AND start_date <= $4 AND end_date >= $3`,
        [memberUserId, tenantId, start, end],
      ),
      this.dataSource.query<
        Array<{ leave_type: string; entitled: string; used: string }>
      >(
        `SELECT leave_type, entitled::text, used::text
         FROM hr_leave_balances
         WHERE user_id = $1 AND year = $2 AND leave_type IN ('CL','SL','EL')`,
        [memberUserId, year],
      ),
      this.dataSource.query<
        Array<{ start_time: string; end_time: string; shift_name: string }>
      >(
        `SELECT s.start_time::text, s.end_time::text, s.shift_name
         FROM hr_employee_profiles ep
         LEFT JOIN hr_shifts s ON s.shift_id = ep.shift_id
         WHERE ep.user_id = $1 AND ep.tenant_id = $2 LIMIT 1`,
        [memberUserId, tenantId],
      ),
    ]);

    const presentStatuses = new Set([
      'FULL_DAY',
      'LATE_COMING',
      'EARLY_GOING',
      'HALF_DAY',
    ]);
    let presentDays = 0;
    let lateArrivals = 0;
    let onTime = 0;
    let totalHours = 0;
    let hoursCount = 0;

    for (const row of attRows) {
      if (presentStatuses.has(row.calculated_status)) presentDays++;
      if (row.calculated_status === 'LATE_COMING') lateArrivals++;
      if (row.calculated_status === 'FULL_DAY') onTime++;
      const hrs = Number(row.total_hours ?? 0);
      if (hrs > 0) {
        totalHours += hrs;
        hoursCount++;
      }
    }

    const avgHours = hoursCount > 0 ? totalHours / hoursCount : 0;
    const leavesTaken = Number(leaveDaysRows[0]?.days ?? 0);

    let leaveAssigned = 0;
    let leaveBalance = 0;
    for (const b of balanceRows) {
      leaveAssigned += Number(b.entitled ?? 0);
      leaveBalance += Number(b.entitled ?? 0) - Number(b.used ?? 0);
    }

    const trend: Array<{ month: string; present_days: number; avg_hours: number }> =
      [];
    for (let i = 2; i >= 0; i--) {
      const d = new Date(year, this.monthRange(monthKey).monthNum - 1 - i, 1);
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const { start: tStart, end: tEnd } = this.monthRange(mKey);
      const rows = await this.dataSource.query<
        Array<{ calculated_status: string; total_hours: string | null }>
      >(
        `SELECT calculated_status, total_hours::text
         FROM hr_daily_attendance
         WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
        [memberUserId, tStart, tEnd],
      );
      let pDays = 0;
      let tHours = 0;
      let tCount = 0;
      for (const r of rows) {
        if (presentStatuses.has(r.calculated_status)) pDays++;
        const h = Number(r.total_hours ?? 0);
        if (h > 0) {
          tHours += h;
          tCount++;
        }
      }
      trend.push({
        month: mKey,
        present_days: pDays,
        avg_hours: tCount > 0 ? Math.round((tHours / tCount) * 100) / 100 : 0,
      });
    }

    const shift = shiftRows[0];
    const shiftTiming = shift
      ? `${shift.start_time?.slice(0, 5) ?? '09:00'} - ${shift.end_time?.slice(0, 5) ?? '17:00'}`
      : null;

    const calendars = await this.attendanceCalc.buildMonthCalendarsBatch(
      [memberUserId],
      monthKey,
      tenantId,
      entityId,
    );
    const cal = calendars.get(memberUserId);
    const workingDays = (cal?.days ?? []).filter(
      (d) =>
        d.calculated_status !== 'WEEK_OFF' &&
        d.calculated_status !== 'HOLIDAY',
    ).length;

    return {
      scope,
      month: monthKey,
      user_id: memberUserId,
      shift_timing: shiftTiming,
      leaves_taken: leavesTaken,
      leave_assigned: Math.round(leaveAssigned * 100) / 100,
      leave_balance: Math.round(leaveBalance * 100) / 100,
      present_days: presentDays,
      working_days: workingDays,
      late_arrivals: lateArrivals,
      on_time: onTime,
      avg_working_hours: Math.round(avgHours * 100) / 100,
      trend,
    };
  }
}
