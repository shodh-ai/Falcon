import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    void tenantId;
    const campuses = await this.campuses.find({ order: { campus_id: 'ASC' } });
    const schools = await this.schools.find({ order: { school_id: 'ASC' } });
    const departmentRows = await this.dataSource.query<
      Array<{
        dept_id: number;
        dept_name: string;
        school_id: number | null;
        program_school_ids: number[] | null;
      }>
    >(
      `SELECT d.dept_id,
              d.dept_name,
              d.school_id,
              COALESCE(
                array_agg(DISTINCT p.school_id) FILTER (WHERE p.school_id IS NOT NULL),
                ARRAY[]::int[]
              ) AS program_school_ids
       FROM departments d
       LEFT JOIN iam_programs p
         ON p.dept_id = d.dept_id AND p.deleted_at IS NULL
       WHERE d.deleted_at IS NULL
       GROUP BY d.dept_id, d.dept_name, d.school_id
       ORDER BY d.dept_name ASC`,
    );
    const programs = await this.programs.find({ order: { program_id: 'ASC' } });
    const batchRows = await this.batches.find({ order: { batch_id: 'ASC' } });

    return {
      campuses,
      schools,
      departments: departmentRows.map((row) => {
        const schoolIds = Array.from(
          new Set<number>([
            ...(row.school_id ? [row.school_id] : []),
            ...(row.program_school_ids ?? []),
          ]),
        );
        return {
          dept_id: row.dept_id,
          dept_name: row.dept_name,
          school_id: row.school_id,
          school_ids: schoolIds,
        };
      }),
      programs,
      batches: batchRows,
    };
  }

  async linkDepartmentToSchool(
    tenantId: string,
    actorUserId: string,
    deptId: number,
    schoolId: number,
  ) {
    void tenantId;
    if (!Number.isInteger(deptId) || deptId <= 0) {
      throw new BadRequestException('Department ID must be a positive number');
    }
    if (!Number.isInteger(schoolId) || schoolId <= 0) {
      throw new BadRequestException('School ID must be a positive number');
    }

    const dept = await this.dataSource.query<{ dept_id: number }[]>(
      `SELECT dept_id FROM departments WHERE dept_id = $1 AND deleted_at IS NULL`,
      [deptId],
    );
    if (!dept[0]) {
      throw new NotFoundException(`Department #${deptId} not found`);
    }

    const school = await this.dataSource.query<{ school_id: number }[]>(
      `SELECT school_id FROM schools WHERE school_id = $1`,
      [schoolId],
    );
    if (!school[0]) {
      throw new NotFoundException(`School #${schoolId} not found`);
    }

    const rows = await this.dataSource.query(
      `UPDATE departments
       SET school_id = $1, updated_at = NOW()
       WHERE dept_id = $2 AND deleted_at IS NULL
       RETURNING dept_id, dept_name, school_id`,
      [schoolId, deptId],
    );

    try {
      await this.audit.log({
        userId: actorUserId,
        action: 'HIERARCHY_DEPT_SCHOOL_LINK',
        entityType: 'DEPARTMENT',
        entityId: String(deptId),
        details: { dept_id: deptId, school_id: schoolId },
      });
    } catch {
      /* audit failure must not block link */
    }

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
      throw new BadRequestException(
        'User not found or inactive in this tenant',
      );
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
      await this.dataSource.query(
        `UPDATE users u
         SET role_id = r.role_id, updated_at = NOW()
         FROM roles r
         WHERE u.user_id = $1
           AND u.tenant_id = $2
           AND r.role_name = 'Dean'`,
        [userId, tenantId],
      );
    } else if (
      dto.assignment_type === 'HOD' &&
      dto.entity_type === 'DEPARTMENT'
    ) {
      const deptId = Number(entityId);
      if (!Number.isInteger(deptId) || deptId <= 0) {
        throw new BadRequestException(
          'Department ID must be a positive number',
        );
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
      await this.dataSource.query(
        `UPDATE users SET dept_id = $2, updated_at = NOW() WHERE user_id = $1 AND tenant_id = $3`,
        [userId, deptId, tenantId],
      );
      await this.dataSource.query(
        `UPDATE users u
         SET role_id = r.role_id, updated_at = NOW()
         FROM roles r
         WHERE u.user_id = $1
           AND u.tenant_id = $2
           AND r.role_name = 'HOD'`,
        [userId, tenantId],
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

  async revokeAssignment(
    tenantId: string,
    actorUserId: string,
    assignmentId: string,
  ) {
    if (!(await this.tableExists('hierarchy_assignments'))) {
      throw new NotFoundException('Assignment not found');
    }

    const assignmentIdTrimmed = assignmentId?.trim();
    if (
      !assignmentIdTrimmed ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        assignmentIdTrimmed,
      )
    ) {
      throw new BadRequestException('assignment_id must be a valid UUID');
    }

    const rows = await this.dataSource.query<
      {
        assignment_id: string;
        assignment_type: string;
        entity_type: string;
        entity_id: string;
        user_id: string;
      }[]
    >(
      `SELECT assignment_id, assignment_type, entity_type, entity_id, user_id
       FROM hierarchy_assignments
       WHERE assignment_id = $1 AND tenant_id = $2`,
      [assignmentIdTrimmed, tenantId],
    );
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Assignment not found');
    }

    if (row.assignment_type === 'DEAN' && row.entity_type === 'SCHOOL') {
      const schoolId = Number(row.entity_id);
      await this.dataSource.query(
        `UPDATE schools SET dean_user_id = NULL WHERE school_id = $1 AND dean_user_id = $2`,
        [schoolId, row.user_id],
      );
    } else if (
      row.assignment_type === 'HOD' &&
      row.entity_type === 'DEPARTMENT'
    ) {
      const deptId = Number(row.entity_id);
      await this.dataSource.query(
        `UPDATE departments SET hod_user_id = NULL WHERE dept_id = $1 AND hod_user_id = $2`,
        [deptId, row.user_id],
      );
    } else {
      throw new BadRequestException('Unsupported assignment type for revoke');
    }

    await this.dataSource.query(
      `DELETE FROM hierarchy_assignments WHERE assignment_id = $1 AND tenant_id = $2`,
      [assignmentIdTrimmed, tenantId],
    );

    try {
      await this.audit.log({
        userId: actorUserId,
        action: 'HIERARCHY_REVOKE',
        entityType: row.entity_type,
        entityId: row.entity_id,
        details: row,
      });
    } catch {
      /* audit failure must not block revoke */
    }

    return { revoked: true };
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

  async listAssignments(tenantId: string) {
    if (!(await this.tableExists('hierarchy_assignments'))) return [];

    return this.dataSource.query(
      `SELECT a.*,
              u.name AS user_name,
              u.official_email,
              COALESCE(
                CASE
                  WHEN upper(a.entity_type) = 'DEPARTMENT' THEN d.dept_name
                  WHEN upper(a.entity_type) = 'SCHOOL' THEN s.school_name
                  ELSE NULL
                END,
                a.entity_id
              ) AS entity_name
       FROM hierarchy_assignments a
       JOIN users u ON u.user_id = a.user_id
       LEFT JOIN departments d
         ON upper(a.entity_type) = 'DEPARTMENT'
        AND d.dept_id = NULLIF(trim(a.entity_id), '')::int
        AND d.deleted_at IS NULL
       LEFT JOIN schools s
         ON upper(a.entity_type) = 'SCHOOL'
        AND s.school_id = NULLIF(trim(a.entity_id), '')::int
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
