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

  private equipmentStatusExpr = `CASE
    WHEN e.status = 'MAINTENANCE' THEN 'MAINTENANCE'
    WHEN EXISTS (
      SELECT 1 FROM lab_equipment_checkouts c
      WHERE c.equipment_id = e.equipment_id AND c.returned_at IS NULL
    ) THEN 'CHECKED_OUT'
    ELSE 'AVAILABLE'
  END`;

  private equipmentSelect = `
    SELECT
      e.equipment_id,
      e.tenant_id,
      e.zone_id,
      e.name,
      e.asset_tag,
      e.specs,
      e.requires_safety_training,
      (${this.equipmentStatusExpr}) AS status,
      z.zone_code,
      z.name AS zone_name
    FROM lab_equipment e
    JOIN lab_zones z ON z.zone_id = e.zone_id`;

  listEquipment(tenantId?: string, zoneId?: string) {
    const tid = this.tenant(tenantId);
    if (zoneId) {
      return this.db.query(
        `${this.equipmentSelect}
         WHERE e.tenant_id = $1 AND e.zone_id = $2
         ORDER BY e.name`,
        [tid, zoneId],
      );
    }
    return this.db.query(
      `${this.equipmentSelect}
       WHERE e.tenant_id = $1
       ORDER BY z.zone_code, e.name`,
      [tid],
    );
  }

  /** Align stored status with open checkout rows (repairs drift after return). */
  private async syncEquipmentAvailability(
    equipmentId: string,
    runner: Pick<DataSource, 'query'> = this.db,
  ) {
    const eqRows = await runner.query(
      `SELECT status FROM lab_equipment WHERE equipment_id = $1`,
      [equipmentId],
    );
    if (eqRows[0]?.status === 'MAINTENANCE') return;

    const open = await runner.query(
      `SELECT 1 FROM lab_equipment_checkouts
       WHERE equipment_id = $1 AND returned_at IS NULL
       LIMIT 1`,
      [equipmentId],
    );
    const status = open.length ? 'CHECKED_OUT' : 'AVAILABLE';
    await runner.query(
      `UPDATE lab_equipment SET status = $2
       WHERE equipment_id = $1 AND status <> 'MAINTENANCE'`,
      [equipmentId, status],
    );
  }

  async checkout(
    tenantId: string | undefined,
    userId: string,
    equipmentId: string,
    safetyAck?: boolean,
  ) {
    const tid = this.tenant(tenantId);
    await this.syncEquipmentAvailability(equipmentId);

    const rows = await this.db.query(
      `${this.equipmentSelect}
       WHERE e.equipment_id = $1 AND e.tenant_id = $2`,
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

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(
        `UPDATE lab_equipment SET status = 'CHECKED_OUT' WHERE equipment_id = $1`,
        [equipmentId],
      );
      const checkout = await qr.query(
        `INSERT INTO lab_equipment_checkouts (
           tenant_id, equipment_id, user_id, due_at, safety_ack
         ) VALUES ($1, $2, $3, NOW() + INTERVAL '8 hours', $4)
         RETURNING *`,
        [tid, equipmentId, userId, Boolean(safetyAck)],
      );
      await qr.commitTransaction();
      return checkout[0];
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  async returnEquipment(tenantId: string | undefined, checkoutId: string) {
    const tid = this.tenant(tenantId);
    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const rows = await qr.query(
        `UPDATE lab_equipment_checkouts
         SET returned_at = NOW()
         WHERE checkout_id = $1 AND tenant_id = $2 AND returned_at IS NULL
         RETURNING *`,
        [checkoutId, tid],
      );
      if (!rows[0]) throw new NotFoundException('Checkout not found');
      await this.syncEquipmentAvailability(rows[0].equipment_id, qr);
      await qr.commitTransaction();
      return rows[0];
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
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
