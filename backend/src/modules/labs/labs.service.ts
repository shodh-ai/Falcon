import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class LabsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listZones(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM lab_zones WHERE tenant_id = $1 AND is_active = true ORDER BY zone_code`,
      [this.tenant(tenantId)],
    );
  }

  listEquipment(tenantId?: string, zoneId?: string) {
    const tid = this.tenant(tenantId);
    if (zoneId) {
      return this.db.query(
        `SELECT e.*, z.zone_code, z.name AS zone_name
         FROM lab_equipment e
         JOIN lab_zones z ON z.zone_id = e.zone_id
         WHERE e.tenant_id = $1 AND e.zone_id = $2
         ORDER BY e.name`,
        [tid, zoneId],
      );
    }
    return this.db.query(
      `SELECT e.*, z.zone_code, z.name AS zone_name
       FROM lab_equipment e
       JOIN lab_zones z ON z.zone_id = e.zone_id
       WHERE e.tenant_id = $1
       ORDER BY z.zone_code, e.name`,
      [tid],
    );
  }

  async checkout(
    tenantId: string | undefined,
    userId: string,
    equipmentId: string,
    safetyAck?: boolean,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM lab_equipment WHERE equipment_id = $1 AND tenant_id = $2`,
      [equipmentId, tid],
    );
    const eq = rows[0];
    if (!eq) throw new NotFoundException('Equipment not found');
    if (eq.status !== 'AVAILABLE') {
      throw new BadRequestException('Equipment not available');
    }
    if (eq.requires_safety_training && !safetyAck) {
      throw new BadRequestException('Safety acknowledgement required');
    }
    await this.db.query(
      `UPDATE lab_equipment SET status = 'CHECKED_OUT' WHERE equipment_id = $1`,
      [equipmentId],
    );
    const checkout = await this.db.query(
      `INSERT INTO lab_equipment_checkouts (
         tenant_id, equipment_id, user_id, due_at, safety_ack
       ) VALUES ($1, $2, $3, NOW() + INTERVAL '8 hours', $4)
       RETURNING *`,
      [tid, equipmentId, userId, Boolean(safetyAck)],
    );
    return checkout[0];
  }

  async returnEquipment(tenantId: string | undefined, checkoutId: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `UPDATE lab_equipment_checkouts
       SET returned_at = NOW()
       WHERE checkout_id = $1 AND tenant_id = $2 AND returned_at IS NULL
       RETURNING *`,
      [checkoutId, tid],
    );
    if (!rows[0]) throw new NotFoundException('Checkout not found');
    await this.db.query(
      `UPDATE lab_equipment SET status = 'AVAILABLE' WHERE equipment_id = $1`,
      [rows[0].equipment_id],
    );
    return rows[0];
  }

  listCheckouts(tenantId?: string) {
    return this.db.query(
      `SELECT c.*, e.name AS equipment_name, u.name AS user_name
       FROM lab_equipment_checkouts c
       JOIN lab_equipment e ON e.equipment_id = c.equipment_id
       LEFT JOIN users u ON u.user_id = c.user_id
       WHERE c.tenant_id = $1
       ORDER BY c.checked_out_at DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  listPartners(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM lab_partner_orgs WHERE tenant_id = $1 ORDER BY name`,
      [this.tenant(tenantId)],
    );
  }

  async createWorkOrder(
    tenantId: string | undefined,
    userId: string,
    body: { partner_id: string; title: string; notes?: string },
  ) {
    const rows = await this.db.query(
      `INSERT INTO lab_partner_work_orders (
         tenant_id, partner_id, title, requested_by, notes
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        this.tenant(tenantId),
        body.partner_id,
        body.title,
        userId,
        body.notes ?? null,
      ],
    );
    return rows[0];
  }

  listWorkOrders(tenantId?: string) {
    return this.db.query(
      `SELECT w.*, p.name AS partner_name
       FROM lab_partner_work_orders w
       JOIN lab_partner_orgs p ON p.partner_id = w.partner_id
       WHERE w.tenant_id = $1
       ORDER BY w.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async budgetSummary(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT program_id, program_name, allocated_amount, encumbered_amount, utilized_amount, status
       FROM fin_program_budgets
       WHERE tenant_id = $1 AND program_name = 'TOKAMAK_RND' AND deleted_at IS NULL
       LIMIT 1`,
      [tid],
    );
    if (rows[0]) {
      return { ...rows[0], monthly_cap: 200000, fast_path: true };
    }
    return {
      program_name: 'TOKAMAK_RND',
      allocated_amount: 200000,
      encumbered_amount: 0,
      utilized_amount: 0,
      monthly_cap: 200000,
      fast_path: true,
      status: 'STUB',
    };
  }
}
