import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const ALLOWED_STATUS = new Set([
  'IDEATION',
  'ACTIVE',
  'DISCLOSURE',
  'IP_LINKED',
  'ARCHIVED',
]);

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

  listProjects(
    tenantId?: string,
    opts?: { studentUserId?: string; guideUserId?: string },
  ) {
    const tid = this.tenant(tenantId);
    if (opts?.studentUserId) {
      return this.db.query(
        `SELECT p.*, m.code AS program_code, m.name AS program_name
         FROM moonshot_projects p
         JOIN moonshot_programs m ON m.program_id = p.program_id
         WHERE p.tenant_id = $1 AND p.student_user_id = $2
         ORDER BY p.created_at DESC`,
        [tid, opts.studentUserId],
      );
    }
    if (opts?.guideUserId) {
      return this.db.query(
        `SELECT p.*, m.code AS program_code, m.name AS program_name, u.name AS student_name
         FROM moonshot_projects p
         JOIN moonshot_programs m ON m.program_id = p.program_id
         LEFT JOIN users u ON u.user_id = p.student_user_id
         WHERE p.tenant_id = $1
           AND (p.guide_user_id = $2 OR p.student_user_id = $2)
         ORDER BY p.created_at DESC
         LIMIT 200`,
        [tid, opts.guideUserId],
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
    actorUserId: string,
    body: {
      program_id: string;
      title: string;
      disclosure_notes?: string;
      student_user_id?: string;
    },
    mode: 'student' | 'faculty' = 'student',
  ) {
    if (!body.program_id?.trim() || !body.title?.trim()) {
      throw new BadRequestException('program_id and title are required');
    }

    const studentUserId =
      mode === 'student' ? actorUserId : body.student_user_id?.trim() || null;
    const guideUserId = mode === 'faculty' ? actorUserId : null;

    if (mode === 'student' && !studentUserId) {
      throw new BadRequestException('Student identity required');
    }

    const rows = await this.db.query(
      `INSERT INTO moonshot_projects (
         tenant_id, program_id, title, student_user_id, guide_user_id, disclosure_notes, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'IDEATION')
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.program_id,
        body.title.trim(),
        studentUserId,
        guideUserId,
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
    const normalized = (status ?? '').trim().toUpperCase();
    if (!ALLOWED_STATUS.has(normalized)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${Array.from(ALLOWED_STATUS).join(', ')}`,
      );
    }
    const rows = await this.db.query(
      `UPDATE moonshot_projects
       SET status = $3,
           ip_agreement_id = COALESCE($4, ip_agreement_id)
       WHERE project_id = $1 AND tenant_id = $2
       RETURNING *`,
      [projectId, this.tenant(tenantId), normalized, ipAgreementId ?? null],
    );
    if (!rows[0]) throw new NotFoundException('Moonshot project not found');
    return rows[0];
  }
}
