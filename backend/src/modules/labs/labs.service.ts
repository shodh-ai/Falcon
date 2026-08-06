import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProcurementService } from '../coo-ops/procurement.service';

@Injectable()
export class LabsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly procurement: ProcurementService,
  ) {}

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
    const statusExpr = `CASE
      WHEN e.status = 'MAINTENANCE' THEN 'MAINTENANCE'
      WHEN EXISTS (
        SELECT 1 FROM lab_equipment_checkouts c
        WHERE c.equipment_id = e.equipment_id
          AND c.tenant_id = e.tenant_id
          AND c.returned_at IS NULL
      ) THEN 'CHECKED_OUT'
      ELSE 'AVAILABLE'
    END`;
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
    if (eq.status === 'MAINTENANCE') {
      throw new BadRequestException('Equipment under maintenance');
    }
    const active = await this.db.query(
      `SELECT 1 FROM lab_equipment_checkouts
       WHERE equipment_id = $1 AND tenant_id = $2 AND returned_at IS NULL
       LIMIT 1`,
      [equipmentId, tid],
    );
    if (active.length > 0) {
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
    const tid = this.tenant(tenantId);
    const existing = await this.db.query(
      `SELECT work_order_id, status, title, created_at
       FROM lab_partner_work_orders
       WHERE tenant_id = $1
         AND partner_id = $2
         AND requested_by = $3
         AND status IN ('REQUESTED', 'IN_PROGRESS')
       ORDER BY created_at DESC
       LIMIT 1`,
      [tid, body.partner_id, userId],
    );
    if (existing[0]) {
      throw new BadRequestException({
        message:
          'An open work order already exists for this partner. Wait for COO triage or cancel the pending request.',
        code: 'WORK_ORDER_ALREADY_OPEN',
        work_order_id: existing[0].work_order_id,
        status: existing[0].status,
      });
    }
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

  private workOrderSelect = `
    SELECT w.*, p.name AS partner_name, p.partner_code,
           ru.name AS requester_name, ru.official_email AS requester_email,
           au.name AS accepted_by_name,
           pr.description AS pr_description, pr.status AS pr_status,
           pr.amount_estimate AS pr_amount
    FROM lab_partner_work_orders w
    JOIN lab_partner_orgs p ON p.partner_id = w.partner_id
    LEFT JOIN users ru ON ru.user_id = w.requested_by
    LEFT JOIN users au ON au.user_id = w.accepted_by
    LEFT JOIN fin_purchase_requisitions pr ON pr.pr_id = w.pr_id
  `;

  private async getWorkOrder(tenantId: string, workOrderId: string) {
    const rows = await this.db.query(
      `${this.workOrderSelect}
       WHERE w.work_order_id = $1 AND w.tenant_id = $2`,
      [workOrderId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Work order not found');
    return rows[0];
  }

  listWorkOrders(tenantId?: string, status?: string) {
    const tid = this.tenant(tenantId);
    const params: unknown[] = [tid];
    let statusClause = '';
    if (status?.trim()) {
      params.push(status.trim().toUpperCase());
      statusClause = ` AND w.status = $${params.length}`;
    }
    return this.db.query(
      `${this.workOrderSelect}
       WHERE w.tenant_id = $1${statusClause}
       ORDER BY
         CASE w.status
           WHEN 'REQUESTED' THEN 0
           WHEN 'IN_PROGRESS' THEN 1
           WHEN 'DONE' THEN 2
           ELSE 3
         END,
         w.created_at DESC`,
      params,
    );
  }

  async acceptWorkOrder(
    tenantId: string | undefined,
    workOrderId: string,
    userId: string,
    notes?: string,
  ) {
    const tid = this.tenant(tenantId);
    const wo = await this.getWorkOrder(tid, workOrderId);
    if (wo.status !== 'REQUESTED') {
      throw new BadRequestException('Only REQUESTED work orders can be accepted');
    }
    await this.db.query(
      `UPDATE lab_partner_work_orders
       SET status = 'IN_PROGRESS',
           accepted_by = $1,
           accepted_at = NOW(),
           status_notes = COALESCE($2, status_notes)
       WHERE work_order_id = $3 AND tenant_id = $4`,
      [userId, notes?.trim() ?? null, workOrderId, tid],
    );
    return this.getWorkOrder(tid, workOrderId);
  }

  async completeWorkOrder(
    tenantId: string | undefined,
    workOrderId: string,
    notes?: string,
  ) {
    const tid = this.tenant(tenantId);
    const wo = await this.getWorkOrder(tid, workOrderId);
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') {
      throw new BadRequestException('Work order is already closed');
    }
    await this.db.query(
      `UPDATE lab_partner_work_orders
       SET status = 'DONE',
           status_notes = COALESCE($1, status_notes)
       WHERE work_order_id = $2 AND tenant_id = $3`,
      [notes?.trim() ?? null, workOrderId, tid],
    );
    return this.getWorkOrder(tid, workOrderId);
  }

  async cancelWorkOrder(
    tenantId: string | undefined,
    workOrderId: string,
    userId: string,
    notes?: string,
  ) {
    const tid = this.tenant(tenantId);
    const wo = await this.getWorkOrder(tid, workOrderId);
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') {
      throw new BadRequestException('Work order is already closed');
    }
    await this.db.query(
      `UPDATE lab_partner_work_orders
       SET status = 'CANCELLED',
           accepted_by = COALESCE(accepted_by, $1),
           accepted_at = COALESCE(accepted_at, NOW()),
           status_notes = COALESCE($2, status_notes)
       WHERE work_order_id = $3 AND tenant_id = $4`,
      [userId, notes?.trim() ?? null, workOrderId, tid],
    );
    return this.getWorkOrder(tid, workOrderId);
  }

  async spawnProcurementFromWorkOrder(
    tenantId: string | undefined,
    workOrderId: string,
    userId: string,
    body: {
      amount_estimate: number;
      description?: string;
      technical_specs?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    const wo = await this.getWorkOrder(tid, workOrderId);
    if (wo.status === 'DONE' || wo.status === 'CANCELLED') {
      throw new BadRequestException('Closed work orders cannot spawn procurement');
    }
    if (wo.pr_id) {
      throw new BadRequestException('Purchase requisition already linked');
    }
    if (!(body.amount_estimate > 0)) {
      throw new BadRequestException('amount_estimate required');
    }

    const programRows = await this.db.query(
      `SELECT program_id, budget_id
       FROM fin_program_budgets
       WHERE tenant_id = $1 AND program_name = 'TOKAMAK_RND' AND deleted_at IS NULL
       LIMIT 1`,
      [tid],
    );
    const program = programRows[0];

    const description =
      body.description?.trim() ||
      `${wo.title} — ${wo.partner_name} (Fabless network WO)`;
    const technicalSpecs =
      body.technical_specs?.trim() ||
      [wo.notes, wo.partner_code ? `Partner: ${wo.partner_code}` : null]
        .filter(Boolean)
        .join('\n') ||
      undefined;

    const pr = await this.procurement.createRequisition(tid, userId, {
      description,
      amount_estimate: body.amount_estimate,
      technical_specs: technicalSpecs,
      budget_id: program?.budget_id ?? undefined,
      program_id: program?.program_id ?? undefined,
    });

    await this.db.query(
      `UPDATE lab_partner_work_orders
       SET pr_id = $1,
           status = 'IN_PROGRESS',
           accepted_by = COALESCE(accepted_by, $2),
           accepted_at = COALESCE(accepted_at, NOW())
       WHERE work_order_id = $3 AND tenant_id = $4`,
      [pr.pr_id, userId, workOrderId, tid],
    );

    return {
      work_order: await this.getWorkOrder(tid, workOrderId),
      requisition: pr,
    };
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
