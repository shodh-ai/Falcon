import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AnomalyDetectionService } from '../leadership/anomaly-detection.service';
import {
  DEFAULT_DOFA_LEVELS,
  dualSignSlotsSatisfied,
  pendingStatusForLevel,
  resolveDofaLevel,
  roleCanSignLevel,
  type DofaLevel,
} from './dofa-levels.util';
import { GstVerificationService } from './gst-verification.service';
import {
  isValidGstinFormat,
  normalizeGstin,
  relatedPartyHash,
} from './gstin.util';
import { detectInvoiceSplitting } from './invoice-split.util';
import type { InvoiceSplitSignal } from './invoice-split.util';
import { assertGrantSpendAllowed } from '../research/grant-spend.util';
import {
  DEFAULT_QUOTE_RULES,
  L2_JUSTIFICATION_MIN_CHARS,
  computeSystemL1,
  resolveQuoteRule,
  type QuoteRule,
} from './quote-rules.util';

@Injectable()
export class ProcurementService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly gst: GstVerificationService,
    private readonly anomaly: AnomalyDetectionService,
  ) {}

  private tenant(id?: string) {
    return id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private async quoteRules(tenantId: string): Promise<QuoteRule[]> {
    const rows = await this.db.query(
      `SELECT min_amount_inr, max_amount_inr, min_quotes, require_gst_verify
       FROM fin_quote_rules WHERE tenant_id = $1 ORDER BY min_amount_inr`,
      [tenantId],
    );
    if (!rows.length) return DEFAULT_QUOTE_RULES;
    return rows.map(
      (r: {
        min_amount_inr: string;
        max_amount_inr: string | null;
        min_quotes: number;
        require_gst_verify: boolean;
      }) => ({
        min_amount_inr: Number(r.min_amount_inr),
        max_amount_inr:
          r.max_amount_inr == null ? null : Number(r.max_amount_inr),
        min_quotes: Number(r.min_quotes),
        require_gst_verify: Boolean(r.require_gst_verify),
      }),
    );
  }

  async listDofaLevels(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT level_no, label, max_amount_inr, required_roles, required_signatures
       FROM fin_dofa_levels WHERE tenant_id = $1 ORDER BY level_no`,
      [tid],
    );
    if (!rows.length) return DEFAULT_DOFA_LEVELS;
    return rows.map(
      (r: {
        level_no: number;
        label: string;
        max_amount_inr: string | null;
        required_roles: string[];
        required_signatures: number;
      }) => ({
        level_no: Number(r.level_no),
        label: r.label,
        max_amount_inr:
          r.max_amount_inr == null ? null : Number(r.max_amount_inr),
        required_roles: r.required_roles,
        required_signatures: Number(r.required_signatures),
      }),
    ) as DofaLevel[];
  }

  private async refreshLowestQuote(prId: string) {
    const quotes = await this.db.query(
      `SELECT quote_id, amount_inr FROM fin_quotations WHERE pr_id = $1`,
      [prId],
    );
    const lowest = computeSystemL1(
      quotes.map((q: { quote_id: string; amount_inr: string }) => ({
        quote_id: q.quote_id,
        amount_inr: Number(q.amount_inr),
      })),
    );
    await this.db.query(
      `UPDATE fin_quotations SET is_system_l1 = (quote_id = $2) WHERE pr_id = $1`,
      [prId, lowest],
    );
    return lowest;
  }

  private async budgetOk(
    tenantId: string,
    amount: number,
    budgetId?: string | null,
    programId?: string | null,
  ): Promise<boolean> {
    if (budgetId) {
      const rows = await this.db.query(
        `SELECT allocated_amount, utilized_amount, encumbered_amount
         FROM fin_dept_budgets WHERE budget_id = $1 AND tenant_id = $2`,
        [budgetId, tenantId],
      );
      if (rows[0]) {
        const avail =
          Number(rows[0].allocated_amount) -
          Number(rows[0].utilized_amount) -
          Number(rows[0].encumbered_amount ?? 0);
        return avail >= amount;
      }
    }
    if (programId) {
      const rows = await this.db.query(
        `SELECT allocated_amount, utilized_amount, encumbered_amount
         FROM fin_program_budgets WHERE program_id = $1 AND tenant_id = $2`,
        [programId, tenantId],
      );
      if (rows[0]) {
        const avail =
          Number(rows[0].allocated_amount) -
          Number(rows[0].utilized_amount) -
          Number(rows[0].encumbered_amount ?? 0);
        return avail >= amount;
      }
    }
    // Soft pass when no budget row linked (demo / smoke)
    return true;
  }

  listRequisitions(tenantId?: string, status?: string) {
    if (status) {
      return this.db.query(
        `SELECT pr.*,
                (SELECT COUNT(*)::int FROM fin_quotations q WHERE q.pr_id = pr.pr_id) AS quote_count
         FROM fin_purchase_requisitions pr
         WHERE pr.tenant_id = $1 AND pr.status = $2
         ORDER BY pr.created_at DESC LIMIT 100`,
        [this.tenant(tenantId), status],
      );
    }
    return this.db.query(
      `SELECT pr.*,
              (SELECT COUNT(*)::int FROM fin_quotations q WHERE q.pr_id = pr.pr_id) AS quote_count
       FROM fin_purchase_requisitions pr
       WHERE pr.tenant_id = $1
       ORDER BY pr.created_at DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  async listPendingApprovals(tenantId: string | undefined, roleName: string) {
    const levels = await this.listDofaLevels(tenantId);
    const matching = levels.filter((l) => roleCanSignLevel(roleName, l));
    if (!matching.length) return [];
    const statuses = matching.map((l) => pendingStatusForLevel(l.level_no));
    return this.db.query(
      `SELECT pr.*,
              (SELECT COUNT(*)::int FROM fin_pr_approvals a
               WHERE a.pr_id = pr.pr_id AND a.level_no = pr.required_level
                 AND a.decision = 'APPROVED') AS signatures_collected
       FROM fin_purchase_requisitions pr
       WHERE pr.tenant_id = $1 AND pr.status = ANY($2::text[])
       ORDER BY pr.created_at ASC
       LIMIT 100`,
      [this.tenant(tenantId), statuses],
    );
  }

  async getRequisition(tenantId: string | undefined, prId: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM fin_purchase_requisitions WHERE pr_id = $1 AND tenant_id = $2`,
      [prId, tid],
    );
    if (!rows[0]) throw new NotFoundException('PR not found');
    const quotes = await this.db.query(
      `SELECT * FROM fin_quotations WHERE pr_id = $1 ORDER BY amount_inr ASC`,
      [prId],
    );
    const approvals = await this.db.query(
      `SELECT * FROM fin_pr_approvals WHERE pr_id = $1 ORDER BY level_no, approved_at`,
      [prId],
    );
    const rules = await this.quoteRules(tid);
    const rule = resolveQuoteRule(Number(rows[0].amount_estimate), rules);
    const levels = await this.listDofaLevels(tid);
    const level = rows[0].required_level
      ? levels.find((l) => l.level_no === Number(rows[0].required_level))
      : resolveDofaLevel(Number(rows[0].amount_estimate), levels);
    return {
      ...rows[0],
      quotes,
      approvals,
      quote_rule: rule,
      dofa_level: level,
    };
  }

  /** Requestor: raise need only — status SUBMITTED */
  async createRequisition(
    tenantId: string | undefined,
    userId: string,
    body: {
      description: string;
      amount_estimate: number;
      dept_id?: number;
      technical_specs?: string;
      budget_id?: string;
      program_id?: string;
      grant_id?: string;
      grant_expense_category?: string;
    },
  ) {
    if (!body.description?.trim() || !(body.amount_estimate > 0)) {
      throw new BadRequestException('description and amount_estimate required');
    }
    const tid = this.tenant(tenantId);
    const budgetOk = await this.budgetOk(
      tid,
      body.amount_estimate,
      body.budget_id,
      body.program_id,
    );
    if (!budgetOk) {
      throw new BadRequestException({
        message: 'Insufficient budget for this requisition',
        code: 'BUDGET_INSUFFICIENT',
      });
    }

    let grantExpenseCategory =
      body.grant_expense_category?.toUpperCase() ?? null;
    if (body.grant_id) {
      grantExpenseCategory = grantExpenseCategory || 'EQUIPMENT';
      const grants = await this.db.query(
        `SELECT * FROM research_grants WHERE grant_id = $1 AND tenant_id = $2`,
        [body.grant_id, tid],
      );
      if (!grants[0]) throw new BadRequestException('grant_id not found');
      const g = grants[0];
      const check = assertGrantSpendAllowed({
        grantStatus: g.status,
        availableAmount: Number(
          g.available_amount ??
            Number(g.sanctioned_amount) - Number(g.utilized_amount),
        ),
        requestedAmount: body.amount_estimate,
        expenseCategory: grantExpenseCategory,
        allowedCategories: g.allowed_expense_categories || [],
      });
      if (!check.ok) {
        throw new BadRequestException({
          message: check.message,
          code: check.code,
        });
      }
    }

    const rows = await this.db.query(
      `INSERT INTO fin_purchase_requisitions (
         tenant_id, requested_by, dept_id, description, amount_estimate, status,
         technical_specs, budget_id, program_id, budget_ok, grant_id, grant_expense_category
       ) VALUES ($1, $2, $3, $4, $5, 'SUBMITTED', $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        tid,
        userId,
        body.dept_id ?? null,
        body.description.trim(),
        body.amount_estimate,
        body.technical_specs?.trim() ?? null,
        body.budget_id ?? null,
        body.program_id ?? null,
        budgetOk,
        body.grant_id ?? null,
        grantExpenseCategory,
      ],
    );
    const levels = await this.listDofaLevels(tid);
    const level = resolveDofaLevel(body.amount_estimate, levels);
    return { ...rows[0], expected_dofa_level: level };
  }

  /** Procurement claims a submitted PR for sourcing */
  async claimRequisition(
    tenantId: string | undefined,
    userId: string,
    prId: string,
  ) {
    const tid = this.tenant(tenantId);
    const pr = await this.getRequisition(tid, prId);
    if (!['SUBMITTED', 'SOURCING'].includes(String(pr.status))) {
      throw new BadRequestException('PR is not available for sourcing');
    }
    const rows = await this.db.query(
      `UPDATE fin_purchase_requisitions
       SET status = 'SOURCING', sourcing_by = $2, updated_at = NOW()
       WHERE pr_id = $1 AND tenant_id = $3
       RETURNING *`,
      [prId, userId, tid],
    );
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row) throw new NotFoundException('PR not found');
    return row;
  }

  /** Procurement only: upload quote while SOURCING */
  async addQuote(
    tenantId: string | undefined,
    prId: string,
    body: {
      vendor_name: string;
      gstin: string;
      amount_inr: number;
      pdf_path: string;
      vendor_id?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    const pr = await this.getRequisition(tid, prId);
    if (!['SOURCING', 'QUOTED'].includes(String(pr.status))) {
      throw new BadRequestException({
        message:
          'PR must be claimed by Procurement before quotes (status SOURCING)',
        code: 'NOT_IN_SOURCING',
      });
    }
    if (
      !body.vendor_name?.trim() ||
      !(body.amount_inr > 0) ||
      !body.pdf_path?.trim()
    ) {
      throw new BadRequestException(
        'vendor_name, amount_inr, and pdf_path required',
      );
    }
    const gstin = normalizeGstin(body.gstin);
    if (!isValidGstinFormat(gstin)) {
      throw new BadRequestException({
        message: 'Invalid GSTIN format',
        code: 'INVALID_GSTIN',
      });
    }

    const existing = await this.db.query(
      `SELECT quote_id, gstin, related_party_hash FROM fin_quotations WHERE pr_id = $1`,
      [prId],
    );
    if (
      existing.some((q: { gstin: string }) => normalizeGstin(q.gstin) === gstin)
    ) {
      throw new BadRequestException({
        message:
          'Duplicate GSTIN on this PR — quotes must be from distinct vendors',
        code: 'DUPLICATE_GSTIN',
      });
    }

    const verify = await this.gst.verifyGstin(gstin);
    if (verify.status === 'INVALID_FORMAT') {
      throw new BadRequestException('Invalid GSTIN format');
    }
    if (verify.status === 'INACTIVE') {
      throw new BadRequestException({
        message: 'GSTIN is inactive on GST portal',
        code: 'GSTIN_INACTIVE',
      });
    }

    const hash = relatedPartyHash(
      verify.pan,
      verify.legalName ?? body.vendor_name,
    );

    const rows = await this.db.query(
      `INSERT INTO fin_quotations (
         pr_id, tenant_id, vendor_id, vendor_name, gstin, amount_inr, pdf_path,
         gst_verify_status, gst_verify_payload, related_party_hash
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
       RETURNING *`,
      [
        prId,
        tid,
        body.vendor_id ?? null,
        body.vendor_name.trim(),
        gstin,
        body.amount_inr,
        body.pdf_path.trim(),
        verify.status,
        JSON.stringify(verify.raw ?? verify),
        hash,
      ],
    );

    const lowest = await this.refreshLowestQuote(prId);
    await this.db.query(
      `UPDATE fin_purchase_requisitions SET status = 'QUOTED', updated_at = NOW()
       WHERE pr_id = $1 AND status IN ('SOURCING','QUOTED')`,
      [prId],
    );

    return {
      ...rows[0],
      lowest_quote_id: lowest,
      related_party_warning: false,
    };
  }

  /**
   * Procurement locks vendor (defaults to lowest) and routes to DOFA level.
   * Non-lowest requires justification → NON_LOWEST_QUOTE_EXCEPTION flag.
   */
  async submitForApproval(
    tenantId: string | undefined,
    userId: string,
    prId: string,
    body: {
      selected_quote_id: string;
      non_lowest_justification?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    const pr = await this.getRequisition(tid, prId);
    if (!['SOURCING', 'QUOTED'].includes(String(pr.status))) {
      throw new BadRequestException(
        'PR must be in sourcing/quoted before DOFA submit',
      );
    }
    if (pr.catalog_item_id) {
      throw new BadRequestException('Use catalog order path for catalog PRs');
    }

    const amount = Number(pr.amount_estimate);
    const rules = await this.quoteRules(tid);
    const rule = resolveQuoteRule(amount, rules);
    const quotes = pr.quotes as Array<{
      quote_id: string;
      amount_inr: string;
      gstin: string;
      pdf_path: string;
      related_party_hash: string;
      vendor_id: string | null;
      vendor_name: string;
    }>;

    if (quotes.length < rule.min_quotes) {
      throw new BadRequestException({
        message: `Need ${rule.min_quotes} valid quotes before submit (have ${quotes.length})`,
        code: 'INSUFFICIENT_QUOTES',
        min_quotes: rule.min_quotes,
      });
    }

    const pans = quotes
      .map((q) => {
        const fromHash = String(q.related_party_hash ?? '').split('|')[0];
        return fromHash || normalizeGstin(q.gstin).slice(2, 12);
      })
      .filter((p) => p && p.length === 10);
    const uniquePans = new Set(pans);
    if (pans.length >= 2 && uniquePans.size < pans.length) {
      await this.anomaly.raiseFlag(tid, 'RED', 'RELATED_PARTY_QUOTES', {
        pr_id: prId,
        message: 'Multiple quotes appear owned by the same party (shared PAN)',
        pans: [...uniquePans],
      });
      throw new BadRequestException({
        message: 'Related-party quotes detected — blocked',
        code: 'RELATED_PARTY_QUOTES',
      });
    }

    const lowestId = await this.refreshLowestQuote(prId);
    const selected = quotes.find((q) => q.quote_id === body.selected_quote_id);
    if (!selected)
      throw new BadRequestException('selected_quote_id not on this PR');

    let nonLowest = false;
    if (selected.quote_id !== lowestId) {
      const justification = String(body.non_lowest_justification ?? '').trim();
      if (justification.length < L2_JUSTIFICATION_MIN_CHARS) {
        throw new BadRequestException({
          message: `Non-lowest quote requires justification (≥${L2_JUSTIFICATION_MIN_CHARS} chars)`,
          code: 'NON_LOWEST_JUSTIFICATION_REQUIRED',
        });
      }
      nonLowest = true;
      await this.anomaly.raiseFlag(tid, 'RED', 'NON_LOWEST_QUOTE_EXCEPTION', {
        pr_id: prId,
        selected_quote_id: selected.quote_id,
        lowest_quote_id: lowestId,
        justification,
        amount,
        message: `Non-lowest vendor selected — ${justification}`,
      });
    }

    let vendorId = selected.vendor_id;
    if (!vendorId) {
      const upsert = await this.db.query(
        `INSERT INTO fin_vendors (tenant_id, business_name, gstin, is_active, gst_verify_status)
         VALUES ($1, $2, $3, true, 'PENDING_CREDENTIALS')
         ON CONFLICT (tenant_id, gstin) DO UPDATE SET business_name = EXCLUDED.business_name
         RETURNING vendor_id`,
        [tid, selected.vendor_name, selected.gstin],
      );
      vendorId = upsert[0]?.vendor_id ?? null;
    }

    const levels = await this.listDofaLevels(tid);
    const level = resolveDofaLevel(amount, levels);
    const status = pendingStatusForLevel(level.level_no);

    await this.db.query(
      `UPDATE fin_purchase_requisitions SET
         status = $2, selected_quote_id = $3, selected_vendor_id = $4,
         locked_quote_id = $3, required_level = $5,
         l2_justification = $6, escalated = $7, sourcing_by = COALESCE(sourcing_by, $8),
         updated_at = NOW()
       WHERE pr_id = $1`,
      [
        prId,
        status,
        selected.quote_id,
        vendorId,
        level.level_no,
        body.non_lowest_justification?.trim() ?? null,
        nonLowest,
        userId,
      ],
    );

    return {
      pr_id: prId,
      status,
      required_level: level.level_no,
      dofa_level: level,
      lowest_quote_id: lowestId,
      selected_quote_id: selected.quote_id,
      non_lowest_exception: nonLowest,
      required_signatures: level.required_signatures,
    };
  }

  /** Level-aware approval; L3 needs two distinct roles */
  async approveAtLevel(
    tenantId: string | undefined,
    approverId: string,
    roleName: string,
    prId: string,
    body?: { notes?: string; decision?: 'APPROVED' | 'REJECTED' },
  ) {
    const tid = this.tenant(tenantId);
    const pr = await this.getRequisition(tid, prId);
    const decision = body?.decision ?? 'APPROVED';

    if (pr.requested_by && String(pr.requested_by) === approverId) {
      throw new BadRequestException({
        message: 'Maker cannot approve own requisition (separation of duties)',
        code: 'SOD_VIOLATION',
      });
    }

    const levelNo = Number(pr.required_level);
    if (!levelNo || String(pr.status) !== pendingStatusForLevel(levelNo)) {
      throw new BadRequestException({
        message: `PR is not pending level approval (status=${pr.status})`,
        code: 'WRONG_LEVEL',
      });
    }

    const levels = await this.listDofaLevels(tid);
    const level = levels.find((l) => l.level_no === levelNo);
    if (!level) throw new BadRequestException('Unknown DOFA level');
    if (!roleCanSignLevel(roleName, level)) {
      throw new ForbiddenException({
        message: `Role ${roleName} cannot sign DOFA level ${levelNo}`,
        code: 'ROLE_NOT_AUTHORIZED',
        required_roles: level.required_roles,
      });
    }

    if (decision === 'REJECTED') {
      await this.db.query(
        `INSERT INTO fin_pr_approvals (
           pr_id, tenant_id, level_no, approver_user_id, approver_role, decision, notes
         ) VALUES ($1,$2,$3,$4,$5,'REJECTED',$6)
         ON CONFLICT (pr_id, level_no, approver_role) DO UPDATE SET
           decision = 'REJECTED', notes = EXCLUDED.notes, approved_at = NOW()`,
        [prId, tid, levelNo, approverId, roleName, body?.notes ?? null],
      );
      await this.db.query(
        `UPDATE fin_purchase_requisitions SET status = 'REJECTED', updated_at = NOW()
         WHERE pr_id = $1`,
        [prId],
      );
      return { pr_id: prId, status: 'REJECTED' };
    }

    await this.db.query(
      `INSERT INTO fin_pr_approvals (
         pr_id, tenant_id, level_no, approver_user_id, approver_role, decision, notes
       ) VALUES ($1,$2,$3,$4,$5,'APPROVED',$6)
       ON CONFLICT (pr_id, level_no, approver_role) DO UPDATE SET
         decision = 'APPROVED', notes = EXCLUDED.notes, approved_at = NOW(),
         approver_user_id = EXCLUDED.approver_user_id`,
      [prId, tid, levelNo, approverId, roleName, body?.notes ?? null],
    );

    const sigs = await this.db.query(
      `SELECT approver_role, approver_user_id FROM fin_pr_approvals
       WHERE pr_id = $1 AND level_no = $2 AND decision = 'APPROVED'`,
      [prId, levelNo],
    );

    if (level.required_signatures >= 2) {
      const rolesSigned = (sigs as { approver_role: string }[]).map(
        (s) => s.approver_role,
      );
      const distinctUsers = new Set(
        (sigs as { approver_user_id: string }[]).map((s) => s.approver_user_id),
      );
      const slots = dualSignSlotsSatisfied(
        level,
        rolesSigned,
        distinctUsers.size,
      );
      if (!slots.ok) {
        return {
          pr_id: prId,
          status: pr.status,
          required_level: levelNo,
          signatures_collected: sigs.length,
          required_signatures: level.required_signatures,
          awaiting: slots.awaiting,
        };
      }
    } else if (sigs.length < level.required_signatures) {
      return {
        pr_id: prId,
        status: pr.status,
        signatures_collected: sigs.length,
        required_signatures: level.required_signatures,
      };
    }

    const vendorId = pr.selected_vendor_id as string;
    if (!vendorId) throw new BadRequestException('No selected vendor');

    const po = await this.convertPrToPo(tid, String(pr.requested_by), prId, {
      description: String(pr.description),
      amount: Number(pr.amount_estimate),
      vendor_id: vendorId,
      l2_exception: Boolean(pr.l2_justification),
      dofa_auto_approved: false,
      approved_by: approverId,
      catalog_item_id: pr.catalog_item_id ?? null,
      budget_id: pr.budget_id ?? null,
      program_id: pr.program_id ?? null,
      grant_id: pr.grant_id ?? null,
      grant_expense_category: pr.grant_expense_category ?? null,
    });

    return {
      pr_id: prId,
      status: 'CONVERTED',
      required_level: levelNo,
      po,
    };
  }

  /** @deprecated use approveAtLevel — kept for compat */
  async approveRequisition(
    tenantId: string | undefined,
    approverId: string,
    roleName: string,
    prId: string,
  ) {
    return this.approveAtLevel(tenantId, approverId, roleName, prId);
  }

  private async convertPrToPo(
    tenantId: string,
    requesterId: string,
    prId: string,
    opts: {
      description: string;
      amount: number;
      vendor_id: string;
      l2_exception: boolean;
      dofa_auto_approved: boolean;
      approved_by?: string | null;
      catalog_item_id?: string | null;
      budget_id?: string | null;
      program_id?: string | null;
      grant_id?: string | null;
      grant_expense_category?: string | null;
    },
  ) {
    // After full DOFA level completion, PO is APPROVED (L5 is Chairman sign)
    const po = await this.db.query(
      `INSERT INTO fin_purchase_orders (
         tenant_id, description, amount, status, requested_by, vendor_id,
         approved_by, approved_at, pr_id, catalog_item_id,
         dofa_auto_approved, l2_exception, budget_id, program_id,
         grant_id, grant_expense_category
       ) VALUES ($1,$2,$3,'APPROVED',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        tenantId,
        opts.description,
        opts.amount,
        requesterId,
        opts.vendor_id,
        opts.approved_by ?? null,
        opts.approved_by ? new Date() : null,
        prId,
        opts.catalog_item_id ?? null,
        opts.dofa_auto_approved,
        opts.l2_exception,
        opts.budget_id ?? null,
        opts.program_id ?? null,
        opts.grant_id ?? null,
        opts.grant_expense_category ?? null,
      ],
    );

    await this.db.query(
      `INSERT INTO fin_po_lines (po_id, description, qty, unit_price)
       VALUES ($1, $2, 1, $3)`,
      [po[0].po_id, opts.description, opts.amount],
    );

    await this.db.query(
      `UPDATE fin_purchase_requisitions
       SET status = 'CONVERTED', po_id = $2, updated_at = NOW()
       WHERE pr_id = $1`,
      [prId, po[0].po_id],
    );

    await this.checkInvoiceSplitting(tenantId, requesterId, opts.vendor_id);
    return po[0];
  }

  // --- Catalog ---

  listCatalog(tenantId?: string) {
    return this.db.query(
      `SELECT c.*, v.business_name AS vendor_name
       FROM fin_catalog_items c
       LEFT JOIN fin_vendors v ON v.vendor_id = c.vendor_id
       WHERE c.tenant_id = $1 AND c.is_active = true
       ORDER BY c.category, c.name`,
      [this.tenant(tenantId)],
    );
  }

  async upsertCatalogItem(
    tenantId: string | undefined,
    body: {
      sku: string;
      name: string;
      category?: string;
      unit?: string;
      locked_unit_price: number;
      vendor_id: string;
      catalog_item_id?: string;
    },
  ) {
    const tid = this.tenant(tenantId);
    if (
      !body.sku ||
      !body.name ||
      !(body.locked_unit_price > 0) ||
      !body.vendor_id
    ) {
      throw new BadRequestException(
        'sku, name, locked_unit_price, vendor_id required',
      );
    }
    if (body.catalog_item_id) {
      const rows = await this.db.query(
        `UPDATE fin_catalog_items SET
           name = $2, category = $3, unit = $4, locked_unit_price = $5,
           vendor_id = $6, sku = $7
         WHERE catalog_item_id = $1 AND tenant_id = $8
         RETURNING *`,
        [
          body.catalog_item_id,
          body.name,
          body.category ?? null,
          body.unit ?? 'unit',
          body.locked_unit_price,
          body.vendor_id,
          body.sku,
          tid,
        ],
      );
      if (!rows[0]) throw new NotFoundException('Catalog item not found');
      return rows[0];
    }
    const rows = await this.db.query(
      `INSERT INTO fin_catalog_items (
         tenant_id, sku, name, category, unit, locked_unit_price, vendor_id, is_active, effective_from
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,true,CURRENT_DATE)
       RETURNING *`,
      [
        tid,
        body.sku,
        body.name,
        body.category ?? null,
        body.unit ?? 'unit',
        body.locked_unit_price,
        body.vendor_id,
      ],
    );
    return rows[0];
  }

  /** Catalog order: skip quotes, still route through DOFA levels */
  async orderFromCatalog(
    tenantId: string | undefined,
    userId: string,
    _roleName: string,
    body: { catalog_item_id: string; qty: number },
  ) {
    const tid = this.tenant(tenantId);
    if (!(body.qty > 0)) throw new BadRequestException('qty must be > 0');
    const items = await this.db.query(
      `SELECT * FROM fin_catalog_items
       WHERE catalog_item_id = $1 AND tenant_id = $2 AND is_active = true`,
      [body.catalog_item_id, tid],
    );
    if (!items[0]) throw new NotFoundException('Catalog item not found');
    const item = items[0];
    if (!item.vendor_id) {
      throw new BadRequestException('Catalog item has no locked vendor');
    }
    const amount = Number(item.locked_unit_price) * Number(body.qty);
    const description = `Catalog: ${item.name} × ${body.qty} ${item.unit}`;
    const levels = await this.listDofaLevels(tid);
    const level = resolveDofaLevel(amount, levels);
    const status = pendingStatusForLevel(level.level_no);

    const pr = await this.db.query(
      `INSERT INTO fin_purchase_requisitions (
         tenant_id, requested_by, description, amount_estimate, status,
         selected_vendor_id, catalog_item_id, catalog_qty, required_level, budget_ok
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,true)
       RETURNING *`,
      [
        tid,
        userId,
        description,
        amount,
        status,
        item.vendor_id,
        item.catalog_item_id,
        body.qty,
        level.level_no,
      ],
    );

    return {
      pr: pr[0],
      po: null,
      dofa_level: level,
      skips_quotes: true,
      status,
    };
  }

  // --- Analytics ---

  async checkInvoiceSplitting(
    tenantId: string,
    requestedBy: string,
    vendorId: string,
  ) {
    const dofaLimit = 50000; // L1 band — splitting under HOD limit
    const pos = await this.db.query(
      `SELECT po_id, amount, vendor_id, requested_by, created_at
       FROM fin_purchase_orders
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND vendor_id = $2 AND requested_by = $3
         AND created_at >= NOW() - INTERVAL '30 days'
         AND status IN ('PENDING','APPROVED','PAID','PENDING_BOARD_APPROVAL')`,
      [tenantId, vendorId, requestedBy],
    );

    const signals = detectInvoiceSplitting(
      pos.map(
        (p: {
          po_id: string;
          amount: string;
          vendor_id: string;
          requested_by: string;
          created_at: string;
        }) => ({
          po_id: p.po_id,
          amount: Number(p.amount),
          vendor_id: p.vendor_id,
          requested_by: p.requested_by,
          created_at: p.created_at,
        }),
      ),
      dofaLimit,
    );

    for (const signal of signals) {
      await this.anomaly.raiseFlag(tenantId, 'RED', 'INVOICE_SPLITTING', {
        ...signal,
        amount: signal.total_amount,
      });
    }
    return signals;
  }

  async runNightlyInvoiceSplitScan(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const pairs = await this.db.query(
      `SELECT DISTINCT vendor_id, requested_by
       FROM fin_purchase_orders
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND vendor_id IS NOT NULL AND requested_by IS NOT NULL
         AND created_at >= NOW() - INTERVAL '30 days'`,
      [tid],
    );
    const all: InvoiceSplitSignal[] = [];
    for (const p of pairs as { vendor_id: string; requested_by: string }[]) {
      all.push(
        ...(await this.checkInvoiceSplitting(tid, p.requested_by, p.vendor_id)),
      );
    }
    return { scanned_pairs: pairs.length, signals: all.length };
  }

  async fraudSignals(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const flags = await this.db.query(
      `SELECT flag_id, severity, rule_code, details, created_at
       FROM fin_anomaly_flags
       WHERE tenant_id = $1
         AND rule_code IN (
           'L2_EXCEPTION','NON_LOWEST_QUOTE_EXCEPTION','INVOICE_SPLITTING',
           'RELATED_PARTY_QUOTES','DUPLICATE_INVOICE'
         )
       ORDER BY created_at DESC
       LIMIT 100`,
      [tid],
    );
    const pendingGst = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM fin_quotations
       WHERE tenant_id = $1 AND gst_verify_status = 'PENDING_CREDENTIALS'`,
      [tid],
    );
    const openEsc = await this.db.query(
      `SELECT COUNT(*)::int AS count FROM fin_purchase_requisitions
       WHERE tenant_id = $1 AND status LIKE 'PENDING_L%'`,
      [tid],
    );
    return {
      flags,
      pending_gst_verifications: pendingGst[0]?.count ?? 0,
      pending_escalations: openEsc[0]?.count ?? 0,
    };
  }

  async verifyVendorGst(tenantId: string | undefined, vendorId: string) {
    const tid = this.tenant(tenantId);
    const vendors = await this.db.query(
      `SELECT * FROM fin_vendors WHERE vendor_id = $1 AND tenant_id = $2`,
      [vendorId, tid],
    );
    if (!vendors[0]) throw new NotFoundException('Vendor not found');
    const verify = await this.gst.verifyGstin(String(vendors[0].gstin ?? ''));
    const hash = relatedPartyHash(verify.pan, verify.legalName);
    await this.db.query(
      `UPDATE fin_vendors SET
         gst_verify_status = $2, gst_verified_at = NOW(),
         gst_legal_name = $3, pan_from_gst = $4, related_party_hash = $5
       WHERE vendor_id = $1`,
      [vendorId, verify.status, verify.legalName, verify.pan, hash],
    );
    return verify;
  }
}
