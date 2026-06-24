import { BadRequestException, Injectable } from '@nestjs/common';
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
    const departments = await this.departments.find({
      order: { dept_id: 'ASC' },
    });
    const programs = await this.programs.find({ order: { program_id: 'ASC' } });
    const sections = (await this.tableExists('academic_sections'))
      ? await this.dataSource.query(
          `SELECT section_id, section_name, batch_id, program_id, capacity FROM academic_sections WHERE tenant_id = $1 ORDER BY section_name`,
          [tenantId],
        )
      : [];
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
    dto: {
      section_name: string;
      batch_id?: string;
      program_id?: number;
      capacity?: number;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO academic_sections (tenant_id, batch_id, program_id, section_name, capacity)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        tenantId,
        dto.batch_id ?? null,
        dto.program_id ?? null,
        dto.section_name,
        dto.capacity ?? 60,
      ],
    );
    return rows[0];
  }

  async assignEntity(
    tenantId: string,
    actorUserId: string,
    dto: {
      user_id: string;
      assignment_type: string;
      entity_type: string;
      entity_id: string;
    },
  ) {
    const userId = this.requireUuid(dto.user_id, 'user_id');
    const entityId = dto.entity_id?.trim();
    if (!entityId) {
      throw new BadRequestException('entity_id is required');
    }

    const user = await this.dataSource.query<{ user_id: string }[]>(
      `SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2 AND is_active = true`,
      [userId, tenantId],
    );
    if (!user[0]) {
      throw new BadRequestException('User not found or inactive in this tenant');
    }

    if (dto.assignment_type === 'DEAN' && dto.entity_type === 'SCHOOL') {
      const schoolId = Number(entityId);
      if (!Number.isInteger(schoolId) || schoolId <= 0) {
        throw new BadRequestException('School ID must be a positive number');
      }
      const school = await this.dataSource.query<{ school_id: number }[]>(
        `SELECT school_id FROM schools WHERE school_id = $1`,
        [schoolId],
      );
      if (!school[0]) {
        throw new BadRequestException(`School #${schoolId} not found`);
      }
      await this.dataSource.query(
        `UPDATE schools SET dean_user_id = $1 WHERE school_id = $2`,
        [userId, schoolId],
      );
    } else if (dto.assignment_type === 'HOD' && dto.entity_type === 'DEPARTMENT') {
      const deptId = Number(entityId);
      if (!Number.isInteger(deptId) || deptId <= 0) {
        throw new BadRequestException('Department ID must be a positive number');
      }
      const dept = await this.dataSource.query<{ dept_id: number }[]>(
        `SELECT dept_id FROM departments WHERE dept_id = $1`,
        [deptId],
      );
      if (!dept[0]) {
        throw new BadRequestException(`Department #${deptId} not found`);
      }
      await this.dataSource.query(
        `UPDATE departments SET hod_user_id = $1 WHERE dept_id = $2`,
        [userId, deptId],
      );
    } else {
      throw new BadRequestException(
        'Unsupported assignment. Use DEAN/SCHOOL or HOD/DEPARTMENT.',
      );
    }

    if (!(await this.tableExists('hierarchy_assignments'))) {
      return { assigned: true, pending_migration: true };
    }

    const rows = await this.dataSource.query(
      `INSERT INTO hierarchy_assignments (tenant_id, user_id, assignment_type, entity_type, entity_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, user_id, assignment_type, entity_type, entity_id) DO NOTHING
       RETURNING *`,
      [tenantId, userId, dto.assignment_type, dto.entity_type, entityId],
    );

    try {
      await this.audit.log({
        userId: actorUserId,
        action: 'HIERARCHY_ASSIGN',
        entityType: dto.entity_type,
        entityId: dto.entity_id,
        details: dto,
      });
    } catch {
      /* audit failure must not block hierarchy assignment */
    }

    return rows[0] ?? { assigned: true };
  }

  async listAssignableUsers(tenantId: string, q?: string) {
    const term = q?.trim();
    return this.dataSource.query<
      { user_id: string; name: string; email: string; role_name: string }[]
    >(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name
       FROM users u
       INNER JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.deleted_at IS NULL
         AND r.role_name IN ('Dean', 'HOD', 'Faculty', 'SuperAdmin')
         AND (
           $2::text IS NULL OR $2 = ''
           OR u.name ILIKE '%' || $2 || '%'
           OR u.official_email ILIKE '%' || $2 || '%'
         )
       ORDER BY u.name ASC
       LIMIT 50`,
      [tenantId, term ?? ''],
    );
  }

  private requireUuid(value: string, label: string): string {
    const trimmed = value?.trim();
    if (!trimmed) {
      throw new BadRequestException(`${label} is required`);
    }
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      throw new BadRequestException(`${label} must be a valid UUID`);
    }
    return trimmed;
  }

  async bulkAssignSection(
    tenantId: string,
    actorUserId: string,
    sectionId: string,
    studentUserIds: string[],
  ) {
    if (!(await this.tableExists('section_student_members'))) {
      return { section_id: sectionId, assigned: 0, pending_migration: true };
    }

    for (const studentUserId of studentUserIds) {
      await this.dataSource.query(
        `INSERT INTO section_student_members (tenant_id, section_id, student_user_id)
         VALUES ($1, $2, $3) ON CONFLICT (section_id, student_user_id) DO NOTHING`,
        [tenantId, sectionId, studentUserId],
      );
    }
    try {
      await this.audit.log({
        userId: actorUserId,
        action: 'SECTION_BULK_ASSIGN',
        entityType: 'SECTION',
        entityId: sectionId,
        details: { count: studentUserIds.length },
      });
    } catch {
      /* non-blocking */
    }
    return { section_id: sectionId, assigned: studentUserIds.length };
  }

  async listAssignments(tenantId: string) {
    if (!(await this.tableExists('hierarchy_assignments'))) return [];

    return this.dataSource.query(
      `SELECT a.*, u.name AS user_name, u.official_email
       FROM hierarchy_assignments a
       JOIN users u ON u.user_id = a.user_id
       WHERE a.tenant_id = $1
       ORDER BY a.created_at DESC`,
      [tenantId],
    );
  }

  async listImpersonationSessions(tenantId: string) {
    if (!(await this.tableExists('impersonation_sessions'))) return [];

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

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM pg_tables
         WHERE schemaname = 'public' AND tablename = $1
       ) AS exists`,
      [tableName],
    );
    return Boolean(rows[0]?.exists);
  }

  async listHrOverrideLogs(tenantId: string) {
    if (!(await this.tableExists('hr_override_logs'))) return [];

    return this.dataSource.query(
      `SELECT log_id, employee_id, assigned_approver, bypassed_by, type_of_action, type_of_request, date_and_time 
       FROM hr_override_logs 
       WHERE tenant_id = $1 
       ORDER BY date_and_time DESC LIMIT 500`,
      [tenantId],
    );
  }
}
