import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import { FinancialFeedEmitter } from './financial-feed.emitter';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { financialAnomalyMessage } from '../../core/notifications/notification-message.catalog';

export type AnomalySeverity = 'GREEN' | 'YELLOW' | 'RED';

@Injectable()
export class AnomalyDetectionService {
  private readonly logger = new Logger(AnomalyDetectionService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly feed: FinancialFeedEmitter,
    private readonly notifyDispatch: NotificationDispatchService,
  ) {}

  duplicateHash(vendorId: string, invoiceNumber: string, amount: number): string {
    return createHash('sha256').update(`${vendorId}:${invoiceNumber}:${amount}`).digest('hex');
  }

  async checkDuplicateInvoice(tenantId: string, invoiceId: string) {
    const rows = await this.db.query(
      `SELECT invoice_id, vendor_id, invoice_number, taxable_amount, duplicate_hash
       FROM fin_vendor_invoices WHERE invoice_id = $1 AND tenant_id = $2`,
      [invoiceId, tenantId],
    );
    const inv = rows[0] as {
      invoice_id: string;
      vendor_id: string;
      invoice_number: string;
      taxable_amount: string;
      duplicate_hash: string | null;
    };
    if (!inv) return;

    const invoiceNumber = String(inv.invoice_number ?? '').trim();
    if (!invoiceNumber) return;

    const hash = this.duplicateHash(inv.vendor_id, invoiceNumber, Number(inv.taxable_amount));
    await this.db.query(`UPDATE fin_vendor_invoices SET duplicate_hash = $1 WHERE invoice_id = $2`, [
      hash,
      invoiceId,
    ]);

    const dupes = await this.db.query(
      `SELECT invoice_id FROM fin_vendor_invoices
       WHERE tenant_id = $1 AND duplicate_hash = $2 AND invoice_id != $3 AND deleted_at IS NULL`,
      [tenantId, hash, invoiceId],
    );
    if (dupes.length > 0) {
      await this.raiseFlag(tenantId, 'RED', 'DUPLICATE_INVOICE', {
        invoice_id: invoiceId,
        duplicate_of: (dupes[0] as { invoice_id: string }).invoice_id,
        message: 'Exact duplicate vendor invoice detected',
      });
    }
  }

  async checkUnusualSpending(tenantId: string, invoiceId: string) {
    const rows = await this.db.query(
      `SELECT i.taxable_amount, i.expense_head_id, h.head_name
       FROM fin_vendor_invoices i
       LEFT JOIN finance_expense_heads h ON h.expense_head_id = i.expense_head_id
       WHERE i.invoice_id = $1 AND i.tenant_id = $2`,
      [invoiceId, tenantId],
    );
    const inv = rows[0] as { taxable_amount: string; expense_head_id: string; head_name: string };
    if (!inv?.expense_head_id) return;

    const avgRows = await this.db.query(
      `SELECT COALESCE(AVG(taxable_amount), 0)::numeric AS avg_amount
       FROM fin_vendor_invoices
       WHERE tenant_id = $1
         AND expense_head_id = $2
         AND deleted_at IS NULL
         AND invoice_date >= CURRENT_DATE - INTERVAL '6 months'
         AND invoice_id != $3`,
      [tenantId, inv.expense_head_id, invoiceId],
    );
    const avg = Number(avgRows[0]?.avg_amount ?? 0);
    const amount = Number(inv.taxable_amount);
    if (avg > 0 && amount > avg * 1.3) {
      const pct = Math.round(((amount - avg) / avg) * 100);
      const isSpike = amount > avg * 5;
      const severity: AnomalySeverity = isSpike ? 'RED' : 'YELLOW';

      await this.raiseFlag(tenantId, severity, 'UNUSUAL_SPENDING', {
        invoice_id: invoiceId,
        expense_head: inv.head_name,
        amount,
        six_month_avg: avg,
        pct_above_avg: pct,
        message: `${inv.head_name} bill is ${pct}% above 6-month average`,
      });

      if (isSpike) {
        await this.db.query(
          `UPDATE fin_vendor_invoices
           SET status = 'PENDING_BOARD_APPROVAL'
           WHERE tenant_id = $1 AND invoice_id = $2 AND status = 'APPROVED'`,
          [tenantId, invoiceId],
        );
      }
    }
  }

  async checkBudgetThresholds(tenantId: string, departmentId: number) {
    const rows = await this.db.query(
      `SELECT allocated_amount, utilized_amount FROM fin_budgets
       WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, departmentId],
    );
    if (!rows[0]) return;
    const allocated = Number((rows[0] as { allocated_amount: string }).allocated_amount);
    const utilized = Number((rows[0] as { utilized_amount: string }).utilized_amount);
    if (allocated <= 0) return;

    const pct = utilized / allocated;
    if (pct > 1.0) {
      await this.raiseFlag(tenantId, 'RED', 'BUDGET_EXCEEDED', {
        department_id: departmentId,
        utilization_pct: Math.round(pct * 100),
        over_by: utilized - allocated,
      });
    } else if (pct > 0.8) {
      await this.raiseFlag(tenantId, 'YELLOW', 'BUDGET_WARNING', {
        department_id: departmentId,
        utilization_pct: Math.round(pct * 100),
      });
    }
  }

  async checkApprovalBypass(tenantId: string, invoiceId: string, amount: number) {
    if (amount <= 2500000) return;
    const rows = await this.db.query(
      `SELECT invoice_id FROM fin_vendor_invoices
       WHERE invoice_id = $1 AND tenant_id = $2 AND status = 'APPROVED'`,
      [invoiceId, tenantId],
    );
    if (rows.length > 0) {
      await this.raiseFlag(tenantId, 'RED', 'APPROVAL_BYPASS', {
        invoice_id: invoiceId,
        amount,
        message: `Payment of ₹${(amount / 100000).toFixed(2)}L made without standard 2-tier approval`,
      });
    }
  }

  async processInvoice(tenantId: string, invoiceId: string) {
    await this.checkDuplicateInvoice(tenantId, invoiceId);
    await this.checkUnusualSpending(tenantId, invoiceId);
    const inv = await this.db.query(
      `SELECT net_payable, department_id FROM fin_vendor_invoices WHERE invoice_id = $1`,
      [invoiceId],
    );
    const row = inv[0] as { net_payable: string; department_id: number | null };
    if (row?.department_id) {
      await this.checkBudgetThresholds(tenantId, row.department_id);
    }
    await this.checkApprovalBypass(tenantId, invoiceId, Number(row?.net_payable ?? 0));
  }

  private async raiseFlag(
    tenantId: string,
    severity: AnomalySeverity,
    ruleCode: string,
    details: Record<string, unknown>,
  ) {
    await this.db.query(
      `INSERT INTO fin_anomaly_flags (tenant_id, severity, rule_code, details)
       VALUES ($1, $2, $3, $4::jsonb)`,
      [tenantId, severity, ruleCode, JSON.stringify(details)],
    );

    const message = String(details.message ?? `${ruleCode} triggered`);
    await this.feed.emit({
      tenantId,
      eventType: 'ALERT',
      label: message,
      amount: typeof details.amount === 'number' ? details.amount : null,
      metadata: { severity, rule_code: ruleCode, ...details },
    });

    const chairmanRows = await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Chairman', 'President')
       LIMIT 5`,
      [tenantId],
    );
    for (const row of chairmanRows as { user_id: string }[]) {
      const msg = financialAnomalyMessage({
        message,
        severity: severity === 'RED' ? 'RED' : 'AMBER',
        ruleCode,
      });
      await this.notifyDispatch.dispatch({
        tenantId,
        userId: row.user_id,
        ...msg,
        queueDelivery: false,
      });
    }
    this.logger.warn(`Anomaly ${ruleCode} (${severity}) for tenant ${tenantId}`);
  }
}
