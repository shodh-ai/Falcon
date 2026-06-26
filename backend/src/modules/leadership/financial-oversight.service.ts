import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BudgetFpaService } from './budget-fpa.service';

@Injectable()
export class FinancialOversightService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly budgetFpa: BudgetFpaService,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  async getOverview(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [macro, revenue, expenses, waivers, grants, wealth, audit] =
      await Promise.all([
        this.getMacroBudget(tid),
        this.getRevenueOversight(tid),
        this.getExpenseOversight(tid),
        this.getWaiverOversight(tid),
        this.getGrantOversight(tid),
        this.getWealthOversight(tid),
        this.getAuditShield(tid),
      ]);
    return { macro_budget: macro, revenue, expenses, waivers, grants, wealth, audit };
  }

  async getMacroBudget(tenantId?: string, financialYear?: string) {
    const tid = this.tenantId(tenantId);
    const fy = financialYear ?? this.budgetFpa.currentFinancialYear();
    const depts = await this.db.query(
      `SELECT b.budget_id, b.department_id, d.dept_name,
              b.allocated_amount, b.capex_allocated, b.opex_allocated,
              b.encumbered_amount, b.utilized_amount, b.budget_limit_mode,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND(((b.utilized_amount + b.encumbered_amount) / b.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_pct,
              (b.allocated_amount - b.utilized_amount - b.encumbered_amount) AS remaining
       FROM fin_dept_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.financial_year = $2 AND b.deleted_at IS NULL
       ORDER BY d.dept_name`,
      [tid, fy],
    ).catch(() => []);

    const [univ] = await this.db.query(
      `SELECT total_allocated, status FROM fin_university_budgets WHERE tenant_id = $1 AND financial_year = $2`,
      [tid, fy],
    ).catch(() => [{}]);

    return {
      financial_year: fy,
      university_total: Number(univ?.total_allocated ?? 0),
      status: univ?.status ?? 'DRAFT',
      departments: depts.map((r: Record<string, unknown>) => ({
        budget_id: r.budget_id,
        department_id: r.department_id,
        department: r.dept_name,
        allocated: Number(r.allocated_amount ?? 0),
        capex_allocated: Number(r.capex_allocated ?? 0),
        opex_allocated: Number(r.opex_allocated ?? 0),
        consumed: Number(r.utilized_amount ?? 0) + Number(r.encumbered_amount ?? 0),
        remaining: Number(r.remaining ?? 0),
        utilization_pct: Number(r.utilization_pct ?? 0),
        limit_mode: r.budget_limit_mode,
        variance: Number(r.allocated_amount ?? 0) - Number(r.utilized_amount ?? 0) - Number(r.encumbered_amount ?? 0),
      })),
    };
  }

  async reappropriateBudget(
    tenantId: string | undefined,
    approverId: string,
    dto: {
      financial_year?: string;
      from_budget_id: string;
      to_budget_id: string;
      amount: number;
      reason?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const fy = dto.financial_year ?? this.budgetFpa.currentFinancialYear();
    const amount = Number(dto.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    return this.db.transaction(async (tx) => {
      const [fromRow] = await tx.query(
        `SELECT budget_id, allocated_amount, utilized_amount, encumbered_amount
         FROM fin_dept_budgets WHERE tenant_id = $1 AND budget_id = $2 FOR UPDATE`,
        [tid, dto.from_budget_id],
      );
      if (!fromRow) throw new BadRequestException('Source budget not found');
      const available =
        Number(fromRow.allocated_amount) -
        Number(fromRow.utilized_amount) -
        Number(fromRow.encumbered_amount);
      if (amount > available) {
        throw new BadRequestException(`Only ₹${available.toLocaleString()} available to move`);
      }

      await tx.query(
        `UPDATE fin_dept_budgets SET allocated_amount = allocated_amount - $2,
         capex_allocated = GREATEST(capex_allocated - ROUND($2 * 0.35, 2), 0),
         opex_allocated = GREATEST(opex_allocated - ROUND($2 * 0.65, 2), 0)
         WHERE budget_id = $1`,
        [dto.from_budget_id, amount],
      );
      await tx.query(
        `UPDATE fin_dept_budgets SET allocated_amount = allocated_amount + $2,
         capex_allocated = capex_allocated + ROUND($2 * 0.35, 2),
         opex_allocated = opex_allocated + ROUND($2 * 0.65, 2)
         WHERE budget_id = $1`,
        [dto.to_budget_id, amount],
      );
      await tx.query(
        `INSERT INTO fin_budget_reappropriations
           (tenant_id, financial_year, from_budget_id, to_budget_id, amount, reason, approved_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tid, fy, dto.from_budget_id, dto.to_budget_id, amount, dto.reason ?? null, approverId],
      );
      return { ok: true, amount };
    });
  }

  async checkPoBudgetLimit(tenantId: string | undefined, budgetId: string, poAmount: number) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT allocated_amount, utilized_amount, encumbered_amount, budget_limit_mode, d.dept_name
       FROM fin_dept_budgets b LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.budget_id = $2`,
      [tid, budgetId],
    );
    const row = rows[0] as Record<string, unknown> | undefined;
    if (!row) return { allowed: true, action: 'ALLOW' };
    const remaining =
      Number(row.allocated_amount) - Number(row.utilized_amount) - Number(row.encumbered_amount);
    if (poAmount <= remaining) return { allowed: true, action: 'ALLOW', remaining };
    if (row.budget_limit_mode === 'HARD_STOP') {
      return { allowed: false, action: 'HARD_STOP', remaining, department: row.dept_name };
    }
    return { allowed: true, action: 'SOFT_WARNING', remaining, department: row.dept_name, requires_chairman: true };
  }

  async getRevenueOversight(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [tuition, nonTuition, ancillary, aging, treasury] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(SUM(paid_amount), 0)::numeric AS collected,
                COALESCE(SUM(total_amount), 0)::numeric AS expected
         FROM finance_fee_demands
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND fee_head NOT ILIKE '%hostel%' AND fee_head NOT ILIKE '%transport%'
           AND fee_head NOT ILIKE '%mess%' AND fee_head NOT ILIKE '%library%'`,
        [tid],
      ).catch(() => [{ collected: 0, expected: 0 }]),
      this.db.query(
        `SELECT fee_head, COALESCE(SUM(paid_amount), 0)::numeric AS collected
         FROM finance_fee_demands
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND (fee_head ILIKE '%application%' OR fee_head ILIKE '%exam%' OR fee_head ILIKE '%library%'
                OR fee_head ILIKE '%fine%' OR fee_head ILIKE '%donation%')
         GROUP BY fee_head ORDER BY collected DESC`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT
           COALESCE(SUM(CASE WHEN fee_head ILIKE '%hostel%' THEN paid_amount ELSE 0 END), 0)::numeric AS hostel_revenue,
           COALESCE(SUM(CASE WHEN fee_head ILIKE '%mess%' OR fee_head ILIKE '%cafeteria%' THEN paid_amount ELSE 0 END), 0)::numeric AS mess_revenue,
           COALESCE(SUM(CASE WHEN fee_head ILIKE '%transport%' THEN paid_amount ELSE 0 END), 0)::numeric AS transport_revenue
         FROM finance_fee_demands WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tid],
      ).catch(() => [{}]),
      this.getReceivablesAging(tid),
      this.getTreasuryView(tid),
    ]);
    const anc = ancillary[0] ?? {};
    return {
      tuition_vs_non_tuition: {
        tuition_collected: Number(tuition[0]?.collected ?? 0),
        tuition_expected: Number(tuition[0]?.expected ?? 0),
        non_tuition: nonTuition.map((r: Record<string, unknown>) => ({
          source: r.fee_head,
          collected: Number(r.collected ?? 0),
        })),
      },
      ancillary_pl: {
        hostel: { revenue: Number(anc.hostel_revenue ?? 0) },
        mess: { revenue: Number(anc.mess_revenue ?? 0) },
        transport: { revenue: Number(anc.transport_revenue ?? 0) },
      },
      receivables_aging: aging,
      treasury: treasury,
    };
  }

  async getReceivablesAging(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT
         CASE
           WHEN due_date >= CURRENT_DATE THEN 'current'
           WHEN CURRENT_DATE - due_date <= 30 THEN '0_30_days'
           WHEN CURRENT_DATE - due_date <= 60 THEN '31_60_days'
           WHEN CURRENT_DATE - due_date <= 90 THEN '61_90_days'
           ELSE '90_plus_days'
         END AS bucket,
         COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS outstanding,
         COUNT(*)::int AS invoice_count
       FROM finance_fee_demands
       WHERE tenant_id = $1 AND deleted_at IS NULL
         AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
         AND (total_amount - paid_amount) > 0
       GROUP BY 1 ORDER BY 1`,
      [tid],
    ).catch(() => []);
    return rows.map((r: Record<string, unknown>) => ({
      bucket: r.bucket,
      outstanding: Number(r.outstanding ?? 0),
      count: Number(r.invoice_count ?? 0),
    }));
  }

  async getTreasuryView(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [banks, payroll, outstanding] = await Promise.all([
      this.db.query(
        `SELECT bank_account_key, closing_balance, balance_date
         FROM bank_balance_snapshots
         WHERE tenant_id = $1
         ORDER BY balance_date DESC LIMIT 5`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT COALESCE(SUM(net_pay::numeric), 0)::numeric AS next_month_estimate
         FROM staff_payslips WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '3 months'`,
        [tid],
      ).catch(() => [{ next_month_estimate: 0 }]),
      this.db.query(
        `SELECT COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS total
         FROM finance_fee_demands WHERE tenant_id = $1 AND deleted_at IS NULL
           AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')`,
        [tid],
      ).catch(() => [{ total: 0 }]),
    ]);
    const cashPosition = (banks as Array<{ closing_balance: string }>).reduce(
      (s, b) => s + Number(b.closing_balance ?? 0),
      0,
    );
    return {
      cash_in_bank: cashPosition,
      bank_accounts: banks,
      upcoming_payroll_estimate: Number(payroll[0]?.next_month_estimate ?? 0) / 3,
      outstanding_receivables: Number(outstanding[0]?.total ?? 0),
      net_liquidity: cashPosition - Number(payroll[0]?.next_month_estimate ?? 0) / 3,
    };
  }

  async getExpenseOversight(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [thresholds, payroll, vendors, costPerStudent, poQueue] = await Promise.all([
      this.db.query(
        `SELECT category, auto_approve_below, chairman_approval_above
         FROM executive_approval_thresholds WHERE tenant_id = $1 ORDER BY category`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT TO_CHAR(date_trunc('month', created_at), 'YYYY-MM') AS month,
                SUM(net_pay::numeric)::numeric AS total, COUNT(*)::int AS payslips
         FROM staff_payslips WHERE tenant_id = $1 AND deleted_at IS NULL
           AND created_at >= NOW() - INTERVAL '6 months'
         GROUP BY 1 ORDER BY 1`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT v.vendor_name, SUM(i.net_payable)::numeric AS spend
         FROM fin_vendor_invoices i
         JOIN fin_vendors v ON v.vendor_id = i.vendor_id
         WHERE i.tenant_id = $1 AND i.deleted_at IS NULL AND i.status NOT IN ('REJECTED', 'CANCELLED')
         GROUP BY v.vendor_name ORDER BY spend DESC LIMIT 5`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT h.total_students,
                COALESCE(SUM(d.utilized_amount + d.encumbered_amount), 0)::numeric AS total_spend
         FROM exec_daily_university_health h
         LEFT JOIN fin_dept_budgets d ON d.tenant_id = h.tenant_id AND d.deleted_at IS NULL
         WHERE h.tenant_id = $1 GROUP BY h.total_students LIMIT 1`,
        [tid],
      ).catch(() => [{ total_students: 0, total_spend: 0 }]),
      this.db.query(
        `SELECT po_id, description, amount, status, created_at
         FROM fin_purchase_orders WHERE tenant_id = $1 AND deleted_at IS NULL
           AND status IN ('PENDING', 'PENDING_BOARD_APPROVAL')
         ORDER BY created_at DESC LIMIT 20`,
        [tid],
      ).catch(() => []),
    ]);
    const cps = costPerStudent[0] ?? {};
    const students = Number(cps.total_students ?? 1);
    const spend = Number(cps.total_spend ?? 0);
    return {
      po_approval_tiers: thresholds,
      pending_pos: poQueue,
      payroll_trend: payroll.map((r: Record<string, unknown>) => ({
        month: r.month,
        total: Number(r.total ?? 0),
        payslips: Number(r.payslips ?? 0),
      })),
      top_vendors: vendors.map((r: Record<string, unknown>) => ({
        vendor: r.vendor_name,
        spend: Number(r.spend ?? 0),
      })),
      cost_per_student: {
        total_operational_cost: spend,
        student_count: students,
        cost_per_student: students ? Math.round(spend / students) : 0,
      },
    };
  }

  async getWaiverOversight(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [total, byCategory, pending] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(SUM(
           CASE WHEN fee_head ILIKE '%scholarship%' OR fee_head ILIKE '%waiver%' OR fee_head ILIKE '%discount%'
                THEN (total_amount - paid_amount) ELSE 0 END
         ), 0)::numeric AS waiver_value,
         COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS total_outstanding
         FROM finance_fee_demands WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tid],
      ).catch(() => [{ waiver_value: 0 }]),
      this.db.query(
        `SELECT
           CASE
             WHEN fee_head ILIKE '%merit%' THEN 'Merit-Based'
             WHEN fee_head ILIKE '%sport%' THEN 'Sports Quota'
             WHEN fee_head ILIKE '%staff%' THEN 'Staff-Child'
             WHEN fee_head ILIKE '%sibling%' OR fee_head ILIKE '%alumni%' THEN 'Alumni Sibling'
             WHEN fee_head ILIKE '%scholarship%' OR fee_head ILIKE '%waiver%' THEN 'General Scholarship'
             ELSE 'Other Concession'
           END AS category,
           COALESCE(SUM(total_amount - paid_amount), 0)::numeric AS amount
         FROM finance_fee_demands
         WHERE tenant_id = $1 AND deleted_at IS NULL
           AND (fee_head ILIKE '%scholarship%' OR fee_head ILIKE '%waiver%' OR fee_head ILIKE '%discount%')
         GROUP BY 1 ORDER BY amount DESC`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT request_id, waiver_amount, reason, status, created_at
         FROM executive_fee_waiver_requests WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY created_at DESC`,
        [tid],
      ).catch(() => []),
    ]);
    return {
      total_waiver_impact: Number(total[0]?.waiver_value ?? 0),
      by_category: byCategory.map((r: Record<string, unknown>) => ({
        category: r.category,
        amount: Number(r.amount ?? 0),
      })),
      pending_executive_overrides: pending,
    };
  }

  async getGrantOversight(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const grants = await this.db.query(
      `SELECT g.grant_id, g.grant_title, g.funding_agency, g.sanctioned_amount, g.start_date, g.end_date,
              COALESCE(SUM(e.amount), 0)::numeric AS spent
       FROM research_grants g
       LEFT JOIN research_grant_expenses e ON e.grant_id = g.grant_id
       WHERE g.tenant_id = $1
       GROUP BY g.grant_id ORDER BY g.end_date ASC`,
      [tid],
    ).catch(() => []);

    return {
      grants: grants.map((g: Record<string, unknown>) => {
        const sanctioned = Number(g.sanctioned_amount ?? 0);
        const spent = Number(g.spent ?? 0);
        const endDate = g.end_date ? new Date(String(g.end_date)) : null;
        const daysToExpiry = endDate
          ? Math.ceil((endDate.getTime() - Date.now()) / (86400000))
          : null;
        return {
          grant_id: g.grant_id,
          title: g.grant_title,
          agency: g.funding_agency,
          sanctioned,
          spent,
          remaining: sanctioned - spent,
          utilization_pct: sanctioned ? Math.round((spent / sanctioned) * 100) : 0,
          end_date: g.end_date,
          expiry_alert: daysToExpiry != null && daysToExpiry <= 90,
          unspent_at_risk: sanctioned - spent,
        };
      }),
    };
  }

  async getWealthOversight(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [loans, fds] = await Promise.all([
      this.db.query(
        `SELECT * FROM fin_debt_facilities WHERE tenant_id = $1 ORDER BY next_emi_date ASC NULLS LAST`,
        [tid],
      ).catch(() => []),
      this.db.query(
        `SELECT * FROM fin_fixed_deposits WHERE tenant_id = $1 ORDER BY maturity_date ASC`,
        [tid],
      ).catch(() => []),
    ]);
    return {
      loans: loans.map((l: Record<string, unknown>) => ({
        lender: l.lender_name,
        principal_remaining: Number(l.principal_remaining ?? 0),
        emi_amount: Number(l.emi_amount ?? 0),
        next_emi_date: l.next_emi_date,
        interest_rate_pct: Number(l.interest_rate_pct ?? 0),
      })),
      fixed_deposits: fds.map((f: Record<string, unknown>) => ({
        bank: f.bank_name,
        principal: Number(f.principal ?? 0),
        maturity_date: f.maturity_date,
        interest_yielded: Number(f.interest_yielded ?? 0),
        interest_rate_pct: Number(f.interest_rate_pct ?? 0),
      })),
      total_debt: loans.reduce(
        (s: number, l: Record<string, unknown>) => s + Number(l.principal_remaining ?? 0),
        0,
      ),
      total_corpus_fd: fds.reduce(
        (s: number, f: Record<string, unknown>) => s + Number(f.principal ?? 0),
        0,
      ),
    };
  }

  async getAuditShield(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [ledgerAlerts, reconFlags, taxReminders] = await Promise.all([
      this.db.query(
        `SELECT log_id, table_name, record_id, action, changed_by_user_id, changed_at
         FROM system_audit_logs
         WHERE table_name IN ('finance_transactions', 'finance_fee_demands', 'finance_journal_entries')
           AND action IN ('DELETE', 'UPDATE')
           AND changed_at >= NOW() - INTERVAL '30 days'
         ORDER BY changed_at DESC LIMIT 30`,
        [],
      ).catch(() => []),
      this.db.query(
        `SELECT
           COALESCE(SUM(t.amount), 0)::numeric AS crm_collections,
           (SELECT COALESCE(SUM(closing_balance), 0)::numeric FROM bank_balance_snapshots WHERE tenant_id = $1
            ORDER BY balance_date DESC LIMIT 1) AS latest_bank_snapshot
         FROM finance_transactions t
         JOIN users u ON u.user_id = t.student_user_id
         WHERE u.tenant_id = $1 AND t.status = 'SUCCESS' AND t.deleted_at IS NULL
           AND t.created_at >= date_trunc('month', CURRENT_DATE)`,
        [tid],
      ).catch(() => [{ crm_collections: 0, latest_bank_snapshot: 0 }]),
      this.db.query(
        `SELECT event_id, title, event_type, due_date, status
         FROM compliance_calendar_events
         WHERE tenant_id = $1 AND event_type = 'TAX_FILING' AND status != 'COMPLETED'
         ORDER BY due_date ASC LIMIT 10`,
        [tid],
      ).catch(() => []),
    ]);
    const recon = reconFlags[0] ?? {};
    const crm = Number(recon.crm_collections ?? 0);
    const bank = Number(recon.latest_bank_snapshot ?? 0);
    const variance = Math.abs(crm - bank);
    return {
      ledger_modifications: ledgerAlerts,
      bank_reconciliation: {
        month_collections_crm: crm,
        latest_bank_balance: bank,
        variance,
        flagged: variance > crm * 0.05 && crm > 0,
      },
      tax_compliance_reminders: taxReminders,
    };
  }
}
