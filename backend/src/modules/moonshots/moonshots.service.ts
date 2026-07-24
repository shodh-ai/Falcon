import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class MoonshotsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listPrograms(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM moonshot_programs WHERE tenant_id = $1 ORDER BY code`,
      [this.tenant(tenantId)],
    );
  }

  listProjects(tenantId?: string, studentUserId?: string) {
    const tid = this.tenant(tenantId);
    if (studentUserId) {
      return this.db.query(
        `SELECT p.*, m.code AS program_code, m.name AS program_name
         FROM moonshot_projects p
         JOIN moonshot_programs m ON m.program_id = p.program_id
         WHERE p.tenant_id = $1 AND p.student_user_id = $2
         ORDER BY p.created_at DESC`,
        [tid, studentUserId],
      );
    }
    return this.db.query(
      `SELECT p.*, m.code AS program_code, m.name AS program_name, u.name AS student_name
       FROM moonshot_projects p
       JOIN moonshot_programs m ON m.program_id = p.program_id
       LEFT JOIN users u ON u.user_id = p.student_user_id
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC
       LIMIT 200`,
      [tid],
    );
  }

  async createProject(
    tenantId: string | undefined,
    studentUserId: string,
    body: { program_id: string; title: string; disclosure_notes?: string },
  ) {
    const rows = await this.db.query(
      `INSERT INTO moonshot_projects (
         tenant_id, program_id, title, student_user_id, disclosure_notes, status
       ) VALUES ($1, $2, $3, $4, $5, 'IDEATION')
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.program_id,
        body.title,
        studentUserId,
        body.disclosure_notes ?? null,
      ],
    );
    return rows[0];
  }

  async updateStatus(
    tenantId: string | undefined,
    projectId: string,
    status: string,
    ipAgreementId?: string,
  ) {
    const rows = await this.db.query(
      `UPDATE moonshot_projects
       SET status = $3,
           ip_agreement_id = COALESCE($4, ip_agreement_id)
       WHERE project_id = $1 AND tenant_id = $2
       RETURNING *`,
      [projectId, this.tenant(tenantId), status, ipAgreementId ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Moonshot project not found');
    return rows[0];
  }
}
