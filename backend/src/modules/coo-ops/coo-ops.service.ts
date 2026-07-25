import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { evaluateThreeWayMatch } from './three-way-match.util';

@Injectable()
export class CooOpsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async dashboard(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const safe = async (sql: string, params: unknown[] = []) => {
      try {
        return await this.db.query(sql, params);
      } catch {
        return [];
      }
    };

    const [slaBreaches, openPos, pendingGrn, penalties, labCheckouts, fellowships, funnel] =
      await Promise.all([
        safe(
          `SELECT COUNT(*)::int AS count FROM helpdesk_tickets
           WHERE tenant_id = $1 AND status NOT IN ('RESOLVED','CLOSED','REJECTED')
             AND sla_deadline IS NOT NULL AND sla_deadline < NOW()`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*)::int AS count FROM fin_purchase_orders
           WHERE tenant_id = $1 AND deleted_at IS NULL AND status IN ('PENDING','APPROVED')`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*)::int AS count FROM fin_purchase_orders po
           WHERE po.tenant_id = $1 AND po.deleted_at IS NULL AND po.status = 'APPROVED'
             AND NOT EXISTS (SELECT 1 FROM fin_goods_receipts g WHERE g.po_id = po.po_id)`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*)::int AS count, COALESCE(SUM(amount_inr),0) AS total
           FROM fin_vendor_penalties WHERE tenant_id = $1`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*)::int AS count FROM lab_equipment_checkouts
           WHERE tenant_id = $1 AND returned_at IS NULL`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*) FILTER (WHERE status = 'TRIAL')::int AS trial,
                  COUNT(*) FILTER (WHERE status IN ('PASSED','CONVERTED'))::int AS passed
           FROM ecell_fellowship_trials WHERE tenant_id = $1`,
          [tid],
        ),
        safe(
          `SELECT COUNT(*) FILTER (WHERE stage = 'WHITEPAPER')::int AS whitepaper,
                  COUNT(*) FILTER (WHERE stage = 'TOP20_LOCKDOWN')::int AS top20,
                  COUNT(*) FILTER (WHERE stage = 'GOLDEN_TICKET')::int AS golden
           FROM competition_entries e
           JOIN competitions c ON c.competition_id = e.competition_id
           WHERE c.tenant_id = $1`,
          [tid],
        ),
      ]);

    return {
      esm_sla_breaches: slaBreaches[0]?.count ?? 0,
      open_pos: openPos[0]?.count ?? 0,
      pending_grn: pendingGrn[0]?.count ?? 0,
      vendor_penalties_count: penalties[0]?.count ?? 0,
      vendor_penalties_total: penalties[0]?.total ?? 0,
      lab_active_checkouts: labCheckouts[0]?.count ?? 0,
      fellowship_trials: fellowships[0]?.trial ?? 0,
      fellowship_passed: fellowships[0]?.passed ?? 0,
      challenge_funnel: funnel[0] ?? { whitepaper: 0, top20: 0, golden: 0 },
    };
  }

  listQueues(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM helpdesk_queues WHERE tenant_id = $1 ORDER BY name`,
      [this.tenant(tenantId)],
    );
  }

  listLocations(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM helpdesk_locations WHERE tenant_id = $1 ORDER BY label`,
      [this.tenant(tenantId)],
    );
  }

  async createTicketFromQr(
    tenantId: string | undefined,
    userId: string,
    qrCode: string,
    subject?: string,
  ) {
    const tid = this.tenant(tenantId);
    const locs = await this.db.query(
      `SELECT * FROM helpdesk_locations WHERE tenant_id = $1 AND qr_code = $2`,
      [tid, qrCode],
    );
    if (!locs[0]) throw new NotFoundException('QR location not found');
    const loc = locs[0];

    const policy = await this.db.query(
      `SELECT * FROM helpdesk_sla_policies
       WHERE tenant_id = $1 AND category = $2 AND priority = 'NORMAL'
       LIMIT 1`,
      [tid, loc.default_category],
    );
    const resolveMins = policy[0]?.resolve_mins ?? 1440;

    const queue = await this.db.query(
      `SELECT * FROM helpdesk_queues
       WHERE tenant_id = $1 AND category = $2
       LIMIT 1`,
      [tid, loc.default_category],
    );

    const ticket = await this.db.query(
      `INSERT INTO helpdesk_tickets (
         tenant_id, student_user_id, category, subject, description, status,
         sla_deadline, location_id, queue_id, ticket_ref
       ) VALUES (
         $1, $2, $3, $4, $5, 'PENDING',
         NOW() + ($6 || ' minutes')::interval, $7, $8,
         'QR-' || substr(md5(random()::text), 1, 8)
       )
       RETURNING *`,
      [
        tid,
        userId,
        loc.default_category,
        subject ?? `Issue at ${loc.label}`,
        `Auto-created from QR ${qrCode} (${loc.building ?? loc.label})`,
        String(resolveMins),
        loc.location_id,
        queue[0]?.queue_id ?? null,
      ],
    );

    await this.db.query(
      `INSERT INTO helpdesk_ticket_events (ticket_id, event_type, actor_user_id, payload)
       VALUES ($1, 'CREATED_FROM_QR', $2, $3::jsonb)`,
      [ticket[0].ticket_id, userId, JSON.stringify({ qr_code: qrCode })],
    );

    return ticket[0];
  }

  async scanCloseTicket(tenantId: string | undefined, userId: string, ticketId: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `UPDATE helpdesk_tickets
       SET status = 'RESOLVED', resolved_at = NOW()
       WHERE ticket_id = $1 AND tenant_id = $2
       RETURNING *`,
      [ticketId, tid],
    );
    if (!rows[0]) throw new NotFoundException('Ticket not found');
    await this.db.query(
      `INSERT INTO helpdesk_ticket_events (ticket_id, event_type, actor_user_id, payload)
       VALUES ($1, 'SCAN_CLOSED', $2, '{}'::jsonb)`,
      [ticketId, userId],
    );
    return rows[0];
  }

  listOpenTickets(tenantId?: string) {
    return this.db.query(
      `SELECT t.ticket_id, t.ticket_ref, t.subject, t.category, t.status, t.sla_deadline,
              t.created_at, l.label AS location_label, l.qr_code
       FROM helpdesk_tickets t
       LEFT JOIN helpdesk_locations l ON l.location_id = t.location_id
       WHERE t.tenant_id = $1
         AND t.status NOT IN ('RESOLVED', 'CLOSED', 'REJECTED')
       ORDER BY t.created_at DESC
       LIMIT 50`,
      [this.tenant(tenantId)],
    );
  }

  listVendors(tenantId?: string) {
    return this.db.query(
      `SELECT vendor_id, business_name, contact_email
       FROM fin_vendors
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY business_name
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  listDofa(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM fin_dofa_rules WHERE tenant_id = $1 ORDER BY max_amount_inr DESC`,
      [this.tenant(tenantId)],
    );
  }

  listPurchaseOrders(tenantId?: string) {
    return this.db.query(
      `SELECT * FROM fin_purchase_orders
       WHERE tenant_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async createPoWithDofa(
    tenantId: string | undefined,
    userId: string,
    roleName: string,
    body: { description: string; amount: number; vendor_id?: string; program_id?: string },
  ) {
    const tid = this.tenant(tenantId);
    if (!body.description || !(body.amount > 0)) {
      throw new BadRequestException('description and amount required');
    }
    const dofa = await this.db.query(
      `SELECT * FROM fin_dofa_rules WHERE tenant_id = $1 AND lower(role_name) = lower($2) LIMIT 1`,
      [tid, roleName],
    );
    const limit = Number(dofa[0]?.max_amount_inr ?? 0);
    const autoApprove = limit > 0 && body.amount <= limit;
    const status = autoApprove ? 'APPROVED' : 'PENDING';

    const po = await this.db.query(
      `INSERT INTO fin_purchase_orders (
         tenant_id, description, amount, status, requested_by, vendor_id, program_id,
         approved_by, approved_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        tid,
        body.description,
        body.amount,
        status,
        userId,
        body.vendor_id ?? null,
        body.program_id ?? null,
        autoApprove ? userId : null,
        autoApprove ? new Date() : null,
      ],
    );

    await this.db.query(
      `INSERT INTO fin_po_lines (po_id, description, qty, unit_price)
       VALUES ($1, $2, 1, $3)`,
      [po[0].po_id, body.description, body.amount],
    );

    return { ...po[0], dofa_auto_approved: autoApprove, dofa_limit: limit };
  }

  async createGrn(
    tenantId: string | undefined,
    userId: string,
    body: { po_id: string; notes?: string; qty_received?: number },
  ) {
    const tid = this.tenant(tenantId);
    const po = await this.db.query(
      `SELECT * FROM fin_purchase_orders WHERE po_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [body.po_id, tid],
    );
    if (!po[0]) throw new NotFoundException('PO not found');

    const grn = await this.db.query(
      `INSERT INTO fin_goods_receipts (tenant_id, po_id, received_by, notes)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [tid, body.po_id, userId, body.notes ?? null],
    );

    const lines = await this.db.query(
      `SELECT * FROM fin_po_lines WHERE po_id = $1`,
      [body.po_id],
    );
    for (const line of lines) {
      await this.db.query(
        `INSERT INTO fin_grn_lines (grn_id, po_line_id, description, qty_received)
         VALUES ($1, $2, $3, $4)`,
        [
          grn[0].grn_id,
          line.line_id,
          line.description,
          body.qty_received ?? line.qty,
        ],
      );
    }
    return grn[0];
  }

  async threeWayMatch(tenantId: string | undefined, poId: string) {
    const tid = this.tenant(tenantId);
    const po = await this.db.query(
      `SELECT * FROM fin_purchase_orders WHERE po_id = $1 AND tenant_id = $2`,
      [poId, tid],
    );
    if (!po[0]) throw new NotFoundException('PO not found');

    const grn = await this.db.query(
      `SELECT * FROM fin_goods_receipts WHERE po_id = $1 LIMIT 1`,
      [poId],
    );
    const invoices = await this.db.query(
      `SELECT *, COALESCE(total_amount, 0) AS amt FROM fin_vendor_invoices WHERE po_id = $1 AND tenant_id = $2`,
      [poId, tid],
    );

    const poAmount = Number(po[0].amount);
    const invoiceAmount = invoices.reduce(
      (sum: number, inv: { amt?: string | number }) => sum + Number(inv.amt ?? 0),
      0,
    );
    const evaluated = evaluateThreeWayMatch({
      poStatus: String(po[0].status),
      poAmount,
      hasGrn: Boolean(grn[0]),
      invoiceCount: invoices.length,
      invoiceAmount,
    });

    return {
      po_id: poId,
      has_grn: Boolean(grn[0]),
      invoice_count: invoices.length,
      po_amount: poAmount,
      invoice_amount: invoiceAmount,
      match_status: evaluated.match_status,
      can_pay: evaluated.can_pay,
    };
  }

  async payPurchaseOrder(
    tenantId: string | undefined,
    userId: string,
    poId: string,
  ) {
    const tid = this.tenant(tenantId);
    const poCheck = await this.db.query(
      `SELECT status FROM fin_purchase_orders WHERE po_id = $1 AND tenant_id = $2`,
      [poId, tid],
    );
    if (!poCheck[0]) throw new NotFoundException('PO not found');
    if (poCheck[0].status === 'PAID') {
      throw new BadRequestException('PO already paid');
    }
    const match = await this.threeWayMatch(tid, poId);
    if (!match.can_pay) {
      throw new BadRequestException({
        message: 'Cannot pay: 3-way match incomplete',
        code: 'THREE_WAY_MISMATCH',
        match,
      });
    }
    const po = await this.db.query(
      `SELECT * FROM fin_purchase_orders WHERE po_id = $1 AND tenant_id = $2`,
      [poId, tid],
    );
    if (po[0].program_id) {
      await this.db.query(
        `UPDATE fin_program_budgets SET encumbered_amount = GREATEST(0, encumbered_amount - $2),
         utilized_amount = utilized_amount + $2 WHERE program_id = $1`,
        [po[0].program_id, Number(po[0].amount)],
      );
    }
    if (po[0].budget_id) {
      await this.db.query(
        `UPDATE fin_dept_budgets SET encumbered_amount = GREATEST(0, encumbered_amount - $2),
         utilized_amount = utilized_amount + $2 WHERE budget_id = $1`,
        [po[0].budget_id, Number(po[0].amount)],
      );
    }
    const rows = await this.db.query(
      `UPDATE fin_purchase_orders SET status = 'PAID'
       WHERE po_id = $1 AND tenant_id = $2 AND status = 'APPROVED'
       RETURNING *`,
      [poId, tid],
    );
    return { ...rows[0], paid_by: userId, match };
  }

  listPenalties(tenantId?: string) {
    return this.db.query(
      `SELECT p.*, v.business_name AS vendor_name
       FROM fin_vendor_penalties p
       LEFT JOIN fin_vendors v ON v.vendor_id = p.vendor_id
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async applyPenalty(
    tenantId: string | undefined,
    body: { vendor_id: string; reason: string; amount_inr: number },
  ) {
    const rows = await this.db.query(
      `INSERT INTO fin_vendor_penalties (tenant_id, vendor_id, reason, amount_inr, auto_applied)
       VALUES ($1, $2, $3, $4, true)
       RETURNING *`,
      [this.tenant(tenantId), body.vendor_id, body.reason, body.amount_inr],
    );
    return rows[0];
  }

  listGrns(tenantId?: string) {
    return this.db.query(
      `SELECT g.*, po.description AS po_description, po.amount AS po_amount
       FROM fin_goods_receipts g
       JOIN fin_purchase_orders po ON po.po_id = g.po_id
       WHERE g.tenant_id = $1
       ORDER BY g.received_at DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  private async resolvePoVendorId(tenantId: string, po: { po_id: string; vendor_id?: string | null }) {
    if (po.vendor_id) return po.vendor_id;
    const existing = await this.db.query(
      `SELECT vendor_id FROM fin_vendors WHERE tenant_id = $1 AND is_active = true ORDER BY created_at LIMIT 1`,
      [tenantId],
    );
    let vendorId = existing[0]?.vendor_id as string | undefined;
    if (!vendorId) {
      const created = await this.db.query(
        `INSERT INTO fin_vendors (tenant_id, business_name, contact_email, is_active)
         VALUES ($1, 'P2P Demo Vendor', 'vendor@demo.local', true)
         RETURNING vendor_id`,
        [tenantId],
      );
      vendorId = created[0]?.vendor_id;
    }
    if (!vendorId) throw new BadRequestException('No vendor available for invoice');
    await this.db.query(
      `UPDATE fin_purchase_orders SET vendor_id = $1 WHERE po_id = $2`,
      [vendorId, po.po_id],
    );
    return vendorId;
  }

  async createVendorInvoiceForPo(tenantId: string | undefined, poId: string) {
    const tid = this.tenant(tenantId);
    const poRows = await this.db.query(
      `SELECT * FROM fin_purchase_orders WHERE po_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [poId, tid],
    );
    const po = poRows[0];
    if (!po) throw new NotFoundException('PO not found');

    const existing = await this.db.query(
      `SELECT invoice_id FROM fin_vendor_invoices WHERE tenant_id = $1 AND po_id = $2 LIMIT 1`,
      [tid, poId],
    );
    if (existing[0]) {
      return this.db.query(
        `SELECT * FROM fin_vendor_invoices WHERE invoice_id = $1`,
        [existing[0].invoice_id],
      ).then((rows) => rows[0]);
    }

    const vendorId = await this.resolvePoVendorId(tid, po);
    const amount = Number(po.amount);
    const invoiceNumber = `PO-${String(poId).slice(0, 8).toUpperCase()}`;
    const rows = await this.db.query(
      `INSERT INTO fin_vendor_invoices (
         tenant_id, vendor_id, invoice_number, invoice_date,
         taxable_amount, gst_amount, tds_amount, total_amount, net_payable,
         status, po_id
       ) VALUES ($1, $2, $3, CURRENT_DATE, $4, 0, 0, $4, $4, 'APPROVED', $5)
       RETURNING *`,
      [tid, vendorId, invoiceNumber, amount, poId],
    );
    return rows[0];
  }
}
