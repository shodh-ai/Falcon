import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class ReportsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  listPolicyDocuments(tenantId: string) {
    return this.db.query(
      `SELECT document_id, folder, title, file_url, is_read_only
       FROM global_policy_documents
       WHERE tenant_id = $1
       ORDER BY folder, title`,
      [tenantId],
    );
  }

  async warehouseExport(tenantId: string, dataset: string) {
    const queries: Record<string, string> = {
      admissions: `SELECT u.user_id, u.name, u.official_email, sp.enrollment_no, sp.batch_year, r.role_name, u.created_at
                  FROM users u
                  LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
                  JOIN roles r ON r.role_id = u.role_id
                  WHERE u.tenant_id = $1 AND r.role_name IN ('Student', 'Applicant')`,
      faculty_workload: `SELECT u.name, d.dept_name, COUNT(cal.log_id) AS attendance_sessions
                         FROM users u
                         JOIN roles r ON r.role_id = u.role_id AND r.role_name = 'Faculty'
                         LEFT JOIN departments d ON d.dept_id = u.dept_id
                         LEFT JOIN course_attendance_logs cal ON cal.faculty_user_id = u.user_id
                         WHERE u.tenant_id = $1
                         GROUP BY u.user_id, u.name, d.dept_name`,
      attendance_analytics: `SELECT c.course_code, ROUND(AVG(e.attendance_percent)::numeric, 2) AS avg_attendance
                             FROM student_course_enrollments e
                             JOIN academic_courses c ON c.course_id = e.course_id
                             JOIN users u ON u.user_id = e.student_user_id AND u.tenant_id = $1
                             GROUP BY c.course_code`,
      finance_collections: `SELECT DATE(created_at) AS day, SUM(amount) AS collected
                            FROM finance_transactions
                            WHERE tenant_id = $1 AND status = 'SUCCESS'
                            GROUP BY DATE(created_at) ORDER BY day`,
      placement_stats: `SELECT c.company_name, COUNT(a.application_id) AS applications
                        FROM placement_drive_applications a
                        JOIN placement_drives d ON d.drive_id = a.drive_id
                        JOIN placement_companies c ON c.company_id = d.company_id
                        WHERE a.tenant_id = $1
                        GROUP BY c.company_name`,
    };
    const sql = queries[dataset];
    if (!sql) return { dataset, rows: [], note: 'Unknown dataset key' };
    const rows = await this.db.query(sql, [tenantId]);
    return {
      dataset,
      exported_at: new Date().toISOString(),
      row_count: rows.length,
      rows,
    };
  }
}
