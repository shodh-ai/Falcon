import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DepartmentScoreService {
  private readonly logger = new Logger(DepartmentScoreService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async computeDailyScores(tenantId?: string) {
    const tid = tenantId ?? 'a0000000-0000-4000-8000-000000000001';
    const depts = await this.db.query(
      `SELECT dept_id FROM departments WHERE deleted_at IS NULL`,
    );

    for (const dept of depts as { dept_id: number }[]) {
      const score = await this.scoreDepartment(tid, dept.dept_id);
      await this.db.query(
        `INSERT INTO dept_financial_scores
           (tenant_id, department_id, score_date, total_score, budget_adherence, roi_score, receivables_score)
         VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6)
         ON CONFLICT (tenant_id, department_id, score_date)
         DO UPDATE SET
           total_score = EXCLUDED.total_score,
           budget_adherence = EXCLUDED.budget_adherence,
           roi_score = EXCLUDED.roi_score,
           receivables_score = EXCLUDED.receivables_score`,
        [
          tid,
          dept.dept_id,
          score.total,
          score.budgetAdherence,
          score.roi,
          score.receivables,
        ],
      );
    }
    this.logger.log(`Computed dept scores for tenant ${tid}`);
  }

  private async scoreDepartment(tenantId: string, departmentId: number) {
    const budgetRows = await this.db.query(
      `SELECT allocated_amount, utilized_amount FROM fin_budgets
       WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, departmentId],
    );
    let budgetAdherence = 75;
    if (budgetRows[0]) {
      const allocated = Number(
        (budgetRows[0] as { allocated_amount: string }).allocated_amount,
      );
      const utilized = Number(
        (budgetRows[0] as { utilized_amount: string }).utilized_amount,
      );
      const utilPct = allocated > 0 ? (utilized / allocated) * 100 : 0;
      budgetAdherence = Math.max(0, 100 - Math.abs(utilPct - 85));
    }

    const revenueRows = await this.db.query(
      `SELECT COALESCE(SUM(t.amount), 0)::numeric AS revenue
       FROM finance_transactions t
       JOIN finance_fee_demands d ON d.demand_id = t.demand_id
       JOIN users u ON u.user_id = t.student_user_id
       WHERE u.tenant_id = $1 AND t.status = 'SUCCESS' AND t.deleted_at IS NULL`,
      [tenantId],
    );
    const expenseRows = await this.db.query(
      `SELECT COALESCE(SUM(net_payable), 0)::numeric AS expenses
       FROM fin_vendor_invoices
       WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL`,
      [tenantId, departmentId],
    );
    const revenue = Number(revenueRows[0]?.revenue ?? 0);
    const expenses = Number(expenseRows[0]?.expenses ?? 0);
    const roi = expenses > 0 ? Math.min(100, (revenue / expenses) * 50) : 50;

    const recvRows = await this.db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN d.status = 'OVERDUE' THEN d.total_amount - d.paid_amount ELSE 0 END), 0)::numeric AS overdue,
         COALESCE(SUM(d.total_amount - d.paid_amount), 0)::numeric AS total_due
       FROM finance_fee_demands d
       JOIN users u ON u.user_id = d.student_user_id
       WHERE u.tenant_id = $1 AND d.deleted_at IS NULL`,
      [tenantId],
    );
    const overdue = Number(recvRows[0]?.overdue ?? 0);
    const totalDue = Number(recvRows[0]?.total_due ?? 0);
    const receivables =
      totalDue > 0 ? Math.max(0, 100 - (overdue / totalDue) * 100) : 100;

    const total = budgetAdherence * 0.4 + roi * 0.4 + receivables * 0.2;
    return {
      total: Math.round(total * 100) / 100,
      budgetAdherence: Math.round(budgetAdherence * 100) / 100,
      roi: Math.round(roi * 100) / 100,
      receivables: Math.round(receivables * 100) / 100,
    };
  }

  async updateVendorRiskScores(tenantId?: string) {
    const tid = tenantId ?? 'a0000000-0000-4000-8000-000000000001';
    await this.db.query(
      `UPDATE fin_vendors v SET risk_score = LEAST(100,
         (delayed_payment_count * 15 + overbilling_flags * 25)::numeric)
       WHERE v.tenant_id = $1 AND v.deleted_at IS NULL`,
      [tid],
    );
  }
}
