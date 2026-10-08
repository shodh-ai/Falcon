import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SpecialProgramsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listPrograms(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM special_programs WHERE tenant_id = $1 ORDER BY code`,
      [this.tenant(tenantId)],
    );
  }

  listEnrollments(tenantId?: string, programCode?: string) {
    const tid = this.tenant(tenantId);
    if (programCode) {
      return this.db.query(
        `SELECT e.*, p.code, p.name AS program_name, u.name AS student_name
         FROM special_program_enrollments e
         JOIN special_programs p ON p.program_id = e.program_id
         LEFT JOIN users u ON u.user_id = e.student_user_id
         WHERE p.tenant_id = $1 AND p.code = $2
         ORDER BY e.created_at DESC`,
        [tid, programCode],
      );
    }
    return this.db.query(
      `SELECT e.*, p.code, p.name AS program_name, u.name AS student_name
       FROM special_program_enrollments e
       JOIN special_programs p ON p.program_id = e.program_id
       LEFT JOIN users u ON u.user_id = e.student_user_id
       WHERE p.tenant_id = $1
       ORDER BY e.created_at DESC`,
      [tid],
    );
  }

  async enroll(
    tenantId: string | undefined,
    studentUserId: string,
    programId: string,
    metadata?: Record<string, unknown>,
  ) {
    const rows = await this.db.query(
      `INSERT INTO special_program_enrollments (program_id, student_user_id, status, metadata)
       VALUES ($1, $2, 'ENROLLED', $3::jsonb)
       RETURNING *`,
      [programId, studentUserId, JSON.stringify(metadata ?? {})],
    );
    return rows[0];
  }

  listPop(tenantId?: string) {
    return this.db.query(
      `SELECT p.*, u.name AS user_name, u.official_email AS email
       FROM pop_profiles p
       JOIN users u ON u.user_id = p.user_id
       WHERE p.tenant_id = $1 AND p.is_active = true
       ORDER BY u.name`,
      [this.tenant(tenantId)],
    );
  }

  async upsertPop(
    tenantId: string | undefined,
    body: {
      user_id: string;
      title?: string;
      bio?: string;
      equity_incentive_pct?: number;
      linked_ecell_project_ids?: string[];
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO pop_profiles (
         tenant_id, user_id, title, bio, equity_incentive_pct, linked_ecell_project_ids
       ) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         title = EXCLUDED.title,
         bio = EXCLUDED.bio,
         equity_incentive_pct = EXCLUDED.equity_incentive_pct,
         linked_ecell_project_ids = EXCLUDED.linked_ecell_project_ids,
         is_active = true
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.user_id,
        body.title ?? null,
        body.bio ?? null,
        body.equity_incentive_pct ?? 1.5,
        body.linked_ecell_project_ids ?? [],
      ],
    );
    return rows[0];
  }

  listArtifacts(tenantId?: string, studentUserId?: string) {
    const tid = this.tenant(tenantId);
    if (studentUserId) {
      return this.db.query(
        `SELECT * FROM portfolio_transcript_artifacts
         WHERE tenant_id = $1 AND student_user_id = $2
         ORDER BY created_at DESC`,
        [tid, studentUserId],
      );
    }
    return this.db.query(
      `SELECT a.*, u.name AS student_name
       FROM portfolio_transcript_artifacts a
       LEFT JOIN users u ON u.user_id = a.student_user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC
       LIMIT 200`,
      [tid],
    );
  }

  async addArtifact(
    tenantId: string | undefined,
    studentUserId: string,
    body: {
      artifact_type: string;
      title: string;
      url?: string;
      evidence_json?: Record<string, unknown>;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO portfolio_transcript_artifacts (
         tenant_id, student_user_id, artifact_type, title, url, evidence_json
       ) VALUES ($1, $2, $3, $4, $5, $6::jsonb)
       RETURNING *`,
      [
        this.tenant(tenantId),
        studentUserId,
        body.artifact_type,
        body.title,
        body.url ?? null,
        JSON.stringify(body.evidence_json ?? {}),
      ],
    );
    return rows[0];
  }

  async publishTranscript(
    tenantId: string | undefined,
    studentUserId: string,
    mode: string,
  ) {
    const artifacts = await this.listArtifacts(tenantId, studentUserId);
    const rows = await this.db.query(
      `INSERT INTO portfolio_transcripts (
         tenant_id, student_user_id, mode, published_at, summary_json
       ) VALUES ($1, $2, $3, NOW(), $4::jsonb)
       RETURNING *`,
      [
        this.tenant(tenantId),
        studentUserId,
        mode || 'PORTFOLIO',
        JSON.stringify({ artifact_count: artifacts.length, artifacts }),
      ],
    );
    return rows[0];
  }

  listHsDirect(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM admissions_pathway_flags
       WHERE tenant_id = $1 AND pathway = 'HS_DIRECT'
       ORDER BY created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async createHsDirect(
    tenantId: string | undefined,
    body: {
      email?: string;
      lead_id?: string;
      grade_level?: string;
      checklist?: Record<string, unknown>;
    },
  ) {
    const rows = await this.db.query(
      `INSERT INTO admissions_pathway_flags (
         tenant_id, lead_id, email, pathway, bypass_jee, grade_level, checklist
       ) VALUES ($1, $2, $3, 'HS_DIRECT', true, $4, $5::jsonb)
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.lead_id ?? null,
        body.email ?? null,
        body.grade_level ?? null,
        JSON.stringify(body.checklist ?? { whitepaper: false, github: false }),
      ],
    );
    return rows[0];
  }

  async getProgramByCode(tenantId: string | undefined, code: string) {
    const rows = await this.db.query(
      `SELECT * FROM special_programs WHERE tenant_id = $1 AND code = $2`,
      [this.tenant(tenantId), code],
    );
    if (!rows[0]) throw new NotFoundException('Program not found');
    return rows[0];
  }
}
