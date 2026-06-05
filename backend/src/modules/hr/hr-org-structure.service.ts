import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class HrOrgStructureService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listTree(tenantId: string, entityId: number) {
    const rows = await this.dataSource.query(
      `SELECT unit_id, parent_id, unit_type, unit_name, sort_order, is_active
       FROM hr_org_units
       WHERE tenant_id = $1 AND entity_id = $2 AND is_active = true
       ORDER BY sort_order, unit_name`,
      [tenantId, entityId],
    );
    return this.buildTree(rows);
  }

  private buildTree(rows: Array<{ unit_id: string; parent_id: string | null; unit_type: string; unit_name: string; sort_order: number; is_active: boolean }>) {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      map.set(row.unit_id, { ...row, children: [] as Record<string, unknown>[] });
    }
    const roots: Record<string, unknown>[] = [];
    for (const node of map.values()) {
      const parentId = node.parent_id as string | null;
      if (parentId && map.has(parentId)) {
        (map.get(parentId)!.children as Record<string, unknown>[]).push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  async createUnit(
    tenantId: string,
    entityId: number,
    dto: { parent_id?: string; unit_type: string; unit_name: string; sort_order?: number },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_org_units (tenant_id, entity_id, parent_id, unit_type, unit_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [tenantId, entityId, dto.parent_id ?? null, dto.unit_type, dto.unit_name, dto.sort_order ?? 0],
    );
    return rows[0];
  }

  async updateUnit(
    tenantId: string,
    entityId: number,
    unitId: string,
    dto: { parent_id?: string | null; unit_type?: string; unit_name?: string; sort_order?: number; is_active?: boolean },
  ) {
    const rows = await this.dataSource.query(
      `UPDATE hr_org_units SET
         parent_id = COALESCE($4, parent_id),
         unit_type = COALESCE($5, unit_type),
         unit_name = COALESCE($6, unit_name),
         sort_order = COALESCE($7, sort_order),
         is_active = COALESCE($8, is_active)
       WHERE tenant_id = $1 AND entity_id = $2 AND unit_id = $3
       RETURNING *`,
      [
        tenantId,
        entityId,
        unitId,
        dto.parent_id ?? null,
        dto.unit_type ?? null,
        dto.unit_name ?? null,
        dto.sort_order ?? null,
        dto.is_active ?? null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('Org unit not found');
    return rows[0];
  }

  async deleteUnit(tenantId: string, entityId: number, unitId: string) {
    await this.dataSource.query(
      `UPDATE hr_org_units SET is_active = false WHERE tenant_id = $1 AND entity_id = $2 AND unit_id = $3`,
      [tenantId, entityId, unitId],
    );
    return { deleted: true };
  }

  async listFlat(tenantId: string, entityId: number) {
    return this.dataSource.query(
      `SELECT unit_id, parent_id, unit_type, unit_name FROM hr_org_units
       WHERE tenant_id = $1 AND entity_id = $2 AND is_active = true
       ORDER BY unit_type, unit_name`,
      [tenantId, entityId],
    );
  }
}
