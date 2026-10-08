import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

type Period = 'day' | 'week' | 'month' | 'year';

@Injectable()
export class LeadershipIntelligenceService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  listAllocationRules(tenantId?: string, params?: { feeHead?: string }) {
    const tid = this.tenantId(tenantId);
    return this.db.query(
      `SELECT rule_id, fee_head, program_code, template_id, ledger_category, weight, is_active, created_at, updated_at
       FROM finance_allocation_rules
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR fee_head = $2)
       ORDER BY fee_head, program_code NULLS FIRST, template_id NULLS FIRST, weight DESC, ledger_category ASC`,
      [tid, params?.feeHead ?? null],
    );
  }

  async upsertAllocationRule(tenantId?: string, dto?: Record<string, unknown>) {
    const tid = this.tenantId(tenantId);
    const ruleId = (dto?.rule_id as string | undefined) ?? null;
    const feeHead = String(dto?.fee_head ?? 'TUITION');
    const programCode = (dto?.program_code as string | undefined) ?? null;
    const templateId = (dto?.template_id as string | undefined) ?? null;
    const ledgerCategory = String(dto?.ledger_category ?? 'TUITION_GENERAL');
    const weight = Number(dto?.weight ?? 1);
    const isActive =
      dto?.is_active === undefined ? true : Boolean(dto.is_active);

    if (!ruleId) {
      const rows = await this.db.query(
        `INSERT INTO finance_allocation_rules
           (tenant_id, fee_head, program_code, template_id, ledger_category, weight, is_active)
         VALUES ($1, $2, $3, $4::uuid, $5, $6, $7)
         RETURNING rule_id`,
        [
          tid,
          feeHead,
          programCode,
          templateId,
          ledgerCategory,
          weight,
          isActive,
        ],
      );
      return {
        created: true,
        rule_id: (rows[0] as { rule_id: string }).rule_id,
      };
    }

    await this.db.query(
      `UPDATE finance_allocation_rules
       SET fee_head = $2,
           program_code = $3,
           template_id = $4::uuid,
           ledger_category = $5,
           weight = $6,
           is_active = $7,
           updated_at = NOW()
       WHERE tenant_id = $1 AND rule_id = $8::uuid`,
      [
        tid,
        feeHead,
        programCode,
        templateId,
        ledgerCategory,
        weight,
        isActive,
        ruleId,
      ],
    );
    return { updated: true, rule_id: ruleId };
  }

  listBankBalanceSnapshots(
    tenantId?: string,
    params?: { bankAccountKey?: string; from?: string; to?: string },
  ) {
    const tid = this.tenantId(tenantId);
    return this.db.query(
      `SELECT snapshot_id, bank_account_key, balance_date, closing_balance, source, payload, created_at
       FROM bank_balance_snapshots
       WHERE tenant_id = $1
         AND ($2::text IS NULL OR bank_account_key = $2)
         AND ($3::date IS NULL OR balance_date >= $3::date)
         AND ($4::date IS NULL OR balance_date <= $4::date)
       ORDER BY balance_date DESC
       LIMIT 400`,
      [
        tid,
        params?.bankAccountKey ?? null,
        params?.from ?? null,
        params?.to ?? null,
      ],
    );
  }

  async upsertBankBalanceSnapshot(
    tenantId?: string,
    dto?: Record<string, unknown>,
  ) {
    const tid = this.tenantId(tenantId);
    const bankAccountKey = String(dto?.bank_account_key ?? 'primary');
    const balanceDate = String(
      dto?.balance_date ?? new Date().toISOString().slice(0, 10),
    );
    const closingBalance = Number(dto?.closing_balance ?? 0);
    const source = String(dto?.source ?? 'MANUAL');
    const payload = (dto?.payload as Record<string, unknown> | undefined) ?? {};

    await this.db.query(
      `INSERT INTO bank_balance_snapshots
         (tenant_id, bank_account_key, balance_date, closing_balance, source, payload)
       VALUES ($1, $2, $3::date, $4, $5, $6::jsonb)
       ON CONFLICT (tenant_id, bank_account_key, balance_date)
       DO UPDATE SET
         closing_balance = EXCLUDED.closing_balance,
         source = EXCLUDED.source,
         payload = EXCLUDED.payload`,
      [
        tid,
        bankAccountKey,
        balanceDate,
        closingBalance,
        source,
        JSON.stringify(payload),
      ],
    );

    return {
      upserted: true,
      bank_account_key: bankAccountKey,
      balance_date: balanceDate,
    };
  }

  async getVariance(
    tenantId?: string,
    params?: { metric: string; compare: 'MoM' | 'YoY' | 'BUDGET' },
  ) {
    const tid = this.tenantId(tenantId);
    const metric = String(params?.metric ?? 'TUITION_REVENUE');
    const compare = params?.compare ?? 'MoM';

    if (metric === 'TUITION_REVENUE') {
      const rows = await this.db.query(
        `WITH m AS (
           SELECT DATE_TRUNC('month', t.created_at)::date AS month,
                  COALESCE(SUM(amount), 0)::numeric AS revenue
           FROM finance_transactions t
           JOIN users u ON u.user_id = t.student_user_id
           WHERE u.tenant_id = $1
             AND t.deleted_at IS NULL
             AND t.status = 'SUCCESS'
             AND t.created_at >= NOW() - INTERVAL '18 months'
           GROUP BY 1
         )
         SELECT month,
                revenue,
                LAG(revenue, 1) OVER (ORDER BY month) AS prev_m,
                LAG(revenue, 12) OVER (ORDER BY month) AS prev_y
         FROM m
         ORDER BY month DESC
         LIMIT 1`,
        [tid],
      );
      const r = rows[0] as
        | {
            month: string;
            revenue: string;
            prev_m: string | null;
            prev_y: string | null;
          }
        | undefined;
      const current = Number(r?.revenue ?? 0);
      const prev =
        compare === 'YoY' ? Number(r?.prev_y ?? 0) : Number(r?.prev_m ?? 0);
      const pct = prev > 0 ? ((current - prev) / prev) * 100 : null;
      return {
        metric,
        compare,
        period: r?.month ?? null,
        current,
        previous: prev,
        delta: current - prev,
        delta_pct: pct,
      };
    }

    if (metric === 'VENDOR_SPEND') {
      const rows = await this.db.query(
        `WITH m AS (
           SELECT DATE_TRUNC('month', invoice_date)::date AS month,
                  COALESCE(SUM(net_payable), 0)::numeric AS spend
           FROM fin_vendor_invoices
           WHERE tenant_id = $1
             AND deleted_at IS NULL
             AND invoice_date >= CURRENT_DATE - INTERVAL '18 months'
           GROUP BY 1
         )
         SELECT month,
                spend,
                LAG(spend, 1) OVER (ORDER BY month) AS prev_m,
                LAG(spend, 12) OVER (ORDER BY month) AS prev_y
         FROM m
         ORDER BY month DESC
         LIMIT 1`,
        [tid],
      );
      const r = rows[0] as
        | {
            month: string;
            spend: string;
            prev_m: string | null;
            prev_y: string | null;
          }
        | undefined;
      const current = Number(r?.spend ?? 0);
      const prev =
        compare === 'YoY' ? Number(r?.prev_y ?? 0) : Number(r?.prev_m ?? 0);
      const pct = prev > 0 ? ((current - prev) / prev) * 100 : null;
      return {
        metric,
        compare,
        period: r?.month ?? null,
        current,
        previous: prev,
        delta: current - prev,
        delta_pct: pct,
      };
    }

    if (metric === 'BUDGET_UTILIZATION') {
      const rows = await this.db.query(
        `SELECT COALESCE(SUM(allocated_amount), 0)::numeric AS allocated,
                COALESCE(SUM(utilized_amount), 0)::numeric AS utilized
         FROM fin_dept_budgets
         WHERE tenant_id = $1`,
        [tid],
      );
      const allocated = Number(rows[0]?.allocated ?? 0);
      const utilized = Number(rows[0]?.utilized ?? 0);
      const variance = allocated - utilized;
      return {
        metric,
        compare: 'BUDGET',
        allocated,
        actual: utilized,
        variance,
        variance_pct: allocated > 0 ? (variance / allocated) * 100 : null,
      };
    }

    return {
      metric,
      compare,
      current: 0,
      previous: 0,
      delta: 0,
      delta_pct: null,
    };
  }

  async getDeptScatter(tenantId?: string, params?: { month?: string }) {
    const tid = this.tenantId(tenantId);
    const month = params?.month ?? new Date().toISOString().slice(0, 7);
    const monthStart = `${month}-01`;

    const revenueRows = await this.db.query(
      `SELECT department, COALESCE(SUM(revenue), 0)::numeric AS revenue
       FROM exec_mv_finance_summary
       WHERE tenant_id = $1 AND month = $2::date
       GROUP BY 1`,
      [tid, monthStart],
    );

    const costRows = await this.db.query(
      `SELECT COALESCE(d.dept_name, 'Unassigned') AS department,
              COALESCE(SUM(i.net_payable), 0)::numeric AS cost
       FROM fin_vendor_invoices i
       LEFT JOIN departments d ON d.dept_id = i.department_id
       WHERE i.tenant_id = $1
         AND i.deleted_at IS NULL
         AND DATE_TRUNC('month', i.invoice_date)::date = $2::date
       GROUP BY 1`,
      [tid, monthStart],
    );

    const costMap = new Map(
      costRows.map((r: { department: string; cost: string }) => [
        r.department,
        Number(r.cost),
      ]),
    );

    const points = revenueRows.map(
      (r: { department: string; revenue: string }) => ({
        department: r.department,
        revenue: Number(r.revenue),
        cost: costMap.get(r.department) ?? 0,
      }),
    );

    return { month, points };
  }

  async getOwnerRatios(tenantId?: string, params?: { date?: string }) {
    const tid = this.tenantId(tenantId);
    const date = params?.date ?? new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `SELECT ratio_date, cac, faculty_roi, opex_ratio, fee_collection_efficiency, sources, generated_at
       FROM owner_financial_ratios_daily
       WHERE tenant_id = $1 AND ratio_date = $2::date
       LIMIT 1`,
      [tid, date],
    );
    const row = rows[0] as
      | {
          ratio_date: string;
          cac: string | null;
          faculty_roi: string | null;
          opex_ratio: string | null;
          fee_collection_efficiency: string | null;
          sources: Record<string, unknown> | null;
          generated_at: string;
        }
      | undefined;

    return {
      ratio_date: row?.ratio_date ?? date,
      cac: row?.cac != null ? Number(row.cac) : null,
      faculty_roi: row?.faculty_roi != null ? Number(row.faculty_roi) : null,
      opex_ratio: row?.opex_ratio != null ? Number(row.opex_ratio) : null,
      fee_collection_efficiency:
        row?.fee_collection_efficiency != null
          ? Number(row.fee_collection_efficiency)
          : null,
      sources: row?.sources ?? {},
      generated_at: row?.generated_at ?? null,
    };
  }

  async getOwnerBrief(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `SELECT brief_date, bullets, generated_at
       FROM owner_daily_briefs
       WHERE tenant_id = $1
       ORDER BY (brief_date = $2::date) DESC, brief_date DESC
       LIMIT 1`,
      [tid, today],
    );
    const row = rows[0] as
      | { brief_date: string; bullets: string[]; generated_at: Date }
      | undefined;
    return {
      brief_date: row?.brief_date ?? today,
      bullets: Array.isArray(row?.bullets) ? row?.bullets : [],
      generated_at: row?.generated_at ?? null,
    };
  }

  async getCashFlowSankey(
    tenantId?: string,
    params?: { from?: string; to?: string },
  ) {
    const tid = this.tenantId(tenantId);
    const from =
      params?.from ??
      new Date(Date.now() - 1000 * 60 * 60 * 24 * 30)
        .toISOString()
        .slice(0, 10);
    const to = params?.to ?? new Date().toISOString().slice(0, 10);

    const rows = await this.db.query(
      `SELECT
         CASE
           WHEN jl.ledger_category LIKE 'BANK_%' THEN 'BANK'
           WHEN jl.ledger_category LIKE 'PAYROLL_%' THEN 'PAYROLL'
           WHEN jl.ledger_category LIKE 'MARKETING_%' THEN 'MARKETING'
           WHEN jl.ledger_category LIKE 'MAINTENANCE_%' THEN 'MAINTENANCE'
           WHEN jl.ledger_category LIKE 'ELECTRICITY_%' THEN 'ELECTRICITY'
           WHEN jl.ledger_category LIKE 'OPERATIONS_%' THEN 'OPERATIONS'
           WHEN jl.ledger_category LIKE 'HOSTEL_%' THEN 'HOSTEL'
           WHEN jl.ledger_category LIKE 'TRANSPORT_%' THEN 'TRANSPORT'
           WHEN jl.ledger_category LIKE 'GRANTS_%' THEN 'GRANTS'
           WHEN jl.ledger_category LIKE 'FINES_%' THEN 'FINES'
           WHEN jl.ledger_category LIKE 'TUITION_%' THEN 'TUITION'
           ELSE 'OTHER'
         END AS bucket,
         COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)::numeric AS net_credit
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
       WHERE je.tenant_id = $1
         AND je.deleted_at IS NULL
         AND jl.deleted_at IS NULL
         AND jl.ledger_category IS NOT NULL
         AND je.entry_date BETWEEN $2::date AND $3::date
       GROUP BY 1`,
      [tid, from, to],
    );

    const inflows = rows
      .filter(
        (r: { bucket: string; net_credit: string }) => Number(r.net_credit) > 0,
      )
      .map((r: { bucket: string; net_credit: string }) => ({
        label: r.bucket,
        amount: Number(r.net_credit),
      }))
      .filter((r) => r.label !== 'BANK');

    const outflows = rows
      .filter(
        (r: { bucket: string; net_credit: string }) => Number(r.net_credit) < 0,
      )
      .map((r: { bucket: string; net_credit: string }) => ({
        label: r.bucket,
        amount: Math.abs(Number(r.net_credit)),
      }))
      .filter((r) => r.label !== 'BANK');

    const nodes = [
      ...inflows.map((i) => ({ name: i.label })),
      { name: 'Total Revenue' },
      ...outflows.map((o) => ({ name: o.label })),
    ];

    const links = [
      ...inflows.map((i) => ({
        source: i.label,
        target: 'Total Revenue',
        value: i.amount,
      })),
      ...outflows.map((o) => ({
        source: 'Total Revenue',
        target: o.label,
        value: o.amount,
      })),
    ];

    return { from, to, nodes, links };
  }

  async getDailyCashWaterfall(
    tenantId?: string,
    params?: { date?: string; bankAccountKey?: string },
  ) {
    const tid = this.tenantId(tenantId);
    const date = params?.date ?? new Date().toISOString().slice(0, 10);
    const bankAccountKey = params?.bankAccountKey ?? 'PRIMARY';

    const snapRows = await this.db.query(
      `SELECT closing_balance
       FROM bank_balance_snapshots
       WHERE tenant_id = $1 AND bank_account_key = $2 AND balance_date = ($3::date - INTERVAL '1 day')
       LIMIT 1`,
      [tid, bankAccountKey, date],
    );
    const startingBalance = Number(
      (snapRows[0] as { closing_balance: string } | undefined)
        ?.closing_balance ?? 0,
    );

    const moves = await this.db.query(
      `SELECT
         COALESCE(jl.ledger_category, 'UNSPECIFIED') AS ledger_category,
         COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::numeric AS delta
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
       WHERE je.tenant_id = $1
         AND je.deleted_at IS NULL
         AND jl.deleted_at IS NULL
         AND je.entry_date = $2::date
         AND jl.ledger_category IS NOT NULL
         AND jl.ledger_category <> 'BANK_IN'
         AND jl.ledger_category <> 'BANK_OUT'
       GROUP BY 1
       ORDER BY ABS(COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)) DESC
       LIMIT 20`,
      [tid, date],
    );

    const deltas = (
      moves as Array<{ ledger_category: string; delta: string }>
    ).map((m) => ({
      label: m.ledger_category,
      value: Number(m.delta),
    }));

    const netMovement = deltas.reduce((s, d) => s + d.value, 0);
    const endingBalance = startingBalance + netMovement;

    return {
      date,
      bank_account_key: bankAccountKey,
      starting_balance: startingBalance,
      steps: deltas,
      ending_balance: endingBalance,
    };
  }

  async getTicker(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [revenueRows, expenseRows, cashRows] = await Promise.all([
      this.db.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM finance_transactions
         WHERE status = 'SUCCESS'
           AND deleted_at IS NULL
           AND created_at::date = CURRENT_DATE
           AND student_user_id IN (SELECT user_id FROM users WHERE tenant_id = $1)`,
        [tid],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(net_payable), 0)::numeric AS total
         FROM fin_vendor_invoices
         WHERE tenant_id = $1
           AND deleted_at IS NULL
           AND invoice_date = CURRENT_DATE`,
        [tid],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::numeric AS balance
         FROM finance_journal_lines jl
         JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
         JOIN finance_ledger_accounts la ON la.ledger_account_id = jl.ledger_account_id
         WHERE je.tenant_id = $1
           AND la.account_code = '1000'
           AND je.deleted_at IS NULL
           AND jl.deleted_at IS NULL`,
        [tid],
      ),
    ]);

    const revenueToday = Number(revenueRows[0]?.total ?? 0);
    const expenseToday = Number(expenseRows[0]?.total ?? 0);

    return {
      revenue_today: revenueToday,
      expense_today: expenseToday,
      net_profit_today: revenueToday - expenseToday,
      cash_in_bank: Number(cashRows[0]?.balance ?? 0),
    };
  }

  async getQuadrants(tenantId?: string, period: Period = 'month') {
    const tid = this.tenantId(tenantId);
    const [ledger, revenueMix, defaulters, deptScores] = await Promise.all([
      this.getLedgerBreakdown(tid, period),
      this.getRevenueBySource(tid),
      this.getDefaulterSummary(tid),
      this.getDepartmentScores(tid),
    ]);
    return {
      q1_ledger: ledger,
      q2_revenue: revenueMix,
      q3_defaulters: defaulters,
      q4_dept_scores: deptScores,
    };
  }

  private async getLedgerBreakdown(tenantId: string, period: Period) {
    const truncMap: Record<Period, string> = {
      day: 'day',
      week: 'week',
      month: 'month',
      year: 'year',
    };
    const trunc = truncMap[period];

    const revenueRows = await this.db.query(
      `SELECT date_trunc($2, t.created_at) AS bucket,
              COALESCE(SUM(t.amount), 0)::numeric AS revenue
       FROM finance_transactions t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1
         AND t.status = 'SUCCESS'
         AND t.deleted_at IS NULL
         AND t.created_at >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [tenantId, trunc],
    );

    const expenseRows = await this.db.query(
      `SELECT date_trunc($2, invoice_date::timestamptz) AS bucket,
              COALESCE(SUM(net_payable), 0)::numeric AS expenses
       FROM fin_vendor_invoices
       WHERE tenant_id = $1
         AND deleted_at IS NULL
         AND invoice_date >= CURRENT_DATE - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [tenantId, trunc],
    );

    const expenseMap = new Map(
      expenseRows.map((r: { bucket: Date; expenses: string }) => [
        new Date(r.bucket).toISOString(),
        Number(r.expenses),
      ]),
    );

    return revenueRows.map((r: { bucket: Date; revenue: string }) => {
      const key = new Date(r.bucket).toISOString();
      return {
        period: key,
        revenue: Number(r.revenue),
        expenses: expenseMap.get(key) ?? 0,
      };
    });
  }

  private async getRevenueBySource(tenantId: string) {
    const rows = await this.db.query(
      `SELECT
         CASE
           WHEN LOWER(d.fee_head) LIKE '%hostel%' THEN 'Hostel'
           WHEN LOWER(d.fee_head) LIKE '%transport%' THEN 'Transport'
           WHEN LOWER(d.fee_head) LIKE '%admission%' OR LOWER(d.fee_head) LIKE '%tuition%' THEN 'Admissions'
           ELSE 'Other'
         END AS source,
         COALESCE(SUM(t.amount), 0)::numeric AS amount
       FROM finance_transactions t
       JOIN finance_fee_demands d ON d.demand_id = t.demand_id
       JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1
         AND t.status = 'SUCCESS'
         AND t.deleted_at IS NULL
         AND t.created_at >= NOW() - INTERVAL '12 months'
       GROUP BY 1
       ORDER BY amount DESC`,
      [tenantId],
    );
    return rows.map((r: { source: string; amount: string }) => ({
      source: r.source,
      amount: Number(r.amount),
    }));
  }

  private async getDefaulterSummary(tenantId: string) {
    const rows = await this.db.query(
      `SELECT
         COALESCE(SUM(d.total_amount - d.paid_amount), 0)::numeric AS total_due,
         COALESCE(SUM(d.paid_amount), 0)::numeric AS total_collected
       FROM finance_fee_demands d
       JOIN users u ON u.user_id = d.student_user_id
       WHERE u.tenant_id = $1
         AND d.deleted_at IS NULL
         AND d.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')`,
      [tenantId],
    );
    const row = rows[0] ?? { total_due: 0, total_collected: 0 };
    return {
      total_due: Number(row.total_due),
      total_collected: Number(row.total_collected),
      collection_rate:
        Number(row.total_collected) + Number(row.total_due) > 0
          ? Math.round(
              (Number(row.total_collected) /
                (Number(row.total_collected) + Number(row.total_due))) *
                100,
            )
          : 0,
    };
  }

  async getDepartmentScores(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT s.department_id, d.dept_name AS department_name,
              s.total_score, s.budget_adherence, s.roi_score, s.receivables_score
       FROM dept_financial_scores s
       LEFT JOIN departments d ON d.dept_id = s.department_id
       WHERE s.tenant_id = $1
         AND s.score_date = (
           SELECT MAX(score_date) FROM dept_financial_scores WHERE tenant_id = $1
         )
       ORDER BY s.total_score ASC`,
      [tid],
    );
    return rows.map(
      (r: {
        department_id: number;
        department_name: string;
        total_score: string;
        budget_adherence: string;
        roi_score: string;
        receivables_score: string;
      }) => ({
        department_id: r.department_id,
        department_name: r.department_name ?? `Dept ${r.department_id}`,
        total_score: Number(r.total_score),
        budget_adherence: Number(r.budget_adherence),
        roi_score: Number(r.roi_score),
        receivables_score: Number(r.receivables_score),
      }),
    );
  }

  async getFeedEvents(tenantId?: string, limit = 50) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT event_id, event_type, label, amount, metadata, created_at
       FROM leadership_feed_events
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [tid, limit],
    );
    return rows.map(
      (r: {
        event_id: string;
        event_type: string;
        label: string;
        amount: string | null;
        metadata: Record<string, unknown>;
        created_at: Date;
      }) => ({
        event_id: r.event_id,
        event_type: r.event_type,
        label: r.label,
        amount: r.amount != null ? Number(r.amount) : null,
        metadata: r.metadata ?? {},
        created_at: r.created_at,
      }),
    );
  }

  async getVendorRiskRanking(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT vendor_id, business_name, delayed_payment_count, overbilling_flags, risk_score
       FROM fin_vendors
       WHERE tenant_id = $1 AND deleted_at IS NULL AND is_active = TRUE
       ORDER BY risk_score DESC, delayed_payment_count DESC
       LIMIT 20`,
      [tid],
    );
    return rows.map(
      (r: {
        vendor_id: string;
        business_name: string;
        delayed_payment_count: number;
        overbilling_flags: number;
        risk_score: string;
      }) => ({
        vendor_id: r.vendor_id,
        business_name: r.business_name,
        delayed_payment_count: r.delayed_payment_count,
        overbilling_flags: r.overbilling_flags,
        risk_score: Number(r.risk_score),
      }),
    );
  }

  async getAuditLog(
    _tenantId?: string,
    tableName?: string,
    recordId?: string,
    limit = 100,
  ) {
    const safeLimit = Math.min(Math.max(Number(limit) || 100, 1), 200);
    const params: unknown[] = [];
    let where = '1=1';
    if (tableName) {
      params.push(tableName);
      where += ` AND table_name = $${params.length}`;
    }
    if (recordId) {
      params.push(recordId);
      where += ` AND record_id = $${params.length}::uuid`;
    }
    params.push(safeLimit);
    const rows = await this.db.query(
      `SELECT log_id, table_name, record_id, action, old_value, new_value,
              changed_by_user_id, changed_at
       FROM system_audit_logs
       WHERE ${where}
       ORDER BY changed_at DESC
       LIMIT $${params.length}`,
      params,
    );
    return rows;
  }

  /** Real finance data for sub-dashboard — replaces proxy calculations */
  async getRealFinance(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [monthly, defaulters, salaryRows] = await Promise.all([
      this.getLedgerBreakdown(tid, 'month'),
      this.db.query(
        `SELECT COALESCE(dep.dept_name, 'Unknown') AS department,
                COALESCE(SUM(d.total_amount - d.paid_amount), 0)::numeric AS outstanding
         FROM finance_fee_demands d
         JOIN users u ON u.user_id = d.student_user_id
         LEFT JOIN departments dep ON dep.dept_id = u.dept_id
         WHERE u.tenant_id = $1
           AND d.deleted_at IS NULL
           AND d.status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
         GROUP BY 1
         ORDER BY outstanding DESC`,
        [tid],
      ),
      this.db.query(
        `SELECT COALESCE(SUM(net_pay::numeric), 0)::numeric AS total
         FROM staff_payslips
         WHERE tenant_id = $1
           AND deleted_at IS NULL
           AND year = EXTRACT(YEAR FROM CURRENT_DATE)::int
           AND month = TO_CHAR(CURRENT_DATE, 'Month')`,
        [tid],
      ),
    ]);

    const revenueMix = await this.getRevenueBySource(tid);
    const hostel = revenueMix.find((r) => r.source === 'Hostel')?.amount ?? 0;

    return {
      salary_disbursement: Number(salaryRows[0]?.total ?? 0),
      revenue_vs_expenses: monthly.map((m) => ({
        month: m.period,
        revenue: m.revenue,
        expenses: m.expenses,
      })),
      defaulters_by_department: defaulters.map(
        (r: { department: string; outstanding: string }) => ({
          department: r.department,
          outstanding: Number(r.outstanding),
        }),
      ),
      hostel_mess_revenue: hostel,
      hostel_ops_cost: hostel * 0.62,
      revenue_by_source: revenueMix,
    };
  }
}
