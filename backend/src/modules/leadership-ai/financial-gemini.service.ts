import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DataSource } from 'typeorm';

const FINANCE_SCHEMA = `
Tables (tenant-scoped via tenant_id on fin_* or via users.tenant_id for fee tables):
- finance_transactions(transaction_id, amount, status, created_at, demand_id, student_user_id)
- finance_fee_demands(demand_id, fee_head, total_amount, paid_amount, status)
- fin_vendor_invoices(invoice_id, vendor_id, taxable_amount, net_payable, invoice_date, expense_head_id)
- fin_budgets(department_id, allocated_amount, utilized_amount, financial_year)
- finance_journal_entries(journal_entry_id, entry_date, narration, source_type)
- finance_expense_heads(expense_head_id, head_code, head_name)
- fin_vendors(vendor_id, business_name, risk_score)
`;

@Injectable()
export class FinancialGeminiService {
  private readonly logger = new Logger(FinancialGeminiService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  private getModel() {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({
      model: this.config.get<string>('GEMINI_MODEL') || 'gemini-2.0-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
  }

  async chat(tenantId: string, question: string): Promise<{ answer: string; sql?: string; rows?: unknown[] }> {
    const model = this.getModel();
    const prompt = `You are Falcon AI, a financial assistant for a university Chairman.
${FINANCE_SCHEMA}
Tenant ID for all queries: '${tenantId}'
User question: "${question}"

Respond with JSON: { "sql": "<SELECT only, max 500 rows, must filter by tenant>", "explanation": "<brief>" }
Rules: SELECT only. No INSERT/UPDATE/DELETE. Always scope to tenant.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();
    let parsed: { sql?: string; explanation?: string };
    try {
      parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
    } catch {
      return { answer: text };
    }

    if (!parsed.sql || !/^select/i.test(parsed.sql.trim())) {
      return { answer: parsed.explanation ?? 'I can only run read-only financial queries.' };
    }

    try {
      const rows = await this.db.query(parsed.sql);
      const summary = await model.generateContent(
        `Summarize these query results for the Chairman in 2-3 sentences:\n${JSON.stringify(rows.slice(0, 50))}`,
      );
      return {
        answer: summary.response.text(),
        sql: parsed.sql,
        rows: rows.slice(0, 50),
      };
    } catch (err) {
      return { answer: `Query failed: ${(err as Error).message}`, sql: parsed.sql };
    }
  }

  async deltaAnalysis(tenantId: string): Promise<{ narrative: string; deltas: unknown[] }> {
    const deltas = await this.db.query(
      `SELECT h.head_name,
              COALESCE(SUM(CASE WHEN i.invoice_date >= date_trunc('month', CURRENT_DATE) THEN i.net_payable ELSE 0 END), 0)::numeric AS this_month,
              COALESCE(SUM(CASE WHEN i.invoice_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                AND i.invoice_date < date_trunc('month', CURRENT_DATE) THEN i.net_payable ELSE 0 END), 0)::numeric AS last_month
       FROM finance_expense_heads h
       LEFT JOIN fin_vendor_invoices i ON i.expense_head_id = h.expense_head_id AND i.tenant_id = $1 AND i.deleted_at IS NULL
       WHERE h.tenant_id = $1
       GROUP BY h.head_name
       HAVING COALESCE(SUM(CASE WHEN i.invoice_date >= date_trunc('month', CURRENT_DATE) THEN i.net_payable ELSE 0 END), 0) > 0
       ORDER BY (COALESCE(SUM(CASE WHEN i.invoice_date >= date_trunc('month', CURRENT_DATE) THEN i.net_payable ELSE 0 END), 0) -
                 COALESCE(SUM(CASE WHEN i.invoice_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
                   AND i.invoice_date < date_trunc('month', CURRENT_DATE) THEN i.net_payable ELSE 0 END), 0)) DESC`,
      [tenantId],
    );

    const model = this.getModel();
    const result = await model.generateContent(
      `You are Falcon AI. Explain why expenses changed month-over-month for the Chairman.
Data (INR): ${JSON.stringify(deltas)}
Respond in plain text with "Main Reasons:" followed by bullet points with amounts in ₹L format.`,
    );
    return { narrative: result.response.text(), deltas };
  }

  async scenarioPlanning(
    tenantId: string,
    admissionsDropPct: number,
  ): Promise<{ narrative: string; projections: unknown[] }> {
    const history = await this.db.query(
      `SELECT date_trunc('month', t.created_at) AS month, COALESCE(SUM(t.amount), 0)::numeric AS revenue
       FROM finance_transactions t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1 AND t.status = 'SUCCESS' AND t.deleted_at IS NULL
         AND t.created_at >= NOW() - INTERVAL '12 months'
       GROUP BY 1 ORDER BY 1`,
      [tenantId],
    );

    const factor = 1 - admissionsDropPct / 100;
    const projections = (history as { month: Date; revenue: string }[]).map((h, idx) => ({
      month: h.month,
      baseline: Number(h.revenue),
      adjusted: Math.round(Number(h.revenue) * factor * (1 + idx * 0.01)),
    }));

    const model = this.getModel();
    const result = await model.generateContent(
      `Admissions drop scenario: ${admissionsDropPct}% decline.
12-month cash flow projection: ${JSON.stringify(projections)}
Summarize the 12-month cash flow trajectory for the Chairman in 3-4 sentences.`,
    );
    return { narrative: result.response.text(), projections };
  }

  async generateForecasts(tenantId: string) {
    const history = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN t.status = 'SUCCESS' THEN t.amount ELSE 0 END), 0)::numeric AS revenue,
         COALESCE((SELECT SUM(net_payable) FROM fin_vendor_invoices WHERE tenant_id = $1 AND deleted_at IS NULL
           AND invoice_date >= CURRENT_DATE - INTERVAL '12 months'), 0)::numeric AS expenses
       FROM finance_transactions t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1 AND t.created_at >= NOW() - INTERVAL '12 months'`,
      [tenantId],
    );
    const row = history[0] as { revenue: string; expenses: string };
    const monthlyNet = (Number(row.revenue) - Number(row.expenses)) / 12;

    const cashRows = await this.db.query(
      `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0)::numeric AS balance
       FROM finance_journal_lines jl
       JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
       JOIN finance_ledger_accounts la ON la.ledger_account_id = jl.ledger_account_id
       WHERE je.tenant_id = $1 AND la.account_code = '1000'`,
      [tenantId],
    );
    const currentCash = Number(cashRows[0]?.balance ?? 0);

    for (const horizon of [30, 90, 180]) {
      const projected = currentCash + monthlyNet * (horizon / 30);
      await this.db.query(
        `INSERT INTO cash_flow_forecasts (tenant_id, horizon_days, forecast_date, projected_balance, assumptions)
         VALUES ($1, $2, CURRENT_DATE, $3, $4::jsonb)
         ON CONFLICT (tenant_id, horizon_days, forecast_date)
         DO UPDATE SET projected_balance = EXCLUDED.projected_balance, assumptions = EXCLUDED.assumptions`,
        [
          tenantId,
          horizon,
          projected,
          JSON.stringify({ monthly_net: monthlyNet, current_cash: currentCash }),
        ],
      );
    }
    this.logger.log(`Forecasts updated for tenant ${tenantId}`);
  }
}
