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
      admissions: `SELECT u.user_id, u.name, u.official_email, sp.enrollment_no, sp.batch, r.role_name, u.created_at
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
      convocation: `SELECT ca.application_id, u.name AS student_name, sp.enrollment_no,
                           ca.verification_status, ca.certificate_generated, ca.updated_at
                    FROM cert_applications ca
                    JOIN users u ON u.user_id = ca.student_user_id
                    LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
                    WHERE ca.tenant_id = $1
                    ORDER BY ca.updated_at DESC`,
      degrees: `SELECT ca.application_id, u.name AS student_name, ca.verification_status,
                       ca.certificate_url, ca.updated_at
                FROM cert_applications ca
                JOIN users u ON u.user_id = ca.student_user_id
                WHERE ca.tenant_id = $1 AND ca.verification_status = 'VERIFIED'
                ORDER BY ca.updated_at DESC`,
      certificates: `SELECT ca.application_id, u.name AS student_name, ca.certificate_generated,
                            ca.certificate_url, ce.event_name
                     FROM cert_applications ca
                     JOIN users u ON u.user_id = ca.student_user_id
                     JOIN cert_events ce ON ce.event_id = ca.event_id
                     WHERE ca.tenant_id = $1`,
      transcripts: `SELECT t.transcript_id, u.name AS student_name, t.semester, t.status,
                           t.verification_code, t.pdf_url, t.generated_at, t.archived_at
                    FROM official_transcripts t
                    JOIN users u ON u.user_id = t.student_user_id
                    WHERE t.tenant_id = $1
                    ORDER BY t.created_at DESC`,
      phd: `SELECT pc.candidate_id, u.name AS candidate_name, pc.lifecycle_status,
                   pc.stage, pc.updated_at
            FROM phd_candidates pc
            LEFT JOIN users u ON u.user_id = pc.user_id
            WHERE pc.tenant_id = $1
            ORDER BY pc.updated_at DESC`,
      verification: `SELECT u.user_id, u.name, u.official_email, u.onboarding_status, u.updated_at
                     FROM users u
                     WHERE u.tenant_id = $1
                       AND u.onboarding_status IN ('PENDING_ADMIN_APPROVAL', 'COMPLETED', 'PENDING_DOCUMENTS')
                     ORDER BY u.updated_at DESC`,
      bulk_upload: `SELECT r.run_id, r.filename, r.rows_total, r.rows_imported, r.rows_failed,
                           r.duplicate_rows, r.status, r.created_at, u.name AS uploader_name
                    FROM student_bulk_upload_runs r
                    JOIN users u ON u.user_id = r.actor_user_id
                    WHERE r.tenant_id = $1
                    ORDER BY r.created_at DESC`,
      governance: `SELECT ta.assignment_id, tm.task_name, u.name AS assignee,
                          ta.status, ta.due_date, s.uploaded_at, s.file_name
                   FROM task_assignments ta
                   JOIN task_master tm ON tm.task_id = ta.task_id
                   JOIN users u ON u.user_id = ta.assigned_to
                   LEFT JOIN submissions s ON s.assignment_id = ta.assignment_id
                   WHERE u.tenant_id = $1
                   ORDER BY ta.due_date DESC`,
    };
    const sql = queries[dataset];
    if (!sql) return { dataset, rows: [], note: 'Unknown dataset key' };
    const rows = await this.db.query(sql, [tenantId]).catch(() => []);
    return {
      dataset,
      exported_at: new Date().toISOString(),
      row_count: rows.length,
      rows,
    };
  }
}
