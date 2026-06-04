import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { Campus } from '../../entities/campus.entity';
import { School } from '../../entities/school.entity';
import { Program } from '../../entities/program.entity';
import { Department } from '../../entities/department.entity';
import { Batch } from '../../entities/batch.entity';
import { AuditService } from '../../core/audit/audit.service';

@Injectable()
export class SuperAdminService {
  constructor(
    @InjectRepository(Campus) private campuses: Repository<Campus>,
    @InjectRepository(School) private schools: Repository<School>,
    @InjectRepository(Program) private programs: Repository<Program>,
    @InjectRepository(Department) private departments: Repository<Department>,
    @InjectRepository(Batch) private batches: Repository<Batch>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async getHierarchyTree(tenantId: string) {
    const campuses = await this.campuses.find({ order: { campus_id: 'ASC' } });
    const schools = await this.schools.find({ order: { school_id: 'ASC' } });
    const departments = await this.departments.find({ order: { dept_id: 'ASC' } });
    const programs = await this.programs.find({ order: { program_id: 'ASC' } });
    const sections = await this.dataSource.query(
      `SELECT section_id, section_name, batch_id, program_id, capacity FROM academic_sections WHERE tenant_id = $1 ORDER BY section_name`,
      [tenantId],
    );
    const batchRows = await this.batches.find({ order: { batch_id: 'ASC' } });

    return {
      campuses,
      schools,
      departments,
      programs,
      batches: batchRows,
      sections,
    };
  }

  async createSection(
    tenantId: string,
    dto: { section_name: string; batch_id?: string; program_id?: number; capacity?: number },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO academic_sections (tenant_id, batch_id, program_id, section_name, capacity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [tenantId, dto.batch_id ?? null, dto.program_id ?? null, dto.section_name, dto.capacity ?? 60],
    );
    return rows[0];
  }

  async assignEntity(
    tenantId: string,
    actorUserId: string,
    dto: { user_id: string; assignment_type: string; entity_type: string; entity_id: string },
  ) {
    if (dto.assignment_type === 'DEAN' && dto.entity_type === 'SCHOOL') {
      await this.dataSource.query(
        `UPDATE schools SET dean_user_id = $1 WHERE school_id = $2`,
        [dto.user_id, Number(dto.entity_id)],
      );
    }
    if (dto.assignment_type === 'HOD' && dto.entity_type === 'DEPARTMENT') {
      await this.dataSource.query(
        `UPDATE departments SET hod_user_id = $1 WHERE dept_id = $2`,
        [dto.user_id, Number(dto.entity_id)],
      );
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hierarchy_assignments (tenant_id, user_id, assignment_type, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, user_id, assignment_type, entity_type, entity_id) DO NOTHING
       RETURNING *`,
      [tenantId, dto.user_id, dto.assignment_type, dto.entity_type, dto.entity_id],
    );

    await this.audit.log({
      userId: actorUserId,
      action: 'HIERARCHY_ASSIGN',
      entityType: dto.entity_type,
      entityId: dto.entity_id,
      details: dto,
    });

    return rows[0] ?? { assigned: true };
  }

  async bulkAssignSection(
    tenantId: string,
    actorUserId: string,
    sectionId: string,
    studentUserIds: string[],
  ) {
    for (const studentUserId of studentUserIds) {
      await this.dataSource.query(
        `INSERT INTO section_student_members (tenant_id, section_id, student_user_id)
         VALUES ($1, $2, $3) ON CONFLICT (section_id, student_user_id) DO NOTHING`,
        [tenantId, sectionId, studentUserId],
      );
    }
    await this.audit.log({
      userId: actorUserId,
      action: 'SECTION_BULK_ASSIGN',
      entityType: 'SECTION',
      entityId: sectionId,
      details: { count: studentUserIds.length },
    });
    return { section_id: sectionId, assigned: studentUserIds.length };
  }

  listAssignments(tenantId: string) {
    return this.dataSource.query(
      `SELECT a.*, u.name AS user_name, u.official_email
       FROM hierarchy_assignments a
       JOIN users u ON u.user_id = a.user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [tenantId],
    );
  }

  listImpersonationSessions(tenantId: string) {
    return this.dataSource.query(
      `SELECT s.*, i.name AS impersonator_name, t.name AS target_name
       FROM impersonation_sessions s
       JOIN users i ON i.user_id = s.impersonator_user_id
       JOIN users t ON t.user_id = s.target_user_id
       WHERE s.tenant_id = $1
       ORDER BY s.started_at DESC LIMIT 100`,
      [tenantId],
    );
  }
}
