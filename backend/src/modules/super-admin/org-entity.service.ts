import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateOrgEntityDto } from './dto/create-org-entity.dto';

@Injectable()
export class OrgEntityService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listEntitiesWithStats(tenantId: string) {
    return this.dataSource.query(
      `SELECT oe.entity_id, oe.entity_code, oe.entity_name, oe.address, oe.contact_email,
              oe.tax_id, oe.logo_url, oe.is_active, oe.created_at,
              COUNT(DISTINCT ep.user_id)::int AS employee_count
       FROM org_entities oe
       LEFT JOIN hr_employee_profiles ep
         ON ep.entity_id = oe.entity_id AND ep.tenant_id = oe.tenant_id
       WHERE oe.tenant_id = $1
       GROUP BY oe.entity_id
       ORDER BY oe.entity_id ASC`,
      [tenantId],
    );
  }

  async createEntity(tenantId: string, creatorUserId: string, dto: CreateOrgEntityDto) {
    const code = dto.entity_code.trim().toUpperCase();
    const existing = await this.dataSource.query(
      `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND entity_code = $2`,
      [tenantId, code],
    );
    if (existing[0]) throw new ConflictException(`Entity code ${code} already exists`);

    const rows = await this.dataSource.query(
      `INSERT INTO org_entities (
         tenant_id, entity_code, entity_name, address, contact_email, tax_id, logo_url, is_active
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        tenantId,
        code,
        dto.entity_name.trim(),
        dto.address?.trim() ?? null,
        dto.contact_email?.trim() ?? null,
        dto.tax_id?.trim() ?? null,
        dto.logo_url?.trim() ?? null,
        dto.is_active ?? true,
      ],
    );
    const entity = rows[0];

    await this.dataSource.query(
      `INSERT INTO user_entity_access (user_id, entity_id, granted_by_user_id)
       VALUES ($1, $2, $1)
       ON CONFLICT (user_id, entity_id) DO NOTHING`,
      [creatorUserId, entity.entity_id],
    );

    await this.dataSource.query(
      `INSERT INTO hr_attendance_rules (tenant_id, entity_id, allowed_early_goings, early_going_max_mins)
       VALUES ($1, $2, 3, 20)
       ON CONFLICT (tenant_id, entity_id) DO NOTHING`,
      [tenantId, entity.entity_id],
    );

    return { ...entity, employee_count: 0 };
  }

  async listEntityAccess(tenantId: string, entityId: number) {
    await this.assertEntityInTenant(tenantId, entityId);
    return this.dataSource.query(
      `SELECT uea.access_id, u.user_id, u.name, u.official_email AS email,
              r.role_name AS role, uea.granted_at
       FROM user_entity_access uea
       INNER JOIN users u ON u.user_id = uea.user_id
       LEFT JOIN roles r ON r.role_id = u.role_id
       WHERE uea.entity_id = $1 AND u.tenant_id = $2
       ORDER BY u.name`,
      [entityId, tenantId],
    );
  }

  async grantAccess(tenantId: string, entityId: number, userId: string, grantedByUserId: string) {
    await this.assertEntityInTenant(tenantId, entityId);
    const userRows = await this.dataSource.query(
      `SELECT user_id FROM users WHERE user_id = $1 AND tenant_id = $2 AND is_active = true`,
      [userId, tenantId],
    );
    if (!userRows[0]) throw new NotFoundException('User not found in tenant');

    await this.dataSource.query(
      `INSERT INTO user_entity_access (user_id, entity_id, granted_by_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, entity_id) DO UPDATE SET granted_by_user_id = EXCLUDED.granted_by_user_id`,
      [userId, entityId, grantedByUserId],
    );
    return this.listEntityAccess(tenantId, entityId);
  }

  async revokeAccess(tenantId: string, entityId: number, userId: string) {
    await this.assertEntityInTenant(tenantId, entityId);
    await this.dataSource.query(
      `DELETE FROM user_entity_access WHERE user_id = $1 AND entity_id = $2`,
      [userId, entityId],
    );
    return { revoked: true };
  }

  async listGrantableUsers(tenantId: string, q?: string) {
    const search = q?.trim() ? `%${q.trim()}%` : null;
    return this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name AS role
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND r.role_name NOT IN ('Student', 'Applicant', 'Parent')
         AND ($2::text IS NULL OR u.name ILIKE $2 OR u.official_email ILIKE $2)
       ORDER BY u.name
       LIMIT 50`,
      [tenantId, search],
    );
  }

  private async assertEntityInTenant(tenantId: string, entityId: number) {
    const rows = await this.dataSource.query(
      `SELECT entity_id FROM org_entities WHERE tenant_id = $1 AND entity_id = $2`,
      [tenantId, entityId],
    );
    if (!rows[0]) throw new NotFoundException('Entity not found');
  }
}
