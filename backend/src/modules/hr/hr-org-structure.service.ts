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

  private buildTree(
    rows: Array<{
      unit_id: string;
      parent_id: string | null;
      unit_type: string;
      unit_name: string;
      sort_order: number;
      is_active: boolean;
    }>,
  ) {
    const map = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      map.set(row.unit_id, {
        ...row,
        children: [] as Record<string, unknown>[],
      });
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
    dto: {
      parent_id?: string;
      unit_type: string;
      unit_name: string;
      sort_order?: number;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO hr_org_units (tenant_id, entity_id, parent_id, unit_type, unit_name, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        tenantId,
        entityId,
        dto.parent_id ?? null,
        dto.unit_type,
        dto.unit_name,
        dto.sort_order ?? 0,
      ],
    );
    return rows[0];
  }

  async updateUnit(
    tenantId: string,
    entityId: number,
    unitId: string,
    dto: {
      parent_id?: string | null;
      unit_type?: string;
      unit_name?: string;
      sort_order?: number;
      is_active?: boolean;
    },
  ) {
    const updates: string[] = [];
    const params: any[] = [tenantId, entityId, unitId];

    if ('parent_id' in dto) {
      params.push(dto.parent_id);
      updates.push(`parent_id = $${params.length}`);
    }
    if (dto.unit_type !== undefined) {
      params.push(dto.unit_type);
      updates.push(`unit_type = $${params.length}`);
    }
    if (dto.unit_name !== undefined) {
      params.push(dto.unit_name);
      updates.push(`unit_name = $${params.length}`);
    }
    if (dto.sort_order !== undefined) {
      params.push(dto.sort_order);
      updates.push(`sort_order = $${params.length}`);
    }
    if (dto.is_active !== undefined) {
      params.push(dto.is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) return null;

    const rows = await this.dataSource.query(
      `UPDATE hr_org_units SET ${updates.join(', ')} WHERE tenant_id = $1 AND entity_id = $2 AND unit_id = $3 RETURNING *`,
      params,
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
