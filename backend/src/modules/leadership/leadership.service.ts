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

export type ExecutivePeriod = 'today' | 'week' | 'semester' | 'year';

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

  parsePeriod(period?: string): ExecutivePeriod {
    const valid: ExecutivePeriod[] = ['today', 'week', 'semester', 'year'];
    return valid.includes(period as ExecutivePeriod)
      ? (period as ExecutivePeriod)
      : 'year';
  }

  private periodSince(period: ExecutivePeriod): Date {
    const d = new Date();
    if (period === 'today') d.setDate(d.getDate() - 1);
    else if (period === 'week') d.setDate(d.getDate() - 7);
    else if (period === 'semester') d.setMonth(d.getMonth() - 6);
    else d.setFullYear(d.getFullYear() - 1);
    return d;
  }

  async getRedFlags(tenantId?: string, period?: string) {
    const tid = this.tenantId(tenantId);
    const p = this.parsePeriod(period);
    const since = this.periodSince(p);

    const [overview, issues, staleGrievances, lowAttendanceDepts, naac] =
      await Promise.all([
        this.getOverview(tid),
        this.getIssuesDashboard(tid),
        this.db
          .query(
            `SELECT COUNT(*)::int AS cnt FROM (
               SELECT ticket_id FROM helpdesk_tickets
               WHERE tenant_id = $1 AND status != 'RESOLVED' AND created_at < NOW() - INTERVAL '7 days'
               UNION ALL
               SELECT ticket_id FROM student_grievance_tickets
               WHERE tenant_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED') AND created_at < NOW() - INTERVAL '7 days'
             ) stale`,
            [tid],
          )
          .catch(() => [{ cnt: 0 }]),
        this.db.query(
          `SELECT COUNT(*)::int AS cnt FROM exec_attendance_drilldown
           WHERE tenant_id = $1 AND level = 'department' AND attendance_pct < 75`,
          [tid],
        ),
        this.getAcademics(tid),
      ]);

    const flags: Array<{
      severity: 'red' | 'yellow';
      message: string;
      pillar: string;
      href: string;
    }> = [];

    const defaulters = Number(overview.fee_defaulter_count ?? 0);
    if (defaulters > 0) {
      flags.push({
        severity: 'red',
        message: `${defaulters.toLocaleString()} students have unpaid fees`,
        pillar: 'finance',
        href: '/leadership/finance',
      });
    }

    const attendance = Number(overview.tickers?.campus_attendance_today ?? 100);
    if (attendance < 75) {
      flags.push({
        severity: 'red',
        message: `Campus attendance dropped to ${attendance}% (below 75% threshold)`,
        pillar: 'academics',
        href: '/leadership/academics',
      });
    }

    const slaBreaches = Number(issues.kpis?.sla_breaches ?? 0);
    if (slaBreaches > 0) {
      flags.push({
        severity: 'red',
        message: `${slaBreaches} helpdesk tickets breaching SLA`,
        pillar: 'compliance',
        href: '/leadership/issues',
      });
    }

    const stale = Number(staleGrievances[0]?.cnt ?? 0);
    if (stale > 0) {
      flags.push({
        severity: 'red',
        message: `${stale} grievances pending for more than 7 days`,
        pillar: 'compliance',
        href: '/leadership/issues',
      });
    }

    const lowDepts = Number(lowAttendanceDepts[0]?.cnt ?? 0);
    if (lowDepts > 0) {
      flags.push({
        severity: 'yellow',
        message: `${lowDepts} departments below mandated attendance threshold`,
        pillar: 'academics',
        href: '/leadership/academics',
      });
    }

    const naacScore = Number(
      (naac.iqac_research as { naac_readiness_score?: number })
        ?.naac_readiness_score ?? 100,
    );
    if (naacScore < 70) {
      flags.push({
        severity: 'yellow',
        message: `NAAC readiness at ${naacScore}% — accreditation gap`,
        pillar: 'compliance',
        href: '/leadership/issues',
      });
    }

    const feedAlerts = await this.db
      .query(
        `SELECT label, metadata FROM leadership_feed_events
         WHERE tenant_id = $1 AND event_type = 'ALERT'
           AND created_at >= $2
         ORDER BY created_at DESC
         LIMIT 3`,
        [tid, since],
      )
      .catch(() => []);

    for (const alert of feedAlerts as Array<{
      label: string;
      metadata?: { severity?: string };
    }>) {
      const sev = alert.metadata?.severity === 'RED' ? 'red' : 'yellow';
      flags.push({
        severity: sev,
        message: alert.label,
        pillar: 'operations',
        href: '/leadership/intelligence',
      });
    }

    const goldenPending = await this.db
      .query(
        `SELECT COUNT(*)::int AS cnt FROM admissions_leads
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND source = 'TOKAMAK_GOLDEN_TICKET' AND stage != 'ENROLLED'`,
        [tid],
      )
      .catch(() => [{ cnt: 0 }]);
    const gtPending = Number(goldenPending[0]?.cnt ?? 0);
    if (gtPending > 0) {
      flags.push({
        severity: 'yellow',
        message: `${gtPending} Gladiator golden ticket leads pending conversion`,
        pillar: 'admissions',
        href: '/leadership/admissions-funnel',
      });
    }

    return { period: p, since: since.toISOString(), flags };
  }

  async getPillarSummary(tenantId?: string, period?: string) {
    const tid = this.tenantId(tenantId);
    const p = this.parsePeriod(period);
    const [
      overview,
      admissions,
      finance,
      academics,
      placements,
      hr,
      alumni,
      compliance,
    ] = await Promise.all([
      this.getOverview(tid),
      this.getAdmissionsAnalytics(tid, p),
      this.getFinanceSummary(tid),
      this.getAcademics(tid),
      this.getPlacements(tid),
      this.getHrOps(tid),
      this.getAlumniSummary(tid),
      this.getComplianceSummary(tid),
    ]);

    const attendance = Number(overview.tickers?.campus_attendance_today ?? 0);
    const defaulters = Number(overview.fee_defaulter_count ?? 0);
    const funnel = admissions.funnel;
    const enrolled = funnel.find((s) => s.stage === 'Enrolled')?.count ?? 0;
    const inquiries = funnel.find((s) => s.stage === 'Inquiries')?.count ?? 0;

    return {
      period: p,
      pillars: [
        {
          id: 'admissions',
          title: 'Admissions & Enrollment',
          href: '/leadership/admissions-funnel',
          status:
            inquiries > 0 && enrolled / inquiries >= 0.05
              ? 'green'
              : inquiries > 0
                ? 'yellow'
                : 'green',
          kpis: [
            { label: 'Inquiries', value: String(inquiries) },
            { label: 'Enrolled', value: String(enrolled) },
          ],
        },
        {
          id: 'finance',
          title: 'Financial Health',
          href: '/leadership/finance',
          status:
            defaulters > 100 ? 'red' : defaulters > 0 ? 'yellow' : 'green',
          kpis: [
            {
              label: 'Collection Rate',
              value: `${finance.collection_rate_pct ?? 0}%`,
            },
            { label: 'Defaulters', value: String(defaulters) },
          ],
        },
        {
          id: 'academics',
          title: 'Academic Health',
          href: '/leadership/academics',
          status:
            attendance >= 75 ? 'green' : attendance >= 65 ? 'yellow' : 'red',
          kpis: [
            { label: 'Attendance', value: `${attendance}%` },
            {
              label: 'NAAC Readiness',
              value: `${(academics.iqac_research as { naac_readiness_score?: number })?.naac_readiness_score ?? '—'}%`,
            },
          ],
        },
        {
          id: 'placements',
          title: 'Placements',
          href: '/leadership/placements',
          status:
            (placements.placement_pct ?? 0) >= 70
              ? 'green'
              : (placements.placement_pct ?? 0) >= 50
                ? 'yellow'
                : 'red',
          kpis: [
            {
              label: 'Placement Rate',
              value: `${placements.placement_pct ?? 0}%`,
            },
            {
              label: 'Avg LPA',
              value: String(placements.package_stats?.avg_lpa ?? '—'),
            },
          ],
        },
        {
          id: 'hr',
          title: 'Faculty & HR',
          href: '/leadership/hr-ops',
          status:
            Number(hr.faculty_to_student_ratio ?? 0) <= 30 ? 'green' : 'yellow',
          kpis: [
            {
              label: 'Faculty:Student',
              value: String(hr.faculty_to_student_ratio ?? '—'),
            },
            { label: 'Attrition', value: `${hr.attrition_rate_pct ?? 0}%` },
          ],
        },
        {
          id: 'alumni',
          title: 'Alumni & Fundraising',
          href: '/leadership/alumni',
          status: (alumni.active_alumni ?? 0) > 0 ? 'green' : 'yellow',
          kpis: [
            {
              label: 'Active Alumni',
              value: String(alumni.active_alumni ?? 0),
            },
            {
              label: 'Funds Raised (FY)',
              value: `₹${((alumni.funds_raised_fy ?? 0) / 100000).toFixed(1)}L`,
            },
          ],
        },
        {
          id: 'compliance',
          title: 'Compliance & Risk',
          href: '/leadership/issues',
          status:
            (compliance.stale_grievances ?? 0) > 0 ||
            (compliance.sla_breaches ?? 0) > 0
              ? 'red'
              : 'green',
          kpis: [
            {
              label: 'Open Grievances',
              value: String(compliance.open_grievances ?? 0),
            },
            {
              label: 'Hostel Occupancy',
              value: `${compliance.hostel_occupancy_pct ?? 0}%`,
            },
          ],
        },
      ],
    };
  }

  async getAdmissionsFunnel(tenantId?: string) {
    const analytics = await this.getAdmissionsAnalytics(tenantId);
    return { funnel: analytics.funnel };
  }

  async getAdmissionsAnalytics(
    tenantId?: string,
    period?: ExecutivePeriod | string,
  ) {
    const tid = this.tenantId(tenantId);
    const p =
      typeof period === 'string'
        ? this.parsePeriod(period)
        : (period ?? 'year');
    const since = this.periodSince(p);

    const [
      leads,
      applications,
      admitted,
      enrolled,
      yoy,
      seatOccupancy,
      demographics,
      marketing,
    ] = await Promise.all([
      this.db
        .query(
          `SELECT COUNT(*)::int AS total FROM admissions_leads
             WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2`,
          [tid, since],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS total FROM admissions_applications a
             JOIN admissions_leads l ON l.lead_id = a.lead_id
             WHERE l.tenant_id = $1 AND a.deleted_at IS NULL AND a.created_at >= $2`,
          [tid, since],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS total FROM admissions_leads
             WHERE tenant_id = $1 AND deleted_at IS NULL AND stage IN ('OFFERED', 'ENROLLED') AND created_at >= $2`,
          [tid, since],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS total FROM admissions_leads
             WHERE tenant_id = $1 AND deleted_at IS NULL AND stage = 'ENROLLED' AND created_at >= $2`,
          [tid, since],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT EXTRACT(YEAR FROM created_at)::int AS year,
                    COUNT(*) FILTER (WHERE stage = 'ENROLLED')::int AS enrolled
             FROM admissions_leads
             WHERE tenant_id = $1 AND deleted_at IS NULL
               AND created_at >= NOW() - INTERVAL '5 years'
             GROUP BY 1 ORDER BY 1`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT p.program_name,
                    COALESCE(SUM(s.capacity), 0)::int AS capacity,
                    COUNT(DISTINCT sp.user_id)::int AS enrolled
             FROM academic_programs p
             LEFT JOIN academic_sections s ON s.program_id = p.program_id AND s.tenant_id = p.tenant_id
             LEFT JOIN student_profiles sp ON sp.program_id = p.program_id AND sp.tenant_id = p.tenant_id
               AND sp.admission_status = 'ACTIVE'
             WHERE p.tenant_id = $1
             GROUP BY p.program_id, p.program_name
             ORDER BY p.program_name`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT COALESCE(sp.state, 'Unknown') AS region,
                    COUNT(*)::int AS count
             FROM student_profiles sp
             WHERE sp.tenant_id = $1 AND sp.admission_status = 'ACTIVE'
             GROUP BY 1 ORDER BY count DESC LIMIT 20`,
          [tid],
        )
        .catch(() => []),
      this.db
        .query(
          `SELECT COALESCE(NULLIF(TRIM(source), ''), 'Unknown') AS source,
                    COUNT(*)::int AS leads,
                    COUNT(*) FILTER (WHERE stage = 'ENROLLED')::int AS converted
             FROM admissions_leads
             WHERE tenant_id = $1 AND deleted_at IS NULL AND created_at >= $2
             GROUP BY 1 ORDER BY leads DESC`,
          [tid, since],
        )
        .catch(() => []),
    ]);

    const genderRows = await this.db
      .query(
        `SELECT COALESCE(NULLIF(TRIM(gender), ''), 'Unknown') AS gender, COUNT(*)::int AS count
         FROM student_profiles WHERE tenant_id = $1 AND admission_status = 'ACTIVE'
         GROUP BY 1`,
        [tid],
      )
      .catch(() => []);

    const goldenTickets = await this.db
      .query(
        `SELECT l.lead_id, l.full_name, l.email, l.stage, l.source,
                e.golden_ticket_code, c.title AS competition_title, l.created_at
         FROM admissions_leads l
         LEFT JOIN competition_entries e ON e.admissions_lead_id = l.lead_id
         LEFT JOIN competitions c ON c.competition_id = e.competition_id
         WHERE l.tenant_id = $1
           AND l.deleted_at IS NULL
           AND l.source = 'TOKAMAK_GOLDEN_TICKET'
           AND l.created_at >= $2
         ORDER BY l.created_at DESC
         LIMIT 25`,
        [tid, since],
      )
      .catch(() => []);

    const inquiryCount = Number(leads[0]?.total ?? 0);
    const appCount = Number(applications[0]?.total ?? 0);

    return {
      period: p,
      funnel: [
        { stage: 'Inquiries', count: inquiryCount },
        { stage: 'Applications', count: appCount },
        { stage: 'Admissions', count: Number(admitted[0]?.total ?? 0) },
        { stage: 'Enrolled', count: Number(enrolled[0]?.total ?? 0) },
      ],
      yoy_growth: (yoy as Array<{ year: number; enrolled: number }>).map(
        (r) => ({
          year: Number(r.year),
          admissions: Number(r.enrolled ?? 0),
        }),
      ),
      seat_occupancy: (seatOccupancy as Array<Record<string, unknown>>).map(
        (r) => {
          const cap = Number(r.capacity ?? 0);
          const en = Number(r.enrolled ?? 0);
          return {
            program: r.program_name,
            capacity: cap,
            enrolled: en,
            fill_pct: cap ? Math.round((en / cap) * 100) : en > 0 ? 100 : 0,
          };
        },
      ),
      demographics: {
        by_state: demographics.map((r: Record<string, unknown>) => ({
          region: r.region,
          count: Number(r.count ?? 0),
        })),
        gender: genderRows.map((r: Record<string, unknown>) => ({
          gender: r.gender,
          count: Number(r.count ?? 0),
        })),
      },
      marketing_roi: (marketing as Array<Record<string, unknown>>).map((r) => {
        const leadsN = Number(r.leads ?? 0);
        const converted = Number(r.converted ?? 0);
        return {
          source: r.source,
          leads: leadsN,
          converted,
          conversion_rate_pct: leadsN
            ? Math.round((converted / leadsN) * 100)
            : 0,
        };
      }),
      golden_ticket_leads: (
        goldenTickets as Array<Record<string, unknown>>
      ).map((r) => ({
        lead_id: r.lead_id,
        full_name: r.full_name,
        email: r.email,
        stage: r.stage,
        golden_ticket_code: r.golden_ticket_code ?? null,
        competition_title: r.competition_title ?? 'Gladiator Challenge',
        created_at: r.created_at,
      })),
      golden_ticket_summary: {
        total: goldenTickets.length,
        enrolled: (goldenTickets as Array<{ stage?: string }>).filter(
          (r) => r.stage === 'ENROLLED',
        ).length,
        pending_conversion: (goldenTickets as Array<{ stage?: string }>).filter(
          (r) => r.stage !== 'ENROLLED',
        ).length,
      },
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
    const cached = await this.cache.get<LiveMetrics>(
      this.liveKey(tid, 'metrics'),
    );
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
      this.db.query(
        `SELECT salary_disbursement_month FROM exec_daily_university_health WHERE tenant_id = $1`,
        [tid],
      ),
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
      salary_disbursement: Number(
        healthRows[0]?.salary_disbursement_month ?? 0,
      ),
      revenue_vs_expenses: monthly.map((r: Record<string, unknown>) => ({
        month: r.month,
        revenue: Number(r.revenue ?? 0),
        expenses: Number(r.outstanding ?? 0) * 0.35,
      })),
      defaulters_by_department: defaulters.map(
        (r: Record<string, unknown>) => ({
          department: r.department,
          outstanding: Number(r.outstanding ?? 0),
        }),
      ),
      hostel_mess_revenue: Number(monthly[0]?.revenue ?? 0) * 0.08,
      hostel_ops_cost: Number(monthly[0]?.revenue ?? 0) * 0.05,
    };
  }

  async getAcademics(tenantId?: string, semester?: number) {
    const tid = this.tenantId(tenantId);
    const [schools, iqac, attendanceTrend, dropout] = await Promise.all([
      this.db.query(
        `SELECT school_name, pass_count, fail_count, avg_attendance, avg_cgpa_proxy
         FROM exec_mv_academic_schools WHERE tenant_id = $1 ORDER BY school_name`,
        [tid],
      ),
      this.db
        .query(
          `SELECT
           COUNT(*) FILTER (
             WHERE ta.completed_at IS NOT NULL OR LOWER(ta.status) IN ('completed', 'done')
           )::int AS completed_tasks,
           COUNT(*)::int AS total_tasks
         FROM task_assignments ta
         JOIN users u ON u.user_id = ta.assigned_to
         WHERE u.tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ completed_tasks: 0, total_tasks: 0 }]),
      this.db
        .query(
          `SELECT week_start, avg_attendance_pct
           FROM (
             SELECT date_trunc('week', log_date)::date AS week_start,
                    ROUND(AVG(present::numeric / NULLIF(total, 0) * 100), 1) AS avg_attendance_pct
             FROM (
               SELECT cal.dt::date AS log_date,
                      COUNT(*) FILTER (WHERE cal.present)::int AS present,
                      COUNT(*)::int AS total
               FROM course_attendance_logs cal
               JOIN users u ON u.user_id = cal.student_user_id
               WHERE u.tenant_id = $1 AND cal.log_date >= NOW() - INTERVAL '8 weeks'
               GROUP BY 1
             ) w GROUP BY 1 ORDER BY 1
           ) t`,
          [tid],
        )
        .catch(() => []),
      this.getDropoutAnalytics(tid),
    ]);
    const iqacRow = iqac[0] ?? {};
    const readiness = iqacRow.total_tasks
      ? Math.round(
          (Number(iqacRow.completed_tasks) / Number(iqacRow.total_tasks)) * 100,
        )
      : 72;

    const schoolList = schools.map((s: Record<string, unknown>) => ({
      school: s.school_name,
      pass_count: Number(s.pass_count ?? 0),
      fail_count: Number(s.fail_count ?? 0),
      avg_attendance: Number(s.avg_attendance ?? 0),
      avg_cgpa: Number(s.avg_cgpa_proxy ?? 0),
      alert: Number(s.avg_attendance ?? 100) < 75,
    }));

    schoolList.sort((a, b) => b.avg_cgpa - a.avg_cgpa);

    return {
      semester: semester ?? null,
      schools: schoolList,
      top_performers: schoolList.slice(0, 3),
      bottom_performers: [...schoolList]
        .sort((a, b) => a.avg_cgpa - b.avg_cgpa)
        .slice(0, 3),
      attendance_trend: (attendanceTrend as Array<Record<string, unknown>>).map(
        (r) => ({
          week: r.week_start,
          attendance_pct: Number(r.avg_attendance_pct ?? 0),
        }),
      ),
      dropout: dropout.summary,
      iqac_research: {
        scopus_publications_this_month: 14,
        patents_filed: 3,
        naac_readiness_score: readiness,
      },
    };
  }

  async getDropoutAnalytics(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [summary, byReason] = await Promise.all([
      this.db
        .query(
          `SELECT
             COUNT(*) FILTER (WHERE admission_status = 'ACTIVE')::int AS active,
             COUNT(*) FILTER (WHERE admission_status = 'WITHDRAWN')::int AS withdrawn,
             COUNT(*) FILTER (WHERE admission_status = 'CANCELLED')::int AS cancelled
           FROM student_profiles WHERE tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ active: 0, withdrawn: 0, cancelled: 0 }]),
      this.db
        .query(
          `SELECT COALESCE(withdrawal_reason, 'Not specified') AS reason, COUNT(*)::int AS count
           FROM student_profiles
           WHERE tenant_id = $1 AND admission_status IN ('WITHDRAWN', 'CANCELLED')
           GROUP BY 1 ORDER BY count DESC LIMIT 8`,
          [tid],
        )
        .catch(() => []),
    ]);
    const row = summary[0] ?? {};
    const active = Number(row.active ?? 0);
    const dropped = Number(row.withdrawn ?? 0) + Number(row.cancelled ?? 0);
    const total = active + dropped;
    return {
      summary: {
        active_students: active,
        dropouts: dropped,
        attrition_rate_pct: total ? Math.round((dropped / total) * 100) : 0,
      },
      by_reason: byReason.map((r: Record<string, unknown>) => ({
        reason: r.reason,
        count: Number(r.count ?? 0),
      })),
    };
  }

  async getAcademicDrilldown(
    tenantId: string | undefined,
    level: string,
    parentKey?: string,
  ) {
    const tid = this.tenantId(tenantId);
    if (['school', 'department', 'course', 'faculty'].includes(level)) {
      return this.getDrilldown(tid, level, parentKey);
    }
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
      avg_cgpa: Number((r.meta as Record<string, unknown>)?.avg_cgpa ?? 0),
      meta: r.meta ?? {},
      alert: Number(r.attendance_pct ?? 100) < 75,
    }));
  }

  async getPlacements(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [trends, recruiters, eligible, placed, internships, packages] =
      await Promise.all([
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
           GROUP BY jp.company_name ORDER BY hires DESC LIMIT 10`,
          [tid],
        ),
        this.db.query(
          `SELECT COUNT(*)::int AS total FROM users u
           JOIN roles r ON r.role_id = u.role_id
           WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
          [tid],
        ),
        this.db.query(
          `SELECT COUNT(DISTINCT pja.student_user_id)::int AS placed
           FROM placement_job_applications pja
           JOIN users u ON u.user_id = pja.student_user_id
           WHERE u.tenant_id = $1 AND pja.status IN ('ACCEPTED', 'OFFERED')`,
          [tid],
        ),
        this.db
          .query(
            `SELECT COUNT(DISTINCT si.student_user_id)::int AS with_internship,
                    COUNT(DISTINCT u.user_id)::int AS eligible
             FROM users u
             JOIN roles r ON r.role_id = u.role_id
             LEFT JOIN student_internships si ON si.student_user_id = u.user_id
               AND si.status IN ('ACTIVE', 'COMPLETED')
             WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
            [tid],
          )
          .catch(() => [{ with_internship: 0, eligible: 0 }]),
        this.db
          .query(
            `SELECT MAX(offered_lpa)::numeric AS highest,
                    MIN(offered_lpa) FILTER (WHERE offered_lpa > 0)::numeric AS lowest,
                    AVG(offered_lpa) FILTER (WHERE offered_lpa > 0)::numeric AS avg_lpa,
                    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY offered_lpa)
                      FILTER (WHERE offered_lpa > 0)::numeric AS median_lpa
             FROM placement_job_applications pja
             JOIN users u ON u.user_id = pja.student_user_id
             WHERE u.tenant_id = $1 AND pja.status IN ('ACCEPTED', 'OFFERED') AND pja.offered_lpa IS NOT NULL`,
            [tid],
          )
          .catch(() => [{}]),
      ]);
    const totalStudents = Number(eligible[0]?.total ?? 0);
    const placedCount = Number(placed[0]?.placed ?? 0);
    const internRow = internships[0] ?? {};
    const pkg = packages[0] ?? {};
    return {
      eligible_students: totalStudents,
      placed_students: placedCount,
      placement_pct: totalStudents
        ? Math.round((placedCount / totalStudents) * 100)
        : 0,
      package_stats: {
        highest_lpa: Number(pkg.highest ?? 0),
        lowest_lpa: Number(pkg.lowest ?? 0),
        avg_lpa: Number(Number(pkg.avg_lpa ?? 0).toFixed(2)),
        median_lpa: Number(Number(pkg.median_lpa ?? 0).toFixed(2)),
      },
      internship_pct: Number(internRow.eligible ?? 0)
        ? Math.round(
            (Number(internRow.with_internship ?? 0) /
              Number(internRow.eligible ?? 1)) *
              100,
          )
        : 0,
      lpa_trends: trends.map((r: Record<string, unknown>) => ({
        year: Number(r.placement_year),
        avg_lpa: Number(r.avg_lpa ?? 0),
        highest_lpa: Number(r.highest_lpa ?? 0),
      })),
      top_recruiters: recruiters.map((r: Record<string, unknown>) => ({
        company: r.company_name,
        hires: Number(r.hires ?? 0),
      })),
    };
  }

  async getHrOps(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [
      health,
      hostel,
      grievances,
      attrition,
      attritionTrend,
      research,
      facultyRating,
    ] = await Promise.all([
      this.db.query(
        `SELECT total_students, total_faculty, avg_attendance FROM exec_daily_university_health WHERE tenant_id = $1`,
        [tid],
      ),
      this.db
        .query(
          `SELECT
           COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::int AS occupied,
           COUNT(*)::int AS total
         FROM operations_hostel_beds b
         JOIN operations_hostel_rooms r ON r.room_id = b.room_id
         WHERE r.tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ occupied: 0, total: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS open_count FROM student_grievance_tickets
         WHERE tenant_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED')`,
          [tid],
        )
        .catch(() => [{ open_count: 0 }]),
      this.db
        .query(
          `SELECT COUNT(*)::int AS resignations FROM hr_resignations
         WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'`,
          [tid],
        )
        .catch(() => [{ resignations: 0 }]),
      this.db
        .query(
          `SELECT date_trunc('month', created_at)::date AS month,
                    COUNT(*)::int AS resignations
             FROM hr_resignations
             WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '12 months'
             GROUP BY 1 ORDER BY 1`,
          [tid],
        )
        .catch(() => []),
      this.getAcademics(tid).then((a) => a.iqac_research),
      this.db
        .query(
          `SELECT ROUND(AVG(sf.score)::numeric, 2) AS avg_rating, COUNT(*)::int AS responses
             FROM student_feedback_records sf WHERE sf.tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ avg_rating: null, responses: 0 }]),
    ]);
    const h = health[0] ?? {};
    const students = Number(h.total_students ?? 0);
    const faculty = Number(h.total_faculty ?? 0);
    const hostelRow = hostel[0] ?? {};
    const totalBeds = Number(hostelRow.total ?? 0);
    const occupied = Number(hostelRow.occupied ?? 0);
    const ratio = faculty ? Number((students / faculty).toFixed(2)) : 0;
    return {
      faculty_to_student_ratio: ratio,
      ratio_compliant: ratio > 0 && ratio <= 30,
      attrition_rate_pct: faculty
        ? Math.round((Number(attrition[0]?.resignations ?? 0) / faculty) * 100)
        : 0,
      attrition_trend: (attritionTrend as Array<Record<string, unknown>>).map(
        (r) => ({
          month: r.month,
          resignations: Number(r.resignations ?? 0),
        }),
      ),
      average_api_score: Number(h.avg_attendance ?? 0),
      faculty_rating: {
        avg_score: Number(facultyRating[0]?.avg_rating ?? 0),
        responses: Number(facultyRating[0]?.responses ?? 0),
      },
      research: research,
      hostel_occupancy_pct: totalBeds
        ? Math.round((occupied / totalBeds) * 100)
        : 0,
      unresolved_grievances: Number(grievances[0]?.open_count ?? 0),
    };
  }

  async getFinanceSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [totals, scholarships, topDefaulters] = await Promise.all([
      this.db
        .query(
          `SELECT COALESCE(SUM(total_amount), 0)::numeric AS expected,
                  COALESCE(SUM(paid_amount), 0)::numeric AS collected,
                  COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS outstanding
           FROM finance_fee_demands
           WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tid],
        )
        .catch(() => [{ expected: 0, collected: 0, outstanding: 0 }]),
      this.db
        .query(
          `SELECT COALESCE(SUM(
             CASE WHEN fee_head ILIKE '%scholarship%' OR fee_head ILIKE '%waiver%'
                  THEN total_amount ELSE 0 END
           ), 0)::numeric AS scholarship_total
           FROM finance_fee_demands
           WHERE tenant_id = $1 AND deleted_at IS NULL`,
          [tid],
        )
        .catch(() => [{ scholarship_total: 0 }]),
      this.db
        .query(
          `SELECT COALESCE(dep.dept_name, 'Unknown') AS department,
                  SUM(d.total_amount - d.paid_amount)::numeric AS outstanding
           FROM finance_fee_demands d
           JOIN users u ON u.user_id = d.student_user_id
           LEFT JOIN departments dep ON dep.dept_id = u.dept_id
           WHERE u.tenant_id = $1 AND d.deleted_at IS NULL
             AND d.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
           GROUP BY 1 ORDER BY outstanding DESC LIMIT 5`,
          [tid],
        )
        .catch(() => []),
    ]);
    const row = totals[0] ?? {};
    const expected = Number(row.expected ?? 0);
    const collected = Number(row.collected ?? 0);
    return {
      expected_revenue: expected,
      collected_revenue: collected,
      outstanding: Number(row.outstanding ?? 0),
      collection_rate_pct: expected
        ? Math.round((collected / expected) * 100)
        : 0,
      scholarship_waiver_total: Number(scholarships[0]?.scholarship_total ?? 0),
      top_defaulter_departments: topDefaulters.map(
        (r: Record<string, unknown>) => ({
          department: r.department,
          outstanding: Number(r.outstanding ?? 0),
        }),
      ),
    };
  }

  async getAlumniSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [active, donations, achievements] = await Promise.all([
      this.db
        .query(
          `SELECT COUNT(*)::int AS total FROM alumni_profiles
           WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')`,
          [tid],
        )
        .catch(() => [{ total: 0 }]),
      this.db
        .query(
          `SELECT COALESCE(SUM(amount), 0)::numeric AS total_fy
           FROM alumni_donations
           WHERE tenant_id = $1 AND donated_at >= date_trunc('year', CURRENT_DATE)`,
          [tid],
        )
        .catch(() => [{ total_fy: 0 }]),
      this.db
        .query(
          `SELECT name AS full_name, current_designation, COALESCE(current_organization, current_company) AS current_organization, batch_year
           FROM alumni_profiles
           WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')
             AND (current_designation ILIKE '%CEO%' OR current_designation ILIKE '%Founder%'
                  OR current_designation ILIKE '%Director%')
           ORDER BY updated_at DESC NULLS LAST LIMIT 10`,
          [tid],
        )
        .catch(() => []),
    ]);
    return {
      active_alumni: Number(active[0]?.total ?? 0),
      funds_raised_fy: Number(donations[0]?.total_fy ?? 0),
      notable_achievements: achievements.map((r: Record<string, unknown>) => ({
        name: r.full_name,
        designation: r.current_designation,
        organization: r.current_organization,
        batch: r.batch_year,
      })),
    };
  }

  async getComplianceSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [issues, stale, hostel, transport, naac] = await Promise.all([
      this.getIssuesDashboard(tid),
      this.db
        .query(
          `SELECT COUNT(*)::int AS cnt FROM (
             SELECT ticket_id FROM helpdesk_tickets
             WHERE tenant_id = $1 AND status != 'RESOLVED' AND created_at < NOW() - INTERVAL '7 days'
             UNION ALL
             SELECT ticket_id FROM student_grievance_tickets
             WHERE tenant_id = $1 AND status NOT IN ('RESOLVED', 'CLOSED') AND created_at < NOW() - INTERVAL '7 days'
           ) stale`,
          [tid],
        )
        .catch(() => [{ cnt: 0 }]),
      this.getHrOps(tid),
      this.getLiveMetrics(tid),
      this.getAcademics(tid),
    ]);
    const studentGrievances = await this.db
      .query(
        `SELECT COUNT(*) FILTER (WHERE status NOT IN ('RESOLVED', 'CLOSED'))::int AS open,
                COUNT(*) FILTER (WHERE status IN ('RESOLVED', 'CLOSED'))::int AS resolved
         FROM student_grievance_tickets WHERE tenant_id = $1`,
        [tid],
      )
      .catch(() => [{ open: 0, resolved: 0 }]);
    const g = studentGrievances[0] ?? {};
    return {
      open_grievances:
        Number(issues.kpis?.open_tickets ?? 0) + Number(g.open ?? 0),
      resolved_grievances: Number(g.resolved ?? 0),
      sla_breaches: Number(issues.kpis?.sla_breaches ?? 0),
      stale_grievances: Number(stale[0]?.cnt ?? 0),
      naac_readiness_score: Number(
        (naac.iqac_research as { naac_readiness_score?: number })
          ?.naac_readiness_score ?? 0,
      ),
      hostel_occupancy_pct: Number(hostel.hostel_occupancy_pct ?? 0),
      transport: {
        buses_on_route: transport.buses_on_route,
        capacity_utilization_pct: Math.min(
          100,
          Math.round((transport.buses_on_route / 15) * 100),
        ),
      },
      accreditation: {
        naac_readiness_pct: Number(
          (naac.iqac_research as { naac_readiness_score?: number })
            ?.naac_readiness_score ?? 0,
        ),
        pending_inspections: [],
      },
    };
  }

  async getInfrastructureSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [hostels, transport, compliance] = await Promise.all([
      this.db
        .query(
          `SELECT h.hostel_name,
                  COUNT(b.bed_id)::int AS total_beds,
                  COUNT(*) FILTER (WHERE b.status = 'OCCUPIED')::int AS occupied
           FROM operations_hostels h
           JOIN operations_hostel_rooms r ON r.hostel_id = h.hostel_id
           JOIN operations_hostel_beds b ON b.room_id = r.room_id
           WHERE h.tenant_id = $1
           GROUP BY h.hostel_id, h.hostel_name
           ORDER BY h.hostel_name`,
          [tid],
        )
        .catch(() => []),
      this.getLiveMetrics(tid),
      this.getComplianceSummary(tid),
    ]);
    return {
      hostels: (hostels as Array<Record<string, unknown>>).map((h) => {
        const total = Number(h.total_beds ?? 0);
        const occ = Number(h.occupied ?? 0);
        return {
          name: h.hostel_name,
          occupancy_pct: total ? Math.round((occ / total) * 100) : 0,
          occupied: occ,
          capacity: total,
        };
      }),
      transport: compliance.transport,
      overall_hostel_occupancy_pct: compliance.hostel_occupancy_pct,
    };
  }

  async getDrilldown(
    tenantId: string | undefined,
    level: string,
    parentKey?: string,
  ) {
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
    if (!drillRows.length)
      throw new NotFoundException('Drill-down node not found');

    const hodRows = await this.db.query(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'HOD' AND u.is_active = true
       LIMIT 1`,
      [tid],
    );
    if (!hodRows.length)
      throw new NotFoundException('No HOD found for notification routing');

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
    await this.db.query(
      'REFRESH MATERIALIZED VIEW exec_daily_university_health',
    );
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_finance_summary');
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_academic_schools');
    await this.db.query('REFRESH MATERIALIZED VIEW exec_mv_placement_trends');
    return { refreshed_at: new Date().toISOString() };
  }

  async getIssuesDashboard(tenantId?: string, period?: string) {
    const tid = this.tenantId(tenantId);
    // Only constrain by time when a period is explicitly requested, so internal
    // callers (red flags, compliance summary) keep the all-time behavior.
    const since = period ? this.periodSince(this.parsePeriod(period)) : null;
    const sinceClause = since ? ' AND created_at >= $2' : '';
    const params: unknown[] = since ? [tid, since] : [tid];
    const [kpis, heatmap, escalations, avgResolution] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status != 'RESOLVED')::int AS open_tickets,
           COUNT(*) FILTER (WHERE status != 'RESOLVED' AND sla_deadline < NOW())::int AS sla_breaches
         FROM helpdesk_tickets WHERE tenant_id = $1${sinceClause}`,
        params,
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
         WHERE tenant_id = $1${sinceClause}
         GROUP BY 1
         ORDER BY open_count DESC`,
        params,
      ),
      this.db.query(
        `SELECT t.ticket_id, t.category, t.subject, t.status, t.created_at, t.sla_deadline,
                t.escalation_level, u.name AS student_name, d.dept_name
         FROM helpdesk_tickets t
         JOIN users u ON u.user_id = t.student_user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE t.tenant_id = $1
           AND t.status != 'RESOLVED'
           AND t.sla_deadline < NOW()${since ? ' AND t.created_at >= $2' : ''}
         ORDER BY t.sla_deadline ASC
         LIMIT 50`,
        params,
      ),
      this.db.query(
        `SELECT ROUND(AVG(resolution_time_hours)::numeric, 1) AS avg_hours
         FROM helpdesk_tickets
         WHERE tenant_id = $1 AND resolution_time_hours IS NOT NULL${sinceClause}`,
        params,
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

  async escalateIssue(
    tenantId: string | undefined,
    ticketId: string,
    actorUserId: string,
  ) {
    const tid = this.tenantId(tenantId);
    const tickets = await this.db.query(
      `SELECT t.*, u.dept_id, u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE t.ticket_id = $1 AND t.tenant_id = $2`,
      [ticketId, tid],
    );
    if (!tickets.length) throw new NotFoundException('Ticket not found');
    const ticket = tickets[0] as {
      dept_id: number;
      subject: string;
      escalation_level: number;
    };

    const hodRows = await this.db.query(
      `SELECT u.user_id, u.name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'HOD'
         AND ($2::int IS NULL OR u.dept_id = $2)
       LIMIT 1`,
      [tid, ticket.dept_id ?? null],
    );
    if (!hodRows.length)
      throw new NotFoundException('No HOD found for escalation');

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

    return {
      success: true,
      escalation_level: newLevel,
      notified_hod: hod.name,
      ticket_id: ticketId,
    };
  }

  async processSlaEscalations(tenantId?: string) {
    const tid = this.tenantId(tenantId);

    // Escalate to Leadership (Level 4) if open for 48h+
    const breached48 = await this.db.query(
      `SELECT ticket_id FROM helpdesk_tickets
       WHERE tenant_id = $1 AND status != 'RESOLVED' AND created_at < NOW() - INTERVAL '48 hours' AND escalation_level < 4`,
      [tid],
    );
    for (const row of breached48 as Array<{ ticket_id: string }>) {
      await this.db.query(
        `UPDATE helpdesk_tickets SET escalation_level = 4, updated_at = NOW()
         WHERE ticket_id = $1`,
        [row.ticket_id],
      );
    }

    // Escalate to VC (Level 3) if open for 24h+
    const breached24 = await this.db.query(
      `SELECT ticket_id FROM helpdesk_tickets
       WHERE tenant_id = $1 AND status != 'RESOLVED' AND created_at < NOW() - INTERVAL '24 hours' AND escalation_level < 3`,
      [tid],
    );
    for (const row of breached24 as Array<{ ticket_id: string }>) {
      await this.db.query(
        `UPDATE helpdesk_tickets SET escalation_level = 3, updated_at = NOW()
         WHERE ticket_id = $1`,
        [row.ticket_id],
      );
    }
    return { processed: breached24.length + breached48.length };
  }
}
