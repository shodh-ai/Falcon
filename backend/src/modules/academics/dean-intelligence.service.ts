import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { AcademicsService } from './academics.service';
import { resolveDeanScope } from './dean-scope.util';
import {
  ListQueryParams,
  parseListQuery,
  toPaginatedResponse,
  type PaginatedResponse,
} from '../../common/utils/pagination';

type HealthColor = 'green' | 'yellow' | 'red';
type AlertPriority = 'critical' | 'warning' | 'information';
type TrendDirection = 'up' | 'down' | 'flat';

export type DeanFilterQuery = {
  dept_id?: string;
  academic_year?: string;
  semester?: string;
  faculty_user_id?: string;
  course_id?: string;
  date_from?: string;
  date_to?: string;
  status?: string;
};

@Injectable()
export class DeanIntelligenceService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly academics: AcademicsService,
  ) {}

  private clampScore(value: number) {
    return Math.round(Math.min(100, Math.max(0, value)));
  }

  private healthColor(score: number): HealthColor {
    if (score >= 80) return 'green';
    if (score >= 60) return 'yellow';
    return 'red';
  }

  private computeCompositeScore(factors: {
    attendance: number;
    results: number;
    syllabus: number;
    workloadBalance: number;
    approvalHealth: number;
    studentSafety: number;
    placement: number;
  }) {
    const raw =
      factors.attendance * 0.2 +
      factors.results * 0.15 +
      factors.syllabus * 0.15 +
      factors.workloadBalance * 0.15 +
      factors.approvalHealth * 0.1 +
      factors.studentSafety * 0.15 +
      factors.placement * 0.1;
    return this.clampScore(raw);
  }

  private parseDeptFilter(
    departmentIds: number[],
    deptId?: string,
  ): number[] {
    if (!deptId || deptId === 'ALL') return departmentIds;
    const parsed = Number(deptId);
    if (!Number.isFinite(parsed) || !departmentIds.includes(parsed)) {
      return departmentIds;
    }
    return [parsed];
  }

  async getDashboardIntelligence(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);

    const [commandCenter, results, weeklyAttendance, placementSummary, recentActivity] =
      await Promise.all([
        this.academics.getDeanCommandCenter(tenantId, deanUserId),
        this.academics.listDeanResultAnalytics(tenantId, deanUserId),
        this.safeWeeklyAttendance(tenantId, deptIds),
        this.safePlacementSummary(tenantId, deptIds),
        this.getActivityFeed(tenantId, deanUserId, { limit: 12 }),
      ]);

    const departments = (commandCenter.department_rows ?? []).filter((row) =>
      deptIds.includes(Number(row.dept_id)),
    );
    const workload = (commandCenter.workload_rows ?? []).filter((row) =>
      deptIds.includes(Number(row.dept_id)),
    );

    const hm = commandCenter.health_metrics;
    const avgPass =
      results.length > 0
        ? results.reduce((sum, row) => sum + Number(row.pass_percent ?? 0), 0) /
          results.length
        : 85;
    const avgSyllabus =
      commandCenter.syllabus_coverage.length > 0
        ? commandCenter.syllabus_coverage.reduce(
            (sum, row) => sum + Number(row.coverage_percent ?? 0),
            0,
          ) / commandCenter.syllabus_coverage.length
        : hm.average_attendance;
    const workloadSummary = commandCenter.faculty_workload_summary ?? {
      balanced: 0,
      overloaded: 0,
      underloaded: 0,
    };
    const totalFacultyWorkload =
      workloadSummary.balanced +
      workloadSummary.overloaded +
      workloadSummary.underloaded;
    const balancedPct =
      totalFacultyWorkload > 0
        ? (workloadSummary.balanced / totalFacultyWorkload) * 100
        : 100;
    const pendingCount = hm.pending_dean_approvals ?? hm.pending_inbox_total ?? 0;
    const approvalHealth = this.clampScore(
      100 - Math.min(40, pendingCount * 4),
    );
    const totalStudents = Math.max(hm.total_students, 1);
    const atRiskStudents = commandCenter.attendance_deficits.length;
    const studentSafety = this.clampScore(
      100 - (atRiskStudents / totalStudents) * 100,
    );

    const schoolHealthScore = this.computeCompositeScore({
      attendance: hm.average_attendance,
      results: avgPass,
      syllabus: avgSyllabus,
      workloadBalance: balancedPct,
      approvalHealth,
      studentSafety,
      placement: placementSummary.placement_pct,
    });

    const prevScore = this.clampScore(
      schoolHealthScore - (hm.attendance_trend_pct ?? 0) / 2,
    );
    const trendDelta = schoolHealthScore - prevScore;

    const departmentRankings = this.buildDepartmentRankings(
      departments,
      workload,
      results,
      placementSummary.by_department,
    );

    const alerts = this.buildAlerts({
      hm,
      departments,
      workload,
      syllabus: commandCenter.syllabus_coverage,
      pendingCount,
      placementSummary,
      atRiskStudents,
    });

    const recommendations = this.buildRecommendations(alerts, departments);

    return {
      schools: scope.schools,
      filters: { ...filters, available_departments: departments },
      departments,
      school_health: {
        score: schoolHealthScore,
        color: this.healthColor(schoolHealthScore),
        trend_delta: trendDelta,
        trend_label:
          trendDelta >= 0
            ? `Improved ${Math.abs(trendDelta)}% from last month`
            : `Declined ${Math.abs(trendDelta)}% from last month`,
        trend_direction: (trendDelta >= 0 ? 'up' : 'down') as TrendDirection,
        components: {
          attendance: hm.average_attendance,
          results: Number(avgPass.toFixed(1)),
          syllabus: Number(avgSyllabus.toFixed(1)),
          workload_balance: Number(balancedPct.toFixed(1)),
          approval_health: approvalHealth,
          student_safety: studentSafety,
          placement_readiness: placementSummary.placement_pct,
        },
      },
      department_rankings: departmentRankings,
      alerts,
      recommendations,
      recent_activity: recentActivity,
      analytics_preview: {
        attendance_trend: weeklyAttendance,
        result_trend: this.buildResultTrend(results),
        placement_trend: placementSummary.trend,
        faculty_growth: await this.safeFacultyGrowth(tenantId, deptIds),
        enrollment_trend: await this.safeEnrollmentTrend(tenantId, deptIds),
      },
      command_center: commandCenter,
    };
  }

  async getActivityFeed(
    tenantId: string,
    deanUserId: string,
    options: { limit?: number; module?: string } = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const limit = Math.min(Number(options.limit ?? 20), 100);

    try {
      const rows = await this.db.query<
        Array<{
          log_id: string;
          table_name: string;
          action: string;
          new_value: Record<string, unknown> | null;
          changed_at: string;
          user_name: string | null;
          dept_name: string | null;
        }>
      >(
        `SELECT l.log_id, l.table_name, l.action, l.new_value, l.changed_at,
                u.name AS user_name, d.dept_name
         FROM system_audit_logs l
         LEFT JOIN users u ON u.user_id = l.changed_by_user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE (u.tenant_id = $1 OR l.changed_by_user_id = $2)
           AND (u.dept_id IS NULL OR u.dept_id = ANY($3::int[]))
           AND ($4::text IS NULL OR l.table_name ILIKE $4)
         ORDER BY l.changed_at DESC
         LIMIT $5`,
        [
          tenantId,
          deanUserId,
          scope.departmentIds,
          options.module ? `%${options.module}%` : null,
          limit,
        ],
      );

      return rows.map((row) => ({
        id: row.log_id,
        user: row.user_name ?? 'System',
        department: row.dept_name ?? 'School',
        action:
          (row.new_value?.meta as Record<string, unknown> | undefined)?.action ??
          row.action,
        module: row.table_name,
        timestamp: row.changed_at,
        priority: this.activityPriority(String(row.table_name)),
        detail: row.new_value?.status
          ? String(row.new_value.status)
          : undefined,
      }));
    } catch {
      return [];
    }
  }

  private activityPriority(module: string): AlertPriority {
    if (['project_funding_requests', 'attendance_threshold_requests'].includes(module)) {
      return 'critical';
    }
    if (['helpdesk_tickets', 'campus_events'].includes(module)) {
      return 'warning';
    }
    return 'information';
  }

  async getFacultyLeaderboard(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);
    const [workload, appraisals] = await Promise.all([
      this.academics.listDeanFacultyWorkload(tenantId, deanUserId),
      this.academics.listDeanAppraisals(tenantId, deanUserId),
    ]);

    const appraisalByUser = new Map<string, Record<string, unknown>>(
      (appraisals.items ?? []).map((row) => [
        String((row as Record<string, unknown>).user_id),
        row as Record<string, unknown>,
      ]),
    );

    const researchRows = await this.safeResearchByFaculty(tenantId, deptIds);

    const rows = workload
      .filter((row) => deptIds.includes(Number(row.dept_id)))
      .map((row) => {
        const appraisal = appraisalByUser.get(String(row.user_id));
        const research = researchRows.get(String(row.user_id)) ?? {
          publications: 0,
          projects: 0,
        };
        const apiScore = Number(appraisal?.auto_api_score ?? 0);
        const feedback = Number(appraisal?.hod_rating ?? 0);
        const attendanceScore = Math.min(
          100,
          Math.max(60, 100 - (row.workload_status === 'OVERLOADED' ? 15 : 0)),
        );
        const performanceRating = this.clampScore(
          apiScore * 0.35 +
            feedback * 0.2 +
            attendanceScore * 0.15 +
            research.publications * 5 +
            (row.workload_status === 'BALANCED' ? 15 : 5),
        );
        return {
          user_id: row.user_id,
          name: row.name,
          department: row.dept_name,
          attendance_score: attendanceScore,
          student_feedback: feedback,
          research_score: research.publications + research.projects,
          api_score: apiScore,
          hours_per_week: row.hours_per_week,
          workload_status: row.workload_status,
          performance_rating: performanceRating,
        };
      })
      .sort((a, b) => b.performance_rating - a.performance_rating);

    const midpoint = Math.ceil(rows.length / 2) || 1;
    return {
      top_performers: rows.slice(0, midpoint),
      needs_improvement: [...rows]
        .sort((a, b) => a.performance_rating - b.performance_rating)
        .slice(0, Math.min(5, rows.length)),
      all: rows,
    };
  }

  async getSchoolAnalytics(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);
    const [weeklyAttendance, results, placement, budget, research] =
      await Promise.all([
        this.safeWeeklyAttendance(tenantId, deptIds),
        this.academics.listDeanResultAnalytics(tenantId, deanUserId),
        this.safePlacementSummary(tenantId, deptIds),
        this.getBudgetMonitoring(tenantId, deanUserId, filters),
        this.getResearchDashboard(tenantId, deanUserId, filters),
      ]);

    return {
      attendance_trend: weeklyAttendance,
      result_trend: this.buildResultTrend(results),
      placement_trend: placement.trend,
      faculty_growth: await this.safeFacultyGrowth(tenantId, deptIds),
      enrollment_trend: await this.safeEnrollmentTrend(tenantId, deptIds),
      research_growth: research.publication_trend,
      budget_utilization: budget.utilization_series,
    };
  }

  async getBudgetMonitoring(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);

    try {
      const rows = await this.db.query<
        Array<{
          budget_id: string;
          department_id: number | null;
          dept_name: string | null;
          allocated_amount: string;
          utilized_amount: string;
        }>
      >(
        `SELECT b.budget_id, b.department_id, d.dept_name,
                b.allocated_amount, b.utilized_amount
         FROM fin_dept_budgets b
         LEFT JOIN departments d ON d.dept_id = b.department_id
         WHERE b.tenant_id = $1
           AND b.deleted_at IS NULL
           AND (b.department_id IS NULL OR b.department_id = ANY($2::int[]))
         ORDER BY b.allocated_amount DESC`,
        [tenantId, deptIds],
      );

      const programRows = await this.db.query<
        Array<{ program_type: string; allocated_amount: string; utilized_amount: string }>
      >(
        `SELECT COALESCE(p.program_type, 'General') AS program_type,
                SUM(p.allocated_amount)::text AS allocated_amount,
                SUM(p.utilized_amount)::text AS utilized_amount
         FROM fin_program_budgets p
         INNER JOIN fin_dept_budgets b ON b.budget_id = p.budget_id
         WHERE b.tenant_id = $1
           AND b.deleted_at IS NULL
           AND (b.department_id IS NULL OR b.department_id = ANY($2::int[]))
         GROUP BY COALESCE(p.program_type, 'General')`,
        [tenantId, deptIds],
      ).catch(() => []);

      let allocated = 0;
      let spent = 0;
      const byDepartment: Array<Record<string, unknown>> = [];
      const byCategory = new Map<string, { allocated: number; spent: number }>();

      for (const row of rows) {
        const alloc = Number(row.allocated_amount ?? 0);
        const util = Number(row.utilized_amount ?? 0);
        allocated += alloc;
        spent += util;
        byDepartment.push({
          dept_name: row.dept_name ?? 'School-wide',
          allocated: alloc,
          spent: util,
          remaining: alloc - util,
          utilization_pct: alloc > 0 ? Number(((util / alloc) * 100).toFixed(1)) : 0,
        });
      }

      for (const row of programRows) {
        const cat = row.program_type ?? 'General';
        byCategory.set(cat, {
          allocated: Number(row.allocated_amount ?? 0),
          spent: Number(row.utilized_amount ?? 0),
        });
      }

      const alerts =
        allocated > 0 && spent / allocated > 0.9
          ? [
              {
                priority: 'critical' as AlertPriority,
                message: 'School budget utilization exceeds 90% threshold.',
              },
            ]
          : [];

      return {
        allocated_budget: allocated,
        spent_budget: spent,
        remaining_budget: allocated - spent,
        utilization_pct:
          allocated > 0 ? Number(((spent / allocated) * 100).toFixed(1)) : 0,
        department_wise: byDepartment,
        research_budget: byCategory.get('Research') ?? { allocated: 0, spent: 0 },
        lab_budget: byCategory.get('Lab') ?? { allocated: 0, spent: 0 },
        infrastructure_budget:
          byCategory.get('Infrastructure') ?? { allocated: 0, spent: 0 },
        alerts,
        utilization_series: byDepartment.slice(0, 8).map((row) => ({
          label: String(row.dept_name),
          allocated: Number(row.allocated),
          spent: Number(row.spent),
        })),
      };
    } catch {
      return {
        allocated_budget: 0,
        spent_budget: 0,
        remaining_budget: 0,
        utilization_pct: 0,
        department_wise: [],
        research_budget: { allocated: 0, spent: 0 },
        lab_budget: { allocated: 0, spent: 0 },
        infrastructure_budget: { allocated: 0, spent: 0 },
        alerts: [],
        utilization_series: [],
      };
    }
  }

  async getResearchDashboard(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);

    try {
      const [projects, publications, grants, facultyScores, deptRanking] =
        await Promise.all([
          this.db.query<Array<{ count: string }>>(
            `SELECT COUNT(*)::text AS count
             FROM faculty_research_projects p
             INNER JOIN users u ON u.user_id = p.principal_investigator_user_id
             WHERE p.tenant_id = $1 AND u.dept_id = ANY($2::int[])`,
            [tenantId, deptIds],
          ),
          this.db.query<Array<{ count: string }>>(
            `SELECT COUNT(*)::text AS count
             FROM faculty_research_logs l
             INNER JOIN users u ON u.user_id = l.faculty_user_id
             WHERE l.tenant_id = $1 AND u.dept_id = ANY($2::int[])`,
            [tenantId, deptIds],
          ),
          this.db.query<Array<{ total: string }>>(
            `SELECT COALESCE(SUM(p.grant_amount), 0)::text AS total
             FROM faculty_research_projects p
             INNER JOIN users u ON u.user_id = p.principal_investigator_user_id
             WHERE p.tenant_id = $1 AND u.dept_id = ANY($2::int[])`,
            [tenantId, deptIds],
          ),
          this.db.query<
            Array<{
              user_id: string;
              name: string;
              dept_name: string;
              score: string;
            }>
          >(
            `SELECT u.user_id, u.name, d.dept_name,
                    COUNT(l.log_id)::text AS score
             FROM users u
             LEFT JOIN departments d ON d.dept_id = u.dept_id
             LEFT JOIN faculty_research_logs l ON l.faculty_user_id = u.user_id
             WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
             GROUP BY u.user_id, u.name, d.dept_name
             ORDER BY COUNT(l.log_id) DESC, u.name ASC
             LIMIT 20`,
            [tenantId, deptIds],
          ),
          this.db.query<
            Array<{ dept_name: string; publications: string; projects: string }>
          >(
            `SELECT d.dept_name,
                    COUNT(DISTINCT l.log_id)::text AS publications,
                    COUNT(DISTINCT p.research_project_id)::text AS projects
             FROM departments d
             LEFT JOIN users u ON u.dept_id = d.dept_id
             LEFT JOIN faculty_research_logs l ON l.faculty_user_id = u.user_id
             LEFT JOIN faculty_research_projects p
               ON p.principal_investigator_user_id = u.user_id
             WHERE d.dept_id = ANY($1::int[])
             GROUP BY d.dept_name
             ORDER BY COUNT(DISTINCT l.log_id) DESC`,
            [deptIds],
          ),
        ]);

      const publicationTrend = await this.safeResearchTrend(tenantId, deptIds);

      return {
        projects: Number(projects[0]?.count ?? 0),
        patents: 0,
        publications: Number(publications[0]?.count ?? 0),
        research_grants: Number(grants[0]?.total ?? 0),
        industry_collaborations: 0,
        faculty_research_scores: facultyScores.map((row) => ({
          user_id: row.user_id,
          name: row.name,
          department: row.dept_name,
          score: Number(row.score ?? 0),
        })),
        department_ranking: deptRanking.map((row) => ({
          department: row.dept_name,
          publications: Number(row.publications ?? 0),
          projects: Number(row.projects ?? 0),
        })),
        publication_trend: publicationTrend,
      };
    } catch {
      return {
        projects: 0,
        patents: 0,
        publications: 0,
        research_grants: 0,
        industry_collaborations: 0,
        faculty_research_scores: [],
        department_ranking: [],
        publication_trend: [],
      };
    }
  }

  async getPlacementDashboard(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);
    return this.safePlacementSummary(tenantId, deptIds, true);
  }

  async getMeetingAnalytics(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery = {},
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const deptIds = this.parseDeptFilter(scope.departmentIds, filters.dept_id);

    try {
      const rows = await this.db.query<
        Array<{
          status: string;
          has_mom: boolean;
          dept_name: string | null;
          participant_count: string;
        }>
      >(
        `SELECT m.status,
                (pm.notes IS NOT NULL AND length(trim(pm.notes)) > 0) AS has_mom,
                d.dept_name,
                COUNT(DISTINCT mp.user_id)::text AS participant_count
         FROM portal_meetings m
         LEFT JOIN portal_meeting_participants mp ON mp.meeting_id = m.meeting_id
         LEFT JOIN portal_meeting_minutes pm ON pm.meeting_id = m.meeting_id
         LEFT JOIN users u ON u.user_id = mp.user_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE m.tenant_id = $1
           AND (u.dept_id IS NULL OR u.dept_id = ANY($2::int[]))
         GROUP BY m.meeting_id, m.status, pm.notes, d.dept_name`,
        [tenantId, deptIds],
      );

      const scheduled = rows.filter((row) =>
        ['SCHEDULED', 'UPCOMING', 'PENDING', 'CONFIRMED'].includes(
          String(row.status).toUpperCase(),
        ),
      ).length;
      const completed = rows.filter(
        (row) => String(row.status).toUpperCase() === 'COMPLETED',
      ).length;
      const cancelled = rows.filter(
        (row) => String(row.status).toUpperCase() === 'CANCELLED',
      ).length;
      const pendingMom = rows.filter((row) => !row.has_mom).length;
      const avgAttendance =
        rows.length > 0
          ? Number(
              (
                rows.reduce(
                  (sum, row) => sum + Number(row.participant_count ?? 0),
                  0,
                ) / rows.length
              ).toFixed(1),
            )
          : 0;

      const deptParticipation = new Map<string, number>();
      for (const row of rows) {
        const key = row.dept_name ?? 'School-wide';
        deptParticipation.set(
          key,
          (deptParticipation.get(key) ?? 0) + Number(row.participant_count ?? 0),
        );
      }

      return {
        meetings_scheduled: scheduled,
        meetings_completed: completed,
        meetings_cancelled: cancelled,
        pending_mom: pendingMom,
        average_attendance: avgAttendance,
        department_participation: Array.from(deptParticipation.entries()).map(
          ([department, count]) => ({ department, count }),
        ),
      };
    } catch {
      return {
        meetings_scheduled: 0,
        meetings_completed: 0,
        meetings_cancelled: 0,
        pending_mom: 0,
        average_attendance: 0,
        department_participation: [],
      };
    }
  }

  async globalSearch(
    tenantId: string,
    deanUserId: string,
    query: string,
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const q = `%${query.trim()}%`;
    if (query.trim().length < 2) {
      return { students: [], faculty: [], departments: [], courses: [], research: [], events: [], meetings: [], approvals: [] };
    }

    const deptIds = scope.departmentIds;
    const [
      students,
      faculty,
      departments,
      courses,
      research,
      events,
      meetings,
      approvals,
    ] = await Promise.all([
      this.db.query(
        `SELECT u.user_id AS id, u.name, u.official_email AS subtitle, 'student' AS type
         FROM users u
         INNER JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND r.role_name = 'Student'
           AND (u.name ILIKE $3 OR u.official_email ILIKE $3)
         LIMIT 10`,
        [tenantId, deptIds, q],
      ),
      this.db.query(
        `SELECT u.user_id AS id, u.name, d.dept_name AS subtitle, 'faculty' AS type
         FROM users u
         INNER JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND r.role_name IN ('Faculty', 'HOD', 'Dean')
           AND (u.name ILIKE $3 OR u.official_email ILIKE $3)
         LIMIT 10`,
        [tenantId, deptIds, q],
      ),
      this.db.query(
        `SELECT dept_id AS id, dept_name AS name, 'Department' AS subtitle, 'department' AS type
         FROM departments
         WHERE dept_id = ANY($1::int[]) AND dept_name ILIKE $2
         LIMIT 10`,
        [deptIds, q],
      ),
      this.db.query(
        `SELECT c.course_id AS id, c.course_code AS name, c.course_name AS subtitle, 'course' AS type
         FROM academic_courses c
         INNER JOIN academic_timetables t ON t.course_id = c.course_id
         INNER JOIN users u ON u.user_id = t.faculty_user_id
         WHERE c.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND (c.course_code ILIKE $3 OR c.course_name ILIKE $3)
         GROUP BY c.course_id, c.course_code, c.course_name
         LIMIT 10`,
        [tenantId, deptIds, q],
      ),
      this.db.query(
        `SELECT p.research_project_id AS id, p.title AS name, u.name AS subtitle, 'research' AS type
         FROM faculty_research_projects p
         INNER JOIN users u ON u.user_id = p.principal_investigator_user_id
         WHERE p.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND p.title ILIKE $3
         LIMIT 10`,
        [tenantId, deptIds, q],
      ).catch(() => []),
      this.db.query(
        `SELECT e.event_id AS id, e.title AS name, e.status AS subtitle, 'event' AS type
         FROM campus_events e
         LEFT JOIN campus_clubs c ON c.club_id = e.club_id
         LEFT JOIN users u ON u.user_id = c.faculty_advisor_id
         WHERE e.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND e.title ILIKE $3
         LIMIT 10`,
        [tenantId, deptIds, q],
      ).catch(() => []),
      this.db.query(
        `SELECT m.meeting_id AS id, m.title AS name, m.status AS subtitle, 'meeting' AS type
         FROM portal_meetings m
         WHERE m.tenant_id = $1 AND m.title ILIKE $2
         LIMIT 10`,
        [tenantId, q],
      ).catch(() => []),
      this.db.query(
        `SELECT r.request_id AS id, g.project_title AS name, fr.status AS subtitle, 'approval' AS type
         FROM project_funding_requests fr
         INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
         INNER JOIN users u ON u.user_id = fr.requested_by
         WHERE fr.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND g.project_title ILIKE $3
         LIMIT 10`,
        [tenantId, deptIds, q],
      ).catch(() => []),
    ]);

    return {
      students,
      faculty,
      departments,
      courses,
      research,
      events,
      meetings,
      approvals,
    };
  }

  async getDeanNotifications(
    tenantId: string,
    deanUserId: string,
    query: ListQueryParams = {},
  ) {
    const { limit, offset } = parseListQuery(query, 20, 100);
    const unreadOnly = query.status === 'unread';

    try {
      const countRows = await this.db.query<Array<{ total: string; unread: string }>>(
        `SELECT COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE is_read = false)::int AS unread
         FROM falcon_notifications
         WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
           AND ($3::boolean = false OR is_read = false)`,
        [tenantId, deanUserId, unreadOnly],
      );
      const total = Number(countRows[0]?.total ?? 0);
      const unread_count = Number(countRows[0]?.unread ?? 0);

      const rows = await this.db.query<
        Array<{
          notification_id: string;
          title: string;
          message: string;
          priority: string | null;
          is_read: boolean;
          created_at: string;
          action_link: string | null;
          request_type: string | null;
        }>
      >(
        `SELECT notification_id, title, message, severity AS priority, is_read, created_at, action_link
         FROM falcon_notifications
         WHERE tenant_id = $1 AND user_id = $2 AND deleted_at IS NULL
           AND ($3::boolean = false OR is_read = false)
         ORDER BY is_read ASC, created_at DESC
         LIMIT $4 OFFSET $5`,
        [tenantId, deanUserId, unreadOnly, limit, offset],
      );

      return {
        unread_count,
        ...toPaginatedResponse(rows, total, limit, offset),
      };
    } catch {
      return { unread_count: 0, ...toPaginatedResponse([], 0, limit, offset) };
    }
  }

  async markAllNotificationsRead(tenantId: string, deanUserId: string) {
    await this.db.query(
      `UPDATE falcon_notifications
       SET is_read = true
       WHERE tenant_id = $1 AND user_id = $2 AND is_read = false`,
      [tenantId, deanUserId],
    );
    return { ok: true };
  }

  async markNotificationRead(
    tenantId: string,
    deanUserId: string,
    notificationId: string,
  ) {
    await this.db.query(
      `UPDATE falcon_notifications
       SET is_read = true
       WHERE notification_id = $1 AND tenant_id = $2 AND user_id = $3`,
      [notificationId, tenantId, deanUserId],
    );
    return { ok: true };
  }

  async getAuditLog(
    tenantId: string,
    deanUserId: string,
    filters: DeanFilterQuery & ListQueryParams & { module?: string } = {},
  ): Promise<PaginatedResponse<{
    id: string;
    user: string;
    action: string;
    module: string;
    old_value: Record<string, unknown> | null;
    new_value: Record<string, unknown> | null;
    timestamp: string;
    ip: string | null;
  }>> {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const { limit, offset } = parseListQuery(filters, 20, 500);
    const search = filters.search?.trim();

    try {
      const countRows = await this.db.query<Array<{ total: string }>>(
        `SELECT COUNT(*)::int AS total
         FROM system_audit_logs l
         LEFT JOIN users u ON u.user_id = l.changed_by_user_id
         WHERE (u.tenant_id = $1 OR l.changed_by_user_id = $2)
           AND (u.dept_id IS NULL OR u.dept_id = ANY($3::int[]))
           AND ($4::text IS NULL OR l.table_name ILIKE $4)
           AND ($5::text IS NULL OR u.name ILIKE $5 OR l.action ILIKE $5)`,
        [
          tenantId,
          deanUserId,
          scope.departmentIds,
          filters.module ? `%${filters.module}%` : null,
          search ? `%${search}%` : null,
        ],
      );
      const total = Number(countRows[0]?.total ?? 0);

      const rows = await this.db.query<
        Array<{
          log_id: string;
          table_name: string;
          action: string;
          old_value: Record<string, unknown> | null;
          new_value: Record<string, unknown> | null;
          changed_by_user_id: string | null;
          changed_at: string;
          user_name: string | null;
        }>
      >(
        `SELECT l.log_id, l.table_name, l.action, l.old_value, l.new_value,
                l.changed_by_user_id, l.changed_at, u.name AS user_name
         FROM system_audit_logs l
         LEFT JOIN users u ON u.user_id = l.changed_by_user_id
         WHERE (u.tenant_id = $1 OR l.changed_by_user_id = $2)
           AND (u.dept_id IS NULL OR u.dept_id = ANY($3::int[]))
           AND ($4::text IS NULL OR l.table_name ILIKE $4)
           AND ($5::text IS NULL OR u.name ILIKE $5 OR l.action ILIKE $5)
         ORDER BY l.changed_at DESC
         LIMIT $6 OFFSET $7`,
        [
          tenantId,
          deanUserId,
          scope.departmentIds,
          filters.module ? `%${filters.module}%` : null,
          search ? `%${search}%` : null,
          limit,
          offset,
        ],
      );

      const data = rows.map((row) => ({
        id: row.log_id,
        user: row.user_name ?? row.changed_by_user_id ?? 'System',
        action: String(
          (row.new_value?.meta as Record<string, unknown> | undefined)?.action ??
            row.action,
        ),
        module: row.table_name,
        old_value: row.old_value,
        new_value: row.new_value,
        timestamp: row.changed_at,
        ip:
          (row.new_value?.meta as Record<string, unknown> | undefined)?.ip?.toString() ??
          null,
      }));

      return toPaginatedResponse(data, total, limit, offset);
    } catch {
      return toPaginatedResponse([], 0, limit, offset);
    }
  }

  async getApprovalTimeline(
    tenantId: string,
    deanUserId: string,
    type: string,
    id: string,
  ) {
    const scope = await resolveDeanScope(this.db, deanUserId);
    const normalized = type.toUpperCase();
    if (normalized === 'FUNDING') {
      const [row] = await this.db.query<
        Array<{
          status: string;
          created_at: string;
          updated_at: string | null;
          purpose: string | null;
          dept_id: number;
        }>
      >(
        `SELECT fr.status, fr.created_at, fr.updated_at, fr.purpose, u.dept_id
         FROM project_funding_requests fr
         INNER JOIN users u ON u.user_id = fr.requested_by
         WHERE fr.request_id = $1 AND fr.tenant_id = $2`,
        [id, tenantId],
      );
      if (!row || !scope.departmentIds.includes(Number(row.dept_id))) {
        throw new NotFoundException('Approval record not found');
      }
      return this.buildTimeline([
        { stage: 'Requested', status: 'completed', at: row.created_at },
        {
          stage: 'HOD Approved',
          status: ['APPROVED_HOD', 'APPROVED_DEAN', 'REJECTED_DEAN'].includes(
            row.status,
          )
            ? 'completed'
            : 'pending',
          at: row.updated_at,
        },
        {
          stage: 'Dean Approved',
          status: row.status === 'APPROVED_DEAN' ? 'completed' : 'pending',
          at: row.status === 'APPROVED_DEAN' ? row.updated_at : null,
        },
        { stage: 'Registrar', status: 'pending' },
        { stage: 'VC', status: 'pending' },
      ], row.status, row.purpose);
    }

    if (normalized === 'ATTENDANCE_POLICY') {
      const [row] = await this.db.query<
        Array<{
          status: string;
          created_at: string;
          decided_at: string | null;
          decision_remarks: string | null;
          dept_id: number;
        }>
      >(
        `SELECT status, created_at, decided_at, decision_remarks, dept_id
         FROM attendance_threshold_requests
         WHERE request_id = $1 AND tenant_id = $2`,
        [id, tenantId],
      );
      if (!row || !scope.departmentIds.includes(Number(row.dept_id))) {
        throw new NotFoundException('Approval record not found');
      }
      return this.buildTimeline(
        [
          { stage: 'Requested', status: 'completed', at: row.created_at },
          {
            stage: 'HOD Approved',
            status: 'completed',
            at: row.created_at,
          },
          {
            stage: 'Dean Approved',
            status: row.status === 'APPROVED' ? 'completed' : 'pending',
            at: row.decided_at,
            remarks: row.decision_remarks,
          },
          { stage: 'Registrar', status: 'pending' },
          { stage: 'VC', status: 'pending' },
        ],
        row.status,
        row.decision_remarks,
      );
    }

    if (normalized === 'EVENT') {
      const [row] = await this.db.query<
        Array<{
          status: string;
          created_at: string;
          advisor_approval: string;
          hod_approval: string;
          dean_approval: string;
          dept_id: number | null;
        }>
      >(
        `SELECT e.status, e.created_at, e.advisor_approval, e.hod_approval, e.dean_approval,
                advisor.dept_id
         FROM campus_events e
         LEFT JOIN campus_clubs c ON c.club_id = e.club_id
         LEFT JOIN users advisor ON advisor.user_id = c.faculty_advisor_id
         WHERE e.event_id = $1 AND e.tenant_id = $2`,
        [id, tenantId],
      );
      if (
        !row ||
        (row.dept_id != null &&
          !scope.departmentIds.includes(Number(row.dept_id)))
      ) {
        throw new NotFoundException('Approval record not found');
      }
      return this.buildTimeline(
        [
          { stage: 'Requested', status: 'completed', at: row.created_at },
          {
            stage: 'Advisor Approved',
            status: row.advisor_approval === 'APPROVED' ? 'completed' : 'pending',
          },
          {
            stage: 'HOD Approved',
            status: row.hod_approval === 'APPROVED' ? 'completed' : 'pending',
          },
          {
            stage: 'Dean Approved',
            status: row.dean_approval === 'APPROVED' ? 'completed' : 'pending',
          },
          { stage: 'Registrar', status: 'pending' },
        ],
        row.status,
      );
    }

    throw new NotFoundException('Unsupported approval type');
  }

  async exportReport(
    tenantId: string,
    deanUserId: string,
    reportType: string,
    format: 'pdf' | 'excel' | 'csv',
    filters: DeanFilterQuery = {},
  ) {
    const bundle = await this.getDashboardIntelligence(
      tenantId,
      deanUserId,
      filters,
    );
    const leaderboard = await this.getFacultyLeaderboard(
      tenantId,
      deanUserId,
      filters,
    );
    const placement = await this.getPlacementDashboard(
      tenantId,
      deanUserId,
      filters,
    );
    const research = await this.getResearchDashboard(
      tenantId,
      deanUserId,
      filters,
    );
    const budget = await this.getBudgetMonitoring(
      tenantId,
      deanUserId,
      filters,
    );

    const rows: Array<Record<string, string | number>> = [];
    const push = (section: string, metric: string, value: string | number) => {
      rows.push({ section, metric, value });
    };

    if (['school', 'all'].includes(reportType)) {
      push('School Summary', 'Health Score', bundle.school_health.score);
      push('School Summary', 'Attendance', bundle.school_health.components.attendance);
      push('School Summary', 'Placement %', bundle.school_health.components.placement_readiness);
    }
    if (['department', 'all'].includes(reportType)) {
      for (const dept of bundle.department_rankings) {
        push('Department', dept.department, dept.health_score);
      }
    }
    if (['faculty', 'all'].includes(reportType)) {
      for (const fac of leaderboard.all.slice(0, 50)) {
        push('Faculty', fac.name, fac.performance_rating);
      }
    }
    if (['placement', 'all'].includes(reportType)) {
      push('Placement', 'Eligible', placement.eligible_students);
      push('Placement', 'Placed', placement.placed_students);
      push('Placement', 'Placement %', placement.placement_pct);
    }
    if (['research', 'all'].includes(reportType)) {
      push('Research', 'Projects', research.projects);
      push('Research', 'Publications', research.publications);
    }
    if (['budget', 'all'].includes(reportType)) {
      push('Budget', 'Allocated', budget.allocated_budget);
      push('Budget', 'Spent', budget.spent_budget);
    }

    if (format === 'csv') {
      const header = 'section,metric,value\n';
      const body = rows
        .map((row) =>
          [row.section, row.metric, row.value]
            .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
            .join(','),
        )
        .join('\n');
      return {
        contentType: 'text/csv',
        filename: `dean-${reportType}-report.csv`,
        buffer: Buffer.from(header + body, 'utf8'),
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Dean Report');
    sheet.columns = [
      { header: 'Section', key: 'section', width: 24 },
      { header: 'Metric', key: 'metric', width: 32 },
      { header: 'Value', key: 'value', width: 20 },
    ];
    rows.forEach((row) => sheet.addRow(row));
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    if (format === 'pdf') {
      const pdfBuffer = await this.buildDeanPdfReport(
        `Dean ${reportType} Report`,
        rows,
        bundle.school_health.score,
      );
      return {
        contentType: 'application/pdf',
        filename: `dean-${reportType}-report.pdf`,
        buffer: pdfBuffer,
      };
    }

    return {
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `dean-${reportType}-report.xlsx`,
      buffer,
    };
  }

  private async buildDeanPdfReport(
    title: string,
    rows: Array<Record<string, string | number>>,
    healthScore: number,
  ) {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const navy = rgb(0.12, 0.23, 0.37);
    const gold = rgb(0.79, 0.66, 0.28);
    let y = 800;

    page.drawText('Suresh Gyan Vihar University', {
      x: 50,
      y,
      size: 14,
      font: bold,
      color: navy,
    });
    y -= 22;
    page.drawText('Dean Workspace — Executive Report', {
      x: 50,
      y,
      size: 11,
      font,
      color: navy,
    });
    y -= 18;
    page.drawText(title, { x: 50, y, size: 10, font: bold, color: gold });
    y -= 16;
    page.drawText(`School Health Score: ${healthScore}/100`, {
      x: 50,
      y,
      size: 9,
      font,
    });
    y -= 24;
    page.drawText('Section', { x: 50, y, size: 9, font: bold, color: navy });
    page.drawText('Metric', { x: 180, y, size: 9, font: bold, color: navy });
    page.drawText('Value', { x: 380, y, size: 9, font: bold, color: navy });
    y -= 14;
    page.drawLine({
      start: { x: 50, y },
      end: { x: 545, y },
      thickness: 1,
      color: gold,
    });
    y -= 16;

    for (const row of rows.slice(0, 40)) {
      if (y < 80) break;
      page.drawText(String(row.section).slice(0, 22), {
        x: 50,
        y,
        size: 8,
        font,
      });
      page.drawText(String(row.metric).slice(0, 28), {
        x: 180,
        y,
        size: 8,
        font,
      });
      page.drawText(String(row.value).slice(0, 20), {
        x: 380,
        y,
        size: 8,
        font,
      });
      y -= 14;
    }

    const generatedAt = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
    });
    page.drawText(`Generated: ${generatedAt}`, {
      x: 50,
      y: 50,
      size: 8,
      font,
      color: navy,
    });
    page.drawText('Authorized Signatory: ____________________', {
      x: 50,
      y: 34,
      size: 8,
      font,
      color: navy,
    });

    return Buffer.from(await pdf.save());
  }

  private buildTimeline(
    steps: Array<{
      stage: string;
      status: string;
      at?: string | null;
      remarks?: string | null;
    }>,
    currentStatus: string,
    remarks?: string | null,
  ) {
    return {
      current_status: currentStatus,
      remarks,
      steps: steps.map((step) => ({
        stage: step.stage,
        status: step.status,
        approved_at: step.at ?? null,
        approved_by: null,
        remarks: step.remarks ?? null,
      })),
    };
  }

  private buildDepartmentRankings(
    departments: Array<Record<string, unknown>>,
    workload: Array<{ dept_id: number; workload_status: string }>,
    results: Array<{ course_code: string; pass_percent?: number }>,
    placementByDept: Array<{ dept_id: number; placement_pct: number }>,
  ) {
    const placementMap = new Map(
      placementByDept.map((row) => [row.dept_id, row.placement_pct]),
    );

    const ranked = departments.map((dept) => {
      const deptId = Number(dept.dept_id);
      const deptWorkload = workload.filter((row) => Number(row.dept_id) === deptId);
      const balancedPct =
        deptWorkload.length > 0
          ? (deptWorkload.filter((row) => row.workload_status === 'BALANCED')
              .length /
              deptWorkload.length) *
            100
          : 100;
      const attendanceRisk = Number(dept.attendance_risk_count ?? 0);
      const studentCount = Math.max(Number(dept.student_count ?? 1), 1);
      const attendanceScore = this.clampScore(
        100 - (attendanceRisk / studentCount) * 100,
      );
      const syllabusScore = Number(dept.syllabus_completion_pct ?? 70);
      const placementScore = placementMap.get(deptId) ?? 70;
      const healthScore = this.computeCompositeScore({
        attendance: attendanceScore,
        results: 85,
        syllabus: syllabusScore,
        workloadBalance: balancedPct,
        approvalHealth: 85,
        studentSafety: attendanceScore,
        placement: placementScore,
      });
      const trend: TrendDirection =
        healthScore >= 85 ? 'up' : healthScore < 70 ? 'down' : 'flat';
      return {
        rank: 0,
        dept_id: deptId,
        department: String(dept.dept_name),
        health_score: healthScore,
        trend,
        cgpa: 7.8,
        placements: placementScore,
        research: Number(dept.active_courses ?? 0),
        faculty_workload: Number(balancedPct.toFixed(1)),
        student_satisfaction: 4.2,
      };
    });

    ranked.sort((a, b) => b.health_score - a.health_score);
    return ranked.map((row, index) => ({ ...row, rank: index + 1 }));
  }

  private buildAlerts(input: {
    hm: Record<string, unknown>;
    departments: Array<Record<string, unknown>>;
    workload: Array<{ workload_status: string; name: string; dept_name: string | null }>;
    syllabus: Array<{ behind_schedule: boolean; course_code: string }>;
    pendingCount: number;
    placementSummary: { placement_pct: number };
    atRiskStudents: number;
  }) {
    const alerts: Array<{
      id: string;
      priority: AlertPriority;
      title: string;
      detail: string;
      href?: string;
    }> = [];

    if (Number(input.hm.average_attendance ?? 0) < 70) {
      alerts.push({
        id: 'school-attendance',
        priority: 'critical',
        title: 'School attendance below 70%',
        detail: `Current average attendance is ${input.hm.average_attendance}%.`,
        href: '/dean/students/monitor',
      });
    }

    for (const dept of input.departments) {
      if (Number(dept.attendance_risk_count ?? 0) > 5) {
        alerts.push({
          id: `dept-attendance-${dept.dept_id}`,
          priority: 'warning',
          title: `${dept.dept_name} attendance risk`,
          detail: `${dept.attendance_risk_count} students flagged.`,
          href: `/dean/departments/${dept.dept_id}`,
        });
      }
    }

    const overloaded = input.workload.filter(
      (row) => row.workload_status === 'OVERLOADED',
    );
    if (overloaded.length > 0) {
      alerts.push({
        id: 'faculty-overload',
        priority: 'warning',
        title: 'Faculty overloaded',
        detail: `${overloaded.length} faculty members exceed 18 hrs/week.`,
        href: '/dean/faculty/workload',
      });
    }

    const underloaded = input.workload.filter(
      (row) => row.workload_status === 'UNDERUTILIZED',
    );
    if (underloaded.length > 0) {
      alerts.push({
        id: 'faculty-underload',
        priority: 'information',
        title: 'Faculty underloaded',
        detail: `${underloaded.length} faculty members are underutilized.`,
        href: '/dean/faculty/workload',
      });
    }

    const delayed = input.syllabus.filter((row) => row.behind_schedule);
    if (delayed.length > 0) {
      alerts.push({
        id: 'syllabus-delay',
        priority: 'warning',
        title: 'Syllabus delayed',
        detail: `${delayed.length} courses are behind schedule.`,
        href: '/dean/academics/syllabus-tracking',
      });
    }

    if (input.pendingCount >= 5) {
      alerts.push({
        id: 'approval-backlog',
        priority: 'critical',
        title: 'Approval backlog',
        detail: `${input.pendingCount} items awaiting Dean sign-off.`,
        href: '/dean/inbox',
      });
    }

    if (input.placementSummary.placement_pct < 60) {
      alerts.push({
        id: 'placement-decline',
        priority: 'warning',
        title: 'Placement decline',
        detail: `School placement rate is ${input.placementSummary.placement_pct}%.`,
        href: '/dean/placement',
      });
    }

    if (input.atRiskStudents > 0) {
      alerts.push({
        id: 'high-absentee',
        priority: 'information',
        title: 'High absentee students',
        detail: `${input.atRiskStudents} students below attendance threshold.`,
        href: '/dean/students/monitor',
      });
    }

    return alerts;
  }

  private buildRecommendations(
    alerts: Array<{ title: string; detail: string; href?: string }>,
    departments: Array<Record<string, unknown>>,
  ) {
    const recommendations: Array<{ id: string; title: string; detail: string; href?: string }> =
      [];

    for (const alert of alerts.slice(0, 4)) {
      recommendations.push({
        id: `rec-${alert.title}`,
        title: alert.title.replace(/ below.*| risk| overloaded| delayed| backlog| decline| students/, ''),
        detail: `Recommended action: review ${alert.detail.toLowerCase()}`,
        href: alert.href,
      });
    }

    const weakest = [...departments].sort(
      (a, b) =>
        Number(a.syllabus_completion_pct ?? 0) -
        Number(b.syllabus_completion_pct ?? 0),
    )[0];
    if (weakest) {
      recommendations.push({
        id: 'rec-syllabus-meeting',
        title: 'Schedule syllabus review meeting',
        detail: `${weakest.dept_name} has the lowest syllabus completion in your school.`,
        href: '/dean/meetings',
      });
    }

    return recommendations.slice(0, 6);
  }

  private buildResultTrend(
    results: Array<{ course_code: string; pass_percent?: number }>,
  ) {
    return results.slice(0, 8).map((row, index) => ({
      label: row.course_code,
      pass_rate: Number(row.pass_percent ?? 0),
      week: `T${index + 1}`,
    }));
  }

  private async safeWeeklyAttendance(tenantId: string, deptIds: number[]) {
    if (!deptIds.length) return [];
    try {
      const rows = await this.db.query<
        Array<{ week: string; attendance: string }>
      >(
        `SELECT to_char(week_start, 'Mon DD') AS week,
                ROUND(AVG(present_pct)::numeric, 1)::text AS attendance
         FROM (
           SELECT date_trunc('week', ar.session_date)::date AS week_start,
                  CASE WHEN ar.status IN ('PRESENT', 'LATE', 'EXCUSED') THEN 100 ELSE 0 END AS present_pct
           FROM academic_attendance_records ar
           INNER JOIN users u ON u.user_id = ar.student_user_id
           WHERE ar.tenant_id = $1 AND u.dept_id = ANY($2::int[])
             AND ar.session_date >= CURRENT_DATE - INTERVAL '10 weeks'
         ) sub
         GROUP BY week_start
         ORDER BY week_start ASC`,
        [tenantId, deptIds],
      );
      return rows.map((row) => ({
        week: row.week,
        attendance: Number(row.attendance),
        target: 75,
      }));
    } catch {
      return Array.from({ length: 8 }, (_, index) => ({
        week: `W${index + 1}`,
        attendance: 0,
        target: 75,
      }));
    }
  }

  private async safePlacementSummary(
    tenantId: string,
    deptIds: number[],
    detailed = false,
  ) {
    try {
      const rows = await this.db.query<
        Array<{
          dept_id: number;
          dept_name: string;
          eligible: string;
          placed: string;
          avg_package: string | null;
          max_package: string | null;
        }>
      >(
        `SELECT d.dept_id, d.dept_name,
                COUNT(DISTINCT u.user_id)::text AS eligible,
                COUNT(DISTINCT r.student_user_id)::text AS placed,
                NULL::text AS avg_package,
                NULL::text AS max_package
         FROM departments d
         LEFT JOIN users u ON u.dept_id = d.dept_id
         LEFT JOIN roles rl ON rl.role_id = u.role_id AND rl.role_name = 'Student'
         LEFT JOIN hod_dept_placement_responses r
           ON r.student_user_id = u.user_id AND r.tenant_id = $1
         WHERE d.dept_id = ANY($2::int[])
         GROUP BY d.dept_id, d.dept_name`,
        [tenantId, deptIds],
      );

      const eligible = rows.reduce((sum, row) => sum + Number(row.eligible ?? 0), 0);
      const placed = rows.reduce((sum, row) => sum + Number(row.placed ?? 0), 0);
      const placementPct =
        eligible > 0 ? Number(((placed / eligible) * 100).toFixed(1)) : 0;
      const packages = rows
        .map((row) => Number(row.avg_package ?? 0))
        .filter((value) => value > 0);
      const avgPackage =
        packages.length > 0
          ? Number(
              (packages.reduce((sum, value) => sum + value, 0) / packages.length).toFixed(
                2,
              ),
            )
          : 0;
      const maxPackage = Math.max(
        ...rows.map((row) => Number(row.max_package ?? 0)),
        0,
      );

      const summary = {
        eligible_students: eligible,
        placed_students: placed,
        placement_pct: placementPct,
        average_package: avgPackage,
        highest_package: maxPackage,
        companies_visited: placed > 0 ? Math.min(placed, 24) : 0,
        by_department: rows.map((row) => ({
          dept_id: row.dept_id,
          department: row.dept_name,
          placement_pct:
            Number(row.eligible ?? 0) > 0
              ? Number(
                  (
                    (Number(row.placed ?? 0) / Number(row.eligible ?? 0)) *
                    100
                  ).toFixed(1),
                )
              : 0,
        })),
        trend: rows.map((row) => ({
          department: row.dept_name,
          placement_pct:
            Number(row.eligible ?? 0) > 0
              ? Number(
                  (
                    (Number(row.placed ?? 0) / Number(row.eligible ?? 0)) *
                    100
                  ).toFixed(1),
                )
              : 0,
        })),
        offer_trends: rows.map((row) => ({
          department: row.dept_name,
          offers: Number(row.placed ?? 0),
        })),
      };

      return detailed ? summary : summary;
    } catch {
      return {
        eligible_students: 0,
        placed_students: 0,
        placement_pct: 0,
        average_package: 0,
        highest_package: 0,
        companies_visited: 0,
        by_department: [],
        trend: [],
        offer_trends: [],
      };
    }
  }

  private async safeFacultyGrowth(tenantId: string, deptIds: number[]) {
    try {
      const rows = await this.db.query<Array<{ month: string; count: string }>>(
        `SELECT to_char(date_trunc('month', u.created_at), 'Mon YY') AS month,
                COUNT(*)::text AS count
         FROM users u
         INNER JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND r.role_name IN ('Faculty', 'HOD', 'Dean')
           AND u.created_at >= CURRENT_DATE - INTERVAL '8 months'
         GROUP BY 1
         ORDER BY MIN(u.created_at) ASC`,
        [tenantId, deptIds],
      );
      return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
    } catch {
      return [];
    }
  }

  private async safeEnrollmentTrend(tenantId: string, deptIds: number[]) {
    try {
      const rows = await this.db.query<Array<{ month: string; count: string }>>(
        `SELECT to_char(date_trunc('month', u.created_at), 'Mon YY') AS month,
                COUNT(*)::text AS count
         FROM users u
         INNER JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND r.role_name = 'Student'
           AND u.created_at >= CURRENT_DATE - INTERVAL '8 months'
         GROUP BY 1
         ORDER BY MIN(u.created_at) ASC`,
        [tenantId, deptIds],
      );
      return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
    } catch {
      return [];
    }
  }

  private async safeResearchByFaculty(tenantId: string, deptIds: number[]) {
    const map = new Map<string, { publications: number; projects: number }>();
    try {
      const rows = await this.db.query<
        Array<{ faculty_user_id: string; publications: string; projects: string }>
      >(
        `SELECT u.user_id AS faculty_user_id,
                COUNT(DISTINCT l.log_id)::text AS publications,
                COUNT(DISTINCT p.research_project_id)::text AS projects
         FROM users u
         LEFT JOIN faculty_research_logs l ON l.faculty_user_id = u.user_id
         LEFT JOIN faculty_research_projects p ON p.principal_investigator_user_id = u.user_id
         WHERE u.tenant_id = $1 AND u.dept_id = ANY($2::int[])
         GROUP BY u.user_id`,
        [tenantId, deptIds],
      );
      for (const row of rows) {
        map.set(String(row.faculty_user_id), {
          publications: Number(row.publications ?? 0),
          projects: Number(row.projects ?? 0),
        });
      }
    } catch {
      /* optional tables */
    }
    return map;
  }

  private async safeResearchTrend(tenantId: string, deptIds: number[]) {
    try {
      const rows = await this.db.query<Array<{ month: string; count: string }>>(
        `SELECT to_char(date_trunc('month', l.created_at), 'Mon YY') AS month,
                COUNT(*)::text AS count
         FROM faculty_research_logs l
         INNER JOIN users u ON u.user_id = l.faculty_user_id
         WHERE l.tenant_id = $1 AND u.dept_id = ANY($2::int[])
           AND l.created_at >= CURRENT_DATE - INTERVAL '8 months'
         GROUP BY 1
         ORDER BY MIN(l.created_at) ASC`,
        [tenantId, deptIds],
      );
      return rows.map((row) => ({ month: row.month, count: Number(row.count) }));
    } catch {
      return [];
    }
  }
}
