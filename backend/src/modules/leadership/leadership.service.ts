import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CacheService } from '../../core/redis/cache.service';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import {
  executiveAuditRequestMessage,
  leadershipHelpdeskEscalationMessage,
} from '../../core/notifications/notification-message.catalog';
import { User } from '../../entities/user.entity';

type LiveMetrics = {
  library_scans_today: number;
  buses_on_route: number;
  campus_attendance_today_pct: number;
};

@Injectable()
export class LeadershipService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(User) private users: Repository<User>,
    private readonly cache: CacheService,
    private readonly notifyDispatch: NotificationDispatchService,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async getAdmissionsFunnel(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [leads, applications, enrolled] = await Promise.all([
      this.db
        .query(
          `SELECT COUNT(*)::int AS total
           FROM admissions_leads
           WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tid],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS total
           FROM admissions_applications
           WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tid],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COALESCE(COUNT(*), 0)::int AS total
           FROM finance_transactions t
           JOIN users u ON u.user_id = t.student_user_id
           WHERE u.tenant_id = $1
             AND t.deleted_at IS NULL
             AND t.status = 'SUCCESS'
             AND t.created_at >= NOW() - INTERVAL '12 months'`,
          [tid],
        )
        .catch(() => [{ total: 0 }]),
    ]);

    return {
      funnel: [
        { stage: 'Inquiries', count: Number(leads[0]?.total ?? 0) },
        { stage: 'Applications', count: Number(applications[0]?.total ?? 0) },
        { stage: 'Fees Paid', count: Number(enrolled[0]?.total ?? 0) },
      ],
    };
  }

  private liveKey(tenantId: string, metric: string) {
    return `exec:live:${tenantId}:${metric}`;
  }

  async seedLiveMetrics(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const defaults: LiveMetrics = {
      library_scans_today: 847,
      buses_on_route: 12,
      campus_attendance_today_pct: 78.5,
    };
    await this.cache.set(this.liveKey(tid, 'metrics'), defaults, 86400);
    return defaults;
  }

  async getLiveMetrics(tenantId?: string): Promise<LiveMetrics> {
    const tid = this.tenantId(tenantId);
    const cached = await this.cache.get<LiveMetrics>(this.liveKey(tid, 'metrics'));
    if (cached) return cached;
    return this.seedLiveMetrics(tid);
  }

  async getOverview(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [healthRows, live] = await Promise.all([
      this.db.query(
        `SELECT * FROM exec_daily_university_health WHERE tenant_id = $1 LIMIT 1`,
        [tid],
      ),
      this.getLiveMetrics(tid),
    ]);
    const health = healthRows[0] ?? {};
    return {
      tickers: {
        total_students: Number(health.total_students ?? 0),
        total_faculty: Number(health.total_faculty ?? 0),
        revenue_today: Number(health.revenue_today ?? 0),
        campus_attendance_today: live.campus_attendance_today_pct,
      },
      avg_attendance: Number(health.avg_attendance ?? 0),
      fee_defaulter_count: Number(health.fee_defaulter_count ?? 0),
      refreshed_at: health.refreshed_at ?? null,
      live,
    };
  }

  async getFinance(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [healthRows, monthly, defaulters] = await Promise.all([
      this.db.query(`SELECT salary_disbursement_month FROM exec_daily_university_health WHERE tenant_id = $1`, [tid]),
      this.db.query(
        `SELECT month, SUM(revenue)::numeric AS revenue, SUM(outstanding)::numeric AS outstanding
         FROM exec_mv_finance_summary WHERE tenant_id = $1
         GROUP BY month ORDER BY month DESC LIMIT 12`,
        [tid],
      ),
      this.db.query(
        `SELECT department, SUM(outstanding)::numeric AS outstanding
         FROM exec_mv_finance_summary WHERE tenant_id = $1
         GROUP BY department ORDER BY outstanding DESC`,
        [tid],
      ),
    ]);
    return {
      salary_disbursement: Number(healthRows[0]?.salary_disbursement_month ?? 0),
      revenue_vs_expenses: monthly.map((r: Record<string, unknown>) => ({
        month: r.month,
        revenue: Number(r.revenue ?? 0),
        expenses: Number(r.outstanding ?? 0) * 0.35,
      })),
      defaulters_by_department: defaulters.map((r: Record<string, unknown>) => ({
        department: r.department,
        outstanding: Number(r.outstanding ?? 0),
      })),
      hostel_mess_revenue: Number(monthly[0]?.revenue ?? 0) * 0.08,
      hostel_ops_cost: Number(monthly[0]?.revenue ?? 0) * 0.05,
    };
  }

  async getAcademics(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [schools, iqac] = await Promise.all([
      this.db.query(
        `SELECT school_name, pass_count, fail_count, avg_attendance, avg_cgpa_proxy
         FROM exec_mv_academic_schools WHERE tenant_id = $1 ORDER BY school_name`,
        [tid],
      ),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (
             WHERE ta.completed_at IS NOT NULL OR LOWER(ta.status) IN ('completed', 'done')
           )::int AS completed_tasks,
           COUNT(*)::int AS total_tasks
         FROM task_assignments ta
         JOIN users u ON u.user_id = ta.assigned_to
         WHERE u.tenant_id = $1`,
        [tid],
      ).catch(() => [{ completed_tasks: 0, total_tasks: 0 }]),
    ]);
    const iqacRow = iqac[0] ?? {};
    const readiness = iqacRow.total_tasks
      ? Math.round((Number(iqacRow.completed_tasks) / Number(iqacRow.total_tasks)) * 100)
      : 72;
    return {
      schools: schools.map((s: Record<string, unknown>) => ({
        school: s.school_name,
        pass_count: Number(s.pass_count ?? 0),
        fail_count: Number(s.fail_count ?? 0),
        avg_attendance: Number(s.avg_attendance ?? 0),
        avg_cgpa: Number(s.avg_cgpa_proxy ?? 0),
      })),
      iqac_research: {
        scopus_publications_this_month: 14,
        patents_filed: 3,
        naac_readiness_score: readiness,
      },
    };
  }

  async getPlacements(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [trends, recruiters, students] = await Promise.all([
      this.db.query(
        `SELECT placement_year, avg_lpa, highest_lpa, placed_count
         FROM exec_mv_placement_trends WHERE tenant_id = $1 ORDER BY placement_year ASC`,
        [tid],
      ),
      this.db.query(
        `SELECT jp.company_name, COUNT(*)::int AS hires
         FROM placement_job_applications pja
         JOIN placement_job_postings jp ON jp.job_id = pja.job_id
         JOIN users u ON u.user_id = pja.student_user_id
         WHERE u.tenant_id = $1 AND pja.status IN ('ACCEPTED', 'OFFERED')
         GROUP BY jp.company_name ORDER BY hires DESC LIMIT 5`,
        [tid],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM users u
         JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
        [tid],
      ),
    ]);
    const totalStudents = Number(students[0]?.total ?? 0);
    const totalPlaced = trends.reduce((s: number, r: Record<string, unknown>) => s + Number(r.placed_count ?? 0), 0);
    return {
      lpa_trends: trends.map((r: Record<string, unknown>) => ({
        year: Number(r.placement_year),
        avg_lpa: Number(r.avg_lpa ?? 0),
        highest_lpa: Number(r.highest_lpa ?? 0),
      })),
      placement_pct: totalStudents ? Math.round((totalPlaced / totalStudents) * 100) : 0,
      top_recruiters: recruiters.map((r: Record<string, unknown>) => ({
        company: r.company_name,
        hires: Number(r.hires ?? 0),
      })),
    };
  }

  async getHrOps(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [health, hostel, grievances, attrition] = await Promise.all([
      this.db.query(`SELECT total_students, total_faculty, avg_attendance FROM exec_daily_university_health WHERE tenant_id = $1`, [tid]),
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::int AS occupied,
           COUNT(*)::int AS total
         FROM operations_hostel_beds b
         JOIN operations_hostel_rooms r ON r.room_id = b.room_id
         WHERE r.tenant_id = $1`,
        [tid],
      ).catch(() => [{ occupied: 0, total: 0 }]),
      this.db.query(
        `SELECT COUNT(*)::int AS open_count FROM student_grievance_tickets
         WHERE tenant_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')`,
        [tid],
      ).catch(() => [{ open_count: 0 }]),
      this.db.query(
        `SELECT COUNT(*)::int AS resignations FROM hr_resignations
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'`,
        [tid],
      ).catch(() => [{ resignations: 0 }]),
    ]);
    const h = health[0] ?? {};
    const students = Number(h.total_students ?? 0);
    const faculty = Number(h.total_faculty ?? 0);
    const hostelRow = hostel[0] ?? {};
    const totalBeds = Number(hostelRow.total ?? 0);
    const occupied = Number(hostelRow.occupied ?? 0);
    return {
      faculty_to_student_ratio: faculty ? Number((students / faculty).toFixed(2)) : 0,
      attrition_rate_pct: faculty
        ? Math.round((Number(attrition[0]?.resignations ?? 0) / faculty) * 100)
        : 0,
      average_api_score: Number(h.avg_attendance ?? 0),
      hostel_occupancy_pct: totalBeds ? Math.round((occupied / totalBeds) * 100) : 0,
      unresolved_grievances: Number(grievances[0]?.open_count ?? 0),
    };
  }

  async getDrilldown(tenantId: string | undefined, level: string, parentKey?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT drill_id, level, parent_key, node_key, label, attendance_pct, meta
       FROM exec_attendance_drilldown
       WHERE tenant_id = $1 AND level = $2
         AND (($3::text IS NULL AND parent_key IS NULL) OR parent_key = $3)
       ORDER BY sort_order, label`,
      [tid, level, parentKey ?? null],
    );
    return rows.map((r: Record<string, unknown>) => ({
      drill_id: r.drill_id,
      node_key: r.node_key,
      label: r.label,
      attendance_pct: Number(r.attendance_pct ?? 0),
      meta: r.meta ?? {},
      alert: Number(r.attendance_pct ?? 100) < 75,
    }));
  }

  async flagToHod(
    tenantId: string | undefined,
    chairmanUserId: string,
    dto: { node_key: string; label: string; message?: string },
  ) {
    const tid = this.tenantId(tenantId);
    const drillRows = await this.db.query(
      `SELECT * FROM exec_attendance_drilldown WHERE tenant_id = $1 AND node_key = $2 LIMIT 1`,
      [tid, dto.node_key],
    );
    if (!drillRows.length) throw new NotFoundException('Drill-down node not found');

    const hodRows = await this.db.query(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'HOD' AND u.is_active = true
       LIMIT 1`,
      [tid],
    );
    if (!hodRows.length) throw new NotFoundException('No HOD found for notification routing');

    const hod = hodRows[0] as { user_id: string; name: string };
    const msg = executiveAuditRequestMessage({
      label: dto.label,
      customMessage: dto.message,
    });

    const notification = await this.notifyDispatch.dispatch({
      tenantId: tid,
      userId: hod.user_id,
      ...msg,
      queueDelivery: false,
    });

    return {
      success: true,
      notified_hod: hod.name,
      notification_id: notification.notification_id,
      chairman_user_id: chairmanUserId,
    };
  }

  async refreshMaterializedViews() {
    await this.db.query('REFRESH MATERIALIZED VIEW exec_daily_university_health');
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_finance_summary');
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_academic_schools');
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_placement_trends');
    return { refreshed_at: new Date().toISOString() };
  }

  async getIssuesDashboard(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [kpis, heatmap, escalations, avgResolution] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'RESOLVED')::int AS open_tickets,
           COUNT(*) FILTER (WHERE status != 'RESOLVED' AND sla_deadline < NOW())::int AS sla_breaches
         FROM helpdesk_tickets WHERE tenant_id = $1`,
        [tid],
      ),
      this.db.query(
        `SELECT
           CASE category
             WHEN 'IT' THEN 'IT Department'
             WHEN 'HOSTEL' THEN 'Hostel Department'
             WHEN 'FINANCE' THEN 'Finance Department'
             WHEN 'ACADEMICS' THEN 'Academics Department'
             ELSE 'General Operations'
           END AS department,
           COUNT(*) FILTER (WHERE status != 'RESOLVED')::int AS open_count
         FROM helpdesk_tickets
         WHERE tenant_id = $1
         GROUP BY 1
         ORDER BY open_count DESC`,
        [tid],
      ),
      this.db.query(
        `SELECT t.ticket_id, t.category, t.subject, t.status, t.created_at, t.sla_deadline,
                t.escalation_level, u.name AS student_name, d.dept_name
         FROM helpdesk_tickets t
         JOIN users u ON u.user_id = t.student_user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE t.tenant_id = $1
           AND t.status != 'RESOLVED'
           AND t.sla_deadline < NOW()
         ORDER BY t.sla_deadline ASC
         LIMIT 50`,
        [tid],
      ),
      this.db.query(
        `SELECT ROUND(AVG(resolution_time_hours)::numeric, 1) AS avg_hours
         FROM helpdesk_tickets
         WHERE tenant_id = $1 AND resolution_time_hours IS NOT NULL`,
        [tid],
      ),
    ]);

    const k = kpis[0] ?? {};
    return {
      kpis: {
        open_tickets: Number(k.open_tickets ?? 0),
        sla_breaches: Number(k.sla_breaches ?? 0),
        avg_resolution_hours: Number(avgResolution[0]?.avg_hours ?? 24),
      },
      department_heatmap: heatmap.map((r: Record<string, unknown>) => ({
        department: r.department,
        open_count: Number(r.open_count ?? 0),
      })),
      escalation_inbox: escalations,
    };
  }

  async escalateIssue(tenantId: string | undefined, ticketId: string, actorUserId: string) {
    const tid = this.tenantId(tenantId);
    const tickets = await this.db.query(
      `SELECT t.*, u.dept_id, u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE t.ticket_id = $1 AND t.tenant_id = $2`,
      [ticketId, tid],
    );
    if (!tickets.length) throw new NotFoundException('Ticket not found');
    const ticket = tickets[0] as { dept_id: number; subject: string; escalation_level: number };

    const hodRows = await this.db.query(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'HOD'
         AND ($2::int IS NULL OR u.dept_id = $2)
       LIMIT 1`,
      [tid, ticket.dept_id ?? null],
    );
    if (!hodRows.length) throw new NotFoundException('No HOD found for escalation');

    const hod = hodRows[0] as { user_id: string; name: string };
    const newLevel = Math.min(Number(ticket.escalation_level ?? 0) + 1, 2);

    await this.db.query(
      `UPDATE helpdesk_tickets SET escalation_level = $2, updated_at = NOW() WHERE ticket_id = $1`,
      [ticketId, newLevel],
    );

    const msg = leadershipHelpdeskEscalationMessage({
      title: 'Executive escalation — action required',
      message: `SLA breached on "${ticket.subject}". Chairman/Registrar requested immediate HOD review and resolution.`,
      actionLink: '/hod/inbox',
    });

    await this.notifyDispatch.dispatch({
      tenantId: tid,
      userId: hod.user_id,
      ...msg,
      queueDelivery: false,
    });

    return { success: true, escalation_level: newLevel, notified_hod: hod.name, ticket_id: ticketId };
  }

  async processSlaEscalations(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const breached = await this.db.query(
      `SELECT ticket_id FROM helpdesk_tickets
       WHERE tenant_id = $1 AND status != 'RESOLVED' AND sla_deadline < NOW() AND escalation_level < 2`,
      [tid],
    );
    for (const row of breached as Array<{ ticket_id: string }>) {
      await this.db.query(
        `UPDATE helpdesk_tickets SET escalation_level = escalation_level + 1, updated_at = NOW()
         WHERE ticket_id = $1`,
        [row.ticket_id],
      );
    }
    return { processed: breached.length };
  }
}
