import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';

const NAAC_CRITERIA = [
  { criterion: 1, title: 'Curricular Aspects' },
  { criterion: 2, title: 'Teaching-Learning & Evaluation' },
  { criterion: 3, title: 'Research, Innovations & Extension' },
  { criterion: 4, title: 'Infrastructure & Learning Resources' },
  { criterion: 5, title: 'Student Support & Progression' },
  { criterion: 6, title: 'Governance, Leadership & Management' },
  { criterion: 7, title: 'Institutional Values & Best Practices' },
];

@Injectable()
export class IqacAnalyticsService {
  private readonly logger = new Logger(IqacAnalyticsService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Run SQL without bubbling 500s when optional tables/views are missing. */
  private async safeQuery<
    T extends Record<string, unknown> = Record<string, unknown>,
  >(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      return await this.dataSource.query(sql, params);
    } catch (err) {
      this.logger.warn(
        `IQAC query skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async refreshMaterializedViews() {
    const views = [
      'iqac_mv_placement_stats',
      'iqac_mv_faculty_metrics',
      'iqac_mv_student_counts',
      'iqac_mv_repository_health',
    ];
    for (const view of views) {
      try {
        await this.dataSource.query(
          `REFRESH MATERIALIZED VIEW CONCURRENTLY ${view}`,
        );
      } catch {
        await this.dataSource.query(`REFRESH MATERIALIZED VIEW ${view}`);
      }
    }
    this.logger.log('IQAC materialized views refreshed');
  }

  async getKpiDashboard(tenantId: string) {
    let faculty = await this.safeQuery<{
      total_faculty: number;
      phd_faculty: number;
      total_research_grants: string;
    }>(
      `SELECT total_faculty, phd_faculty, total_research_grants FROM iqac_mv_faculty_metrics WHERE tenant_id = $1`,
      [tenantId],
    );

    if (!faculty.length) {
      faculty = await this.safeQuery(
        `SELECT
           COUNT(*) FILTER (WHERE r.role_name IN ('Faculty', 'HOD', 'Dean'))::int AS total_faculty,
           COUNT(*) FILTER (
             WHERE r.role_name IN ('Faculty', 'HOD', 'Dean')
               AND (hp.designation ILIKE '%phd%' OR hp.designation ILIKE '%doctor%')
           )::int AS phd_faculty,
           0::numeric AS total_research_grants
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN hr_employee_profiles hp ON hp.user_id = u.user_id AND hp.tenant_id = u.tenant_id
         WHERE u.tenant_id = $1 AND u.is_active = true`,
        [tenantId],
      );
    }

    let students = await this.safeQuery<{ total_students: number }>(
      `SELECT total_students FROM iqac_mv_student_counts WHERE tenant_id = $1`,
      [tenantId],
    );
    if (!students.length) {
      students = await this.safeQuery(
        `SELECT COUNT(DISTINCT u.user_id)::int AS total_students
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = 'Student' AND u.is_active = true`,
        [tenantId],
      );
    }

    const placement = await this.safeQuery<{ placed: string; avg_lpa: string }>(
      `SELECT SUM(total_placed)::int AS placed, ROUND(AVG(average_package)::numeric, 2) AS avg_lpa
       FROM iqac_mv_placement_stats WHERE tenant_id = $1`,
      [tenantId],
    );

    const totalFaculty = Number(faculty[0]?.total_faculty ?? 0);
    const totalStudents = Number(students[0]?.total_students ?? 0);
    const phdFaculty = Number(faculty[0]?.phd_faculty ?? 0);
    const ratio =
      totalFaculty > 0 ? Number((totalStudents / totalFaculty).toFixed(1)) : 0;
    const phdPercent =
      totalFaculty > 0
        ? Number(((phdFaculty / totalFaculty) * 100).toFixed(1))
        : 0;

    const heatmap = await this.safeQuery<{
      dept_id: number;
      department: string;
      pending_reports: number;
    }>(
      `SELECT d.dept_id, d.dept_name AS department,
              COUNT(ta.assignment_id) FILTER (WHERE ta.status = 'Pending')::int AS pending_reports
       FROM departments d
       LEFT JOIN users u ON u.dept_id = d.dept_id AND u.tenant_id = $1
       LEFT JOIN task_assignments ta ON ta.assigned_to = u.user_id AND ta.status = 'Pending'
       GROUP BY d.dept_id, d.dept_name
       ORDER BY d.dept_name`,
      [tenantId],
    );

    return {
      gauges: {
        faculty_student_ratio: ratio,
        phd_faculty_percent: phdPercent,
        total_research_grants_inr: Number(
          faculty[0]?.total_research_grants ?? 0,
        ),
        total_faculty: totalFaculty,
        total_students: totalStudents,
        placement_rate_percent:
          totalStudents > 0
            ? Number(
                (
                  (Number(placement[0]?.placed ?? 0) / totalStudents) *
                  100
                ).toFixed(1),
              )
            : 0,
        average_placement_lpa: Number(placement[0]?.avg_lpa ?? 0),
      },
      heatmap: (
        heatmap as { department: string; pending_reports: number }[]
      ).map((row) => ({
        ...row,
        risk:
          row.pending_reports > 2
            ? 'HIGH'
            : row.pending_reports > 0
              ? 'MEDIUM'
              : 'LOW',
      })),
      refreshed_at: new Date().toISOString(),
    };
  }

  async getRankingAnalytics(tenantId: string) {
    const placementByDept = await this.safeQuery(
      `SELECT dept_name, total_placed, average_package, highest_package
       FROM iqac_mv_placement_stats WHERE tenant_id = $1 ORDER BY average_package DESC NULLS LAST`,
      [tenantId],
    );
    const publications = await this.safeQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM faculty_publications WHERE tenant_id = $1`,
      [tenantId],
    );
    const pubLogs = publications.length
      ? publications
      : await this.safeQuery<{ total: number }>(
          `SELECT COUNT(*)::int AS total FROM faculty_research_logs WHERE tenant_id = $1`,
          [tenantId],
        );
    const patents = await this.safeQuery<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM faculty_patents WHERE tenant_id = $1`,
      [tenantId],
    );

    const nirfScoreSimulation = {
      teaching_learning: 72,
      research_professional_practice:
        Number(pubLogs[0]?.total ?? 0) > 5 ? 78 : 65,
      graduation_outcomes: placementByDept.length ? 74 : 60,
      outreach_inclusivity: 70,
      perception: 68,
      overall_index: 71,
    };

    return {
      nirf_simulation: nirfScoreSimulation,
      placement_by_department: placementByDept,
      research_output: {
        publications: Number(pubLogs[0]?.total ?? 0),
        patents: Number(patents[0]?.total ?? 0),
      },
    };
  }

  async getFacultyData(tenantId: string, tab: string, _academicYear?: string) {
    const queries: Record<string, string> = {
      publications: `
        SELECT u.name AS faculty_name, d.dept_name, fr.publication_title AS title,
               fr.journal_name AS journal_or_conference, fr.publication_type, fr.indexing_type AS indexed_in,
               fr.published_date::text AS event_date
        FROM faculty_research_logs fr
        JOIN users u ON u.user_id = fr.faculty_user_id
        LEFT JOIN departments d ON d.dept_id = u.dept_id
        WHERE fr.tenant_id = $1
        ORDER BY fr.published_date DESC NULLS LAST LIMIT 500`,
      patents: `
        SELECT u.name AS faculty_name, d.dept_name, p.title, p.patent_number, p.status,
               p.filed_date::text, p.granted_date::text
        FROM faculty_patents p
        JOIN users u ON u.user_id = p.faculty_user_id
        LEFT JOIN departments d ON d.dept_id = u.dept_id
        WHERE p.tenant_id = $1 ORDER BY p.created_at DESC LIMIT 500`,
      fdp: `
        SELECT u.name AS faculty_name, d.dept_name, f.program_name, f.organizer, f.program_type,
               f.start_date::text, f.end_date::text, f.hours
        FROM faculty_fdp_sttp_records f
        JOIN users u ON u.user_id = f.faculty_user_id
        LEFT JOIN departments d ON d.dept_id = u.dept_id
        WHERE f.tenant_id = $1 ORDER BY f.start_date DESC LIMIT 500`,
      consultancy: `
        SELECT u.name AS faculty_name, d.dept_name, c.client_name, c.project_title,
               c.amount, c.start_date::text, c.end_date::text
        FROM faculty_consultancy_work c
        JOIN users u ON u.user_id = c.faculty_user_id
        LEFT JOIN departments d ON d.dept_id = u.dept_id
        WHERE c.tenant_id = $1 ORDER BY c.start_date DESC LIMIT 500`,
      projects: `
        SELECT u.name AS faculty_name, d.dept_name, r.title, r.funding_agency,
               r.grant_amount, r.status, r.start_date::text, r.end_date::text
        FROM faculty_research_projects r
        JOIN users u ON u.user_id = r.principal_investigator_user_id
        LEFT JOIN departments d ON d.dept_id = u.dept_id
        WHERE r.tenant_id = $1 ORDER BY r.start_date DESC LIMIT 500`,
    };

    const sql = queries[tab] ?? queries.publications;
    const rows = await this.safeQuery(sql, [tenantId]);

    return {
      tab,
      academic_year: _academicYear ?? 'All',
      rows,
      export_columns: rows[0] ? Object.keys(rows[0]) : [],
    };
  }

  async getStudentOutcomes(tenantId: string) {
    const placement = await this.safeQuery(
      `SELECT * FROM iqac_mv_placement_stats WHERE tenant_id = $1`,
      [tenantId],
    );
    const alumniProgression = await this.safeQuery<{
      pg_pursuing: number;
      total_alumni: number;
    }>(
      `SELECT COUNT(*) FILTER (WHERE higher_education_details->>'degree' IS NOT NULL)::int AS pg_pursuing,
              COUNT(*)::int AS total_alumni
       FROM alumni_profiles WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')`,
      [tenantId],
    );

    const batchPlaced = await this.safeQuery<{
      placed: number;
      avg_lpa: string;
      max_lpa: string;
    }>(
      `SELECT COUNT(DISTINCT pja.student_user_id)::int AS placed,
              ROUND(AVG(jp.ctc_lpa)::numeric, 2) AS avg_lpa,
              ROUND(MAX(jp.ctc_lpa)::numeric, 2) AS max_lpa
       FROM placement_job_applications pja
       JOIN placement_job_postings jp ON jp.job_id = pja.job_id
       JOIN users u ON u.user_id = pja.student_user_id
       WHERE u.tenant_id = $1 AND pja.status IN ('ACCEPTED', 'OFFERED')`,
      [tenantId],
    );

    let studentTotal = await this.safeQuery<{ total_students: number }>(
      `SELECT total_students FROM iqac_mv_student_counts WHERE tenant_id = $1`,
      [tenantId],
    );
    if (!studentTotal.length) {
      studentTotal = await this.safeQuery(
        `SELECT COUNT(DISTINCT u.user_id)::int AS total_students
         FROM users u JOIN roles r ON r.role_id = u.role_id
         WHERE u.tenant_id = $1 AND r.role_name = 'Student'`,
        [tenantId],
      );
    }

    const totalStudents = Number(studentTotal[0]?.total_students ?? 0);
    const placed = Number(batchPlaced[0]?.placed ?? 0);

    return {
      progression: alumniProgression[0] ?? { pg_pursuing: 0, total_alumni: 0 },
      placement: {
        total_placed: placed,
        average_lpa: Number(batchPlaced[0]?.avg_lpa ?? 0),
        highest_lpa: Number(batchPlaced[0]?.max_lpa ?? 0),
        placement_percent:
          totalStudents > 0
            ? Number(((placed / totalStudents) * 100).toFixed(1))
            : 0,
        by_department: placement,
      },
    };
  }

  async getRepository(
    tenantId: string,
    criterion?: number,
    academicYear = '2025-2026',
  ) {
    const params: unknown[] = [tenantId, academicYear];
    let sql = `
      SELECT document_id, naac_criterion, metric_number, title, file_path, academic_year, created_at,
             u.name AS uploaded_by_name
      FROM iqac_document_repository r
      LEFT JOIN users u ON u.user_id = r.uploaded_by
      WHERE r.tenant_id = $1 AND r.academic_year = $2`;
    if (criterion) {
      params.push(criterion);
      sql += ` AND r.naac_criterion = $${params.length}`;
    }
    sql += ' ORDER BY naac_criterion, metric_number';

    const documents = await this.safeQuery(sql, params);
    let health = await this.safeQuery<{
      naac_criterion: number;
      document_count: number;
    }>(
      `SELECT naac_criterion, document_count FROM iqac_mv_repository_health
       WHERE tenant_id = $1 AND academic_year = $2`,
      [tenantId, academicYear],
    );
    if (!health.length) {
      health = await this.safeQuery(
        `SELECT naac_criterion, COUNT(*)::int AS document_count
         FROM iqac_document_repository
         WHERE tenant_id = $1 AND academic_year = $2
         GROUP BY naac_criterion`,
        [tenantId, academicYear],
      );
    }

    const healthMap = new Map(
      (health as { naac_criterion: number; document_count: number }[]).map(
        (h) => [h.naac_criterion, h.document_count],
      ),
    );

    return {
      academic_year: academicYear,
      criteria: NAAC_CRITERIA.map((c) => ({
        ...c,
        document_count: healthMap.get(c.criterion) ?? 0,
        readiness:
          (healthMap.get(c.criterion) ?? 0) >= 3
            ? 'READY'
            : (healthMap.get(c.criterion) ?? 0) >= 1
              ? 'IN_PROGRESS'
              : 'NEEDS_ATTENTION',
      })),
      documents,
    };
  }

  private async refreshRepositoryHealthView() {
    try {
      await this.dataSource.query(
        `REFRESH MATERIALIZED VIEW CONCURRENTLY iqac_mv_repository_health`,
      );
    } catch {
      try {
        await this.dataSource.query(
          `REFRESH MATERIALIZED VIEW iqac_mv_repository_health`,
        );
      } catch (err) {
        this.logger.warn(
          `Repository health refresh skipped: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  async addRepositoryDocument(
    tenantId: string,
    userId: string,
    dto: {
      naac_criterion: number;
      metric_number?: string;
      title: string;
      file_path: string;
      academic_year?: string;
    },
  ) {
    if (!dto.title?.trim() || !dto.file_path?.trim()) {
      throw new BadRequestException('title and file_path are required');
    }
    const criterion = Number(dto.naac_criterion);
    if (!Number.isFinite(criterion) || criterion < 1 || criterion > 7) {
      throw new BadRequestException('naac_criterion must be between 1 and 7');
    }
    const academicYear = dto.academic_year?.trim() || '2025-2026';
    const [row] = await this.dataSource.query(
      `INSERT INTO iqac_document_repository
        (tenant_id, naac_criterion, metric_number, title, file_path, uploaded_by, academic_year)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING document_id, naac_criterion, metric_number, title, file_path, academic_year, created_at`,
      [
        tenantId,
        criterion,
        dto.metric_number?.trim() || null,
        dto.title.trim(),
        dto.file_path.trim(),
        userId,
        academicYear,
      ],
    );
    await this.refreshRepositoryHealthView();
    return row;
  }

  async deleteRepositoryDocument(tenantId: string, documentId: string) {
    const [row] = await this.dataSource.query(
      `DELETE FROM iqac_document_repository
       WHERE tenant_id = $1 AND document_id = $2
       RETURNING document_id`,
      [tenantId, documentId],
    );
    if (!row) throw new NotFoundException('Document not found');
    await this.refreshRepositoryHealthView();
    return { deleted: true, document_id: documentId };
  }

  exportRepositoryCsv(
    tenantId: string,
    criterion?: number,
    academicYear = '2025-2026',
  ) {
    return this.getRepository(tenantId, criterion, academicYear).then((data) => {
      const header = [
        'Criterion',
        'Metric',
        'Title',
        'File path',
        'Academic year',
        'Uploaded at',
      ];
      const rows = (data.documents as Array<Record<string, unknown>>).map((d) =>
        [
          String(d.naac_criterion ?? ''),
          String(d.metric_number ?? ''),
          String(d.title ?? ''),
          String(d.file_path ?? ''),
          String(d.academic_year ?? academicYear),
          d.created_at ? new Date(String(d.created_at)).toISOString() : '',
        ]
          .map((c) => `"${c.replace(/"/g, '""')}"`)
          .join(','),
      );
      return [header.join(','), ...rows].join('\n');
    });
  }

  async getAudits(tenantId: string, academicYear = '2025-2026') {
    const feedback = await this.safeQuery(
      `SELECT u.name AS faculty_name, d.dept_name,
              ROUND(AVG(sf.score)::numeric, 2) AS avg_score,
              COUNT(*)::int AS responses
       FROM student_feedback_records sf
       JOIN users u ON u.user_id = sf.faculty_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE sf.tenant_id = $1 AND sf.academic_year = $2
       GROUP BY u.user_id, u.name, d.dept_name
       ORDER BY avg_score DESC`,
      [tenantId, academicYear],
    );

    const deptAvg = await this.safeQuery(
      `SELECT d.dept_name, ROUND(AVG(sf.score)::numeric, 2) AS avg_score, COUNT(*)::int AS responses
       FROM student_feedback_records sf
       JOIN users u ON u.user_id = sf.faculty_user_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE sf.tenant_id = $1 AND sf.academic_year = $2
       GROUP BY d.dept_name ORDER BY avg_score DESC`,
      [tenantId, academicYear],
    );

    const audits = await this.safeQuery(
      `SELECT audit_report_id, audit_type, academic_year, status, department_id, created_at
       FROM academic_audit_reports WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [tenantId],
    );

    return {
      academic_year: academicYear,
      student_satisfaction: { by_faculty: feedback, by_department: deptAvg },
      academic_audits: audits,
    };
  }

  async listReports(tenantId: string) {
    return this.safeQuery(
      `SELECT job_id, report_type, academic_year, status, output_path, created_at, completed_at
       FROM iqac_report_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    );
  }

  async generateReport(
    tenantId: string,
    userId: string,
    dto: { report_type: 'AQAR' | 'SSR'; academic_year: string },
  ) {
    const jobId = randomUUID();
    const kpi = await this.getKpiDashboard(tenantId);
    const outcomes = await this.getStudentOutcomes(tenantId);
    const faculty = await this.getFacultyData(tenantId, 'publications');

    const payload = {
      academic_year: dto.academic_year,
      generated_at: new Date().toISOString(),
      kpi: kpi.gauges,
      placements: outcomes.placement,
      publication_count: faculty.rows.length,
      sections:
        dto.report_type === 'AQAR' ? this.aqarSections() : this.ssrSections(),
    };

    await this.safeQuery(
      `INSERT INTO iqac_report_jobs (job_id, tenant_id, report_type, academic_year, status, payload, requested_by, completed_at)
       VALUES ($1, $2, $3, $4, 'COMPLETED', $5::jsonb, $6, NOW())`,
      [
        jobId,
        tenantId,
        dto.report_type,
        dto.academic_year,
        JSON.stringify(payload),
        userId,
      ],
    );

    return {
      job_id: jobId,
      status: 'COMPLETED',
      report_type: dto.report_type,
      academic_year: dto.academic_year,
      download_payload: payload,
      message: `${dto.report_type} data bundle ready. PDF/Word template export hooks to document service.`,
    };
  }

  exportFacultyCsv(rows: Record<string, unknown>[]) {
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => JSON.stringify(row[h] ?? '')).join(','));
    }
    return lines.join('\n');
  }

  private aqarSections() {
    return [
      'Institutional Data',
      'Academic Programs',
      'Student Enrollment',
      'Faculty Profile',
      'Research & Extension',
      'Infrastructure',
      'Student Support',
    ];
  }

  private ssrSections() {
    return [
      ...this.aqarSections(),
      'Five-Year Trends',
      'Benchmarking',
      'Best Practices',
    ];
  }
}
