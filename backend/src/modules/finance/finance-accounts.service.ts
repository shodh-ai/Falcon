import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { LEADERSHIP_ANOMALY_QUEUE, LeadershipAnomalyJob } from '../../common/constants/leadership-queue.constants';
import { FinanceLedgerService } from './finance-ledger.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { BudgetFpaService } from '../leadership/budget-fpa.service';
import { FinanceApprovalsService } from './finance-approvals.service';

@Injectable()
export class FinanceAccountsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: FinanceLedgerService,
    private readonly approvals: FinanceApprovalsService,
    private readonly notify: NotificationEmitterService,
    private readonly events: EventEmitter2,
    private readonly budgetFpa: BudgetFpaService,
    @InjectQueue(LEADERSHIP_ANOMALY_QUEUE) private readonly anomalyQueue: Queue<LeadershipAnomalyJob>,
  ) {}

  listTemplates(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM finance_fee_templates WHERE tenant_id = $1 ORDER BY template_name`,
      [tenantId],
    );
  }

  createTemplate(
    tenantId: string,
    dto: {
      template_name: string;
      program_code?: string;
      batch_year?: number;
      academic_year: string;
      semester?: number;
      fee_breakup?: Record<string, unknown>;
      total_amount: number;
    },
  ) {
    return this.dataSource.query(
      `INSERT INTO finance_fee_templates
         (tenant_id, template_name, program_code, batch_year, academic_year, semester, fee_breakup, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        tenantId,
        dto.template_name,
        dto.program_code ?? null,
        dto.batch_year ?? null,
        dto.academic_year,
        dto.semester ?? null,
        JSON.stringify(dto.fee_breakup ?? {}),
        dto.total_amount,
      ],
    );
  }

  async createBulkJob(tenantId: string, payload: Record<string, unknown>) {
    const rows = await this.dataSource.query(
      `INSERT INTO finance_bulk_jobs (tenant_id, template_id, payload, status)
       VALUES ($1, $2, $3::jsonb, 'QUEUED')
       RETURNING job_id`,
      [tenantId, payload.template_id ?? null, JSON.stringify(payload)],
    );
    return { job_id: (rows[0] as { job_id: string }).job_id };
  }

  getBulkJob(jobId: string) {
    return this.dataSource.query(`SELECT * FROM finance_bulk_jobs WHERE job_id = $1`, [jobId]);
  }

  async runBulkDemandGeneration(
    tenantId: string,
    jobId: string,
    dto: {
      template_id?: string;
      program?: string;
      semester?: number;
      academic_year?: string;
      due_date?: string;
      tuition_fee?: number;
      development_fee?: number;
      batch_year?: number;
    },
  ) {
    let tuitionFee = Number(dto.tuition_fee ?? 85000);
    let developmentFee = Number(dto.development_fee ?? 15000);
    let academicYear = dto.academic_year ?? '2026-27';
    let semester = Number(dto.semester ?? 3);
    let dueDate =
      dto.due_date ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);

    if (dto.template_id) {
      const tpl = await this.dataSource.query(
        `SELECT * FROM finance_fee_templates WHERE template_id = $1 AND tenant_id = $2`,
        [dto.template_id, tenantId],
      );
      const t = tpl[0] as {
        total_amount: string;
        academic_year: string;
        semester: number;
        fee_breakup: Record<string, unknown>;
      };
      if (t) {
        tuitionFee = Number(t.fee_breakup?.tuition_fee ?? t.total_amount);
        developmentFee = Number(t.fee_breakup?.development_fee ?? 0);
        academicYear = t.academic_year;
        semester = t.semester ?? semester;
      }
    }

    const students = await this.dataSource.query(
      `SELECT u.user_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE r.role_name = 'Student' AND u.tenant_id = $1
       ORDER BY u.name ASC`,
      [tenantId],
    );

    let generated = 0;
    for (const student of students as Array<{ user_id: string }>) {
      const existing = await this.dataSource.query(
        `SELECT demand_id FROM finance_fee_demands
         WHERE student_user_id = $1 AND fee_head = 'SEMESTER_FEE'
           AND academic_year = $2 AND semester = $3`,
        [student.user_id, academicYear, semester],
      );
      if (existing.length) continue;

      const amount = tuitionFee + developmentFee;
      await this.dataSource.query(
        `INSERT INTO finance_fee_demands
           (tenant_id, student_user_id, fee_head, academic_year, semester, total_amount, paid_amount,
            due_date, status, fee_breakup, template_id)
         VALUES ($1, $2, 'SEMESTER_FEE', $3, $4, $5, 0, $6, 'PENDING', $7::jsonb, $8)`,
        [
          tenantId,
          student.user_id,
          academicYear,
          semester,
          amount,
          dueDate,
          JSON.stringify({
            program: dto.program ?? 'B.Tech',
            tuition_fee: tuitionFee,
            development_fee: developmentFee,
          }),
          dto.template_id ?? null,
        ],
      );
      this.notify.feeGenerated({
        tenantId,
        userId: student.user_id,
        amount,
        dueDate: String(dueDate),
        feeHead: 'SEMESTER_FEE',
      });
      generated += 1;
    }

    await this.dataSource.query(
      `UPDATE finance_bulk_jobs SET status = 'COMPLETED', generated_count = $2, completed_at = NOW()
       WHERE job_id = $1`,
      [jobId, generated],
    );
    return { generated };
  }

  listCollections(tenantId: string, q?: string) {
    const search = q?.trim() ? `%${q.trim()}%` : null;
    return this.dataSource.query(
      `SELECT t.transaction_id, t.gateway_order_id, t.gateway_payment_id, t.amount, t.status,
              t.payment_mode, t.receipt_url, t.created_at, t.student_user_id,
              u.name AS student_name, sp.enrollment_no
       FROM finance_transactions t
       LEFT JOIN users u ON u.user_id = t.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = t.student_user_id
       WHERE (t.tenant_id = $1 OR t.tenant_id IS NULL)
         AND ($2::text IS NULL OR t.gateway_payment_id ILIKE $2 OR t.gateway_order_id ILIKE $2
              OR sp.enrollment_no ILIKE $2 OR u.name ILIKE $2)
       ORDER BY t.created_at DESC
       LIMIT 200`,
      [tenantId, search],
    );
  }

  listVendors(tenantId: string) {
    return this.dataSource.query(
      `SELECT * FROM fin_vendors WHERE tenant_id = $1 ORDER BY business_name`,
      [tenantId],
    );
  }

  createVendor(tenantId: string, dto: Record<string, unknown>) {
    return this.dataSource.query(
      `INSERT INTO fin_vendors
         (tenant_id, business_name, contact_email, gstin, pan_number, default_tds_rate, bank_account_no, ifsc_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        dto.business_name,
        dto.contact_email ?? null,
        dto.gstin ?? null,
        dto.pan_number ?? null,
        dto.default_tds_rate ?? 0,
        dto.bank_account_no ?? null,
        dto.ifsc_code ?? null,
      ],
    );
  }

  listExpenseHeads(tenantId: string) {
    return this.dataSource.query(
      `SELECT expense_head_id, head_code, head_name FROM finance_expense_heads
       WHERE tenant_id = $1 AND is_active = true ORDER BY head_code`,
      [tenantId],
    );
  }

  listExpenses(tenantId: string) {
    return this.dataSource.query(
      `SELECT i.*, v.business_name AS vendor_name, h.head_name
       FROM fin_vendor_invoices i
       JOIN fin_vendors v ON v.vendor_id = i.vendor_id
       LEFT JOIN finance_expense_heads h ON h.expense_head_id = i.expense_head_id
       WHERE i.tenant_id = $1
       ORDER BY i.invoice_date DESC`,
      [tenantId],
    );
  }

  async createExpense(
    tenantId: string,
    dto: {
      vendor_id: string;
      expense_head_id: string;
      invoice_number: string;
      invoice_date: string;
      taxable_amount: number;
      gst_rate?: number;
      department_id?: number;
      program_id?: string;
      dept_budget_id?: string;
      po_id?: string;
      approved_by?: string;
    },
  ) {
    return this.dataSource.transaction(async (tx) => {
      const vendors = await tx.query(
        `SELECT default_tds_rate, business_name FROM fin_vendors WHERE vendor_id = $1 AND tenant_id = $2`,
        [dto.vendor_id, tenantId],
      );
      if (!vendors[0]) throw new NotFoundException('Vendor not found');

      let deptBudgetId = dto.dept_budget_id;
      if (!deptBudgetId && dto.department_id) {
        const fyRows = await tx.query(
          `SELECT budget_id FROM fin_dept_budgets
           WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId, dto.department_id],
        );
        deptBudgetId = (fyRows[0] as { budget_id: string } | undefined)?.budget_id;
      }

      const tdsRate = Number((vendors[0] as { default_tds_rate: string }).default_tds_rate ?? 0);
      const gstRate = Number(dto.gst_rate ?? 18);
      const taxable = Number(dto.taxable_amount);
      const gstAmount = Number(((taxable * gstRate) / 100).toFixed(2));
      const tdsAmount = Number(((taxable * tdsRate) / 100).toFixed(2));
      const totalAmount = Number((taxable + gstAmount).toFixed(2));
      const netPayable = Number((totalAmount - tdsAmount).toFixed(2));

      if (!dto.po_id) {
        await this.budgetFpa.checkEncumbrance({
          tenantId,
          programId: dto.program_id,
          budgetId: deptBudgetId,
          amount: netPayable,
        });
      }

      const budget = await this.checkBudget(tenantId, dto.department_id, netPayable, deptBudgetId);
      if (!budget.allowed) {
        throw new BadRequestException(budget.message ?? 'Department budget exceeded');
      }

      const requiresBoard = netPayable >= 100000;
      const status = requiresBoard ? 'PENDING_BOARD_APPROVAL' : 'APPROVED';

      const rows = await tx.query(
        `INSERT INTO fin_vendor_invoices
           (tenant_id, vendor_id, invoice_number, invoice_date, expense_head_id,
            taxable_amount, gst_amount, tds_amount, total_amount, net_payable, status,
            department_id, program_id, dept_budget_id, po_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING invoice_id`,
        [
          tenantId,
          dto.vendor_id,
          dto.invoice_number,
          dto.invoice_date,
          dto.expense_head_id,
          taxable,
          gstAmount,
          tdsAmount,
          totalAmount,
          netPayable,
          status,
          dto.department_id ?? null,
          dto.program_id ?? null,
          deptBudgetId ?? null,
          dto.po_id ?? null,
        ],
      );
      const invoiceId = (rows[0] as { invoice_id: string }).invoice_id;

      if (requiresBoard) {
        await this.approvals.createApprovalRequest({
          tenantId,
          entityType: 'VENDOR_INVOICE',
          entityId: invoiceId,
          requestedBy: String(dto.approved_by ?? 'SYSTEM'),
          amount: netPayable,
        });
      }

      const period = dto.invoice_date.slice(0, 7);
      await tx.query(
        `INSERT INTO finance_gst_tds_tracking
           (tenant_id, source_type, source_id, vendor_id, gst_amount, tds_amount, tax_period)
         VALUES ($1, 'VENDOR', $2, $3, $4, $5, $6)`,
        [tenantId, invoiceId, dto.vendor_id, gstAmount, tdsAmount, period],
      );

      await this.budgetFpa.recordExpenseFromInvoice(tenantId, {
        program_id: dto.program_id,
        budget_id: deptBudgetId,
        po_id: dto.po_id,
        vendor_id: dto.vendor_id,
        invoice_id: invoiceId,
        expense_head_id: dto.expense_head_id,
        description: `Invoice ${dto.invoice_number} - ${(vendors[0] as { business_name: string }).business_name}`,
        amount: netPayable,
        approved_by: !requiresBoard ? dto.approved_by : undefined,
        expense_date: dto.invoice_date,
      });

      if (dto.department_id && !deptBudgetId) {
        await tx.query(
          `UPDATE fin_budgets SET utilized_amount = utilized_amount + $3
           WHERE tenant_id = $1 AND department_id = $2
             AND financial_year = (
               CASE WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4
                 THEN EXTRACT(YEAR FROM CURRENT_DATE)::text || '-' || (EXTRACT(YEAR FROM CURRENT_DATE) + 1)::text
                 ELSE (EXTRACT(YEAR FROM CURRENT_DATE) - 1)::text || '-' || EXTRACT(YEAR FROM CURRENT_DATE)::text
               END
             )`,
          [tenantId, dto.department_id, netPayable],
        );
      }

      if (!requiresBoard) {
        await this.ledger.postExpense(tenantId, invoiceId, netPayable, gstAmount, tdsAmount, tx);
      }

      const vendorName = (vendors[0] as { business_name: string }).business_name ?? 'Vendor';
      this.events.emit('leadership.expense_created', {
        tenantId,
        invoiceId,
        label: `Vendor Expense - ${vendorName}`,
        amount: netPayable,
      });

      if (dto.department_id) {
        const budgetAfter = await this.checkBudget(tenantId, dto.department_id, 0);
        if (budgetAfter.utilization_percent && budgetAfter.utilization_percent >= 80) {
          void this.anomalyQueue.add('budget_check', {
            type: 'budget_check',
            tenantId,
            departmentId: dto.department_id,
            utilizationPct: budgetAfter.utilization_percent,
          });
        }
      }

      void this.anomalyQueue.add('invoice_created', {
        type: 'invoice_created',
        tenantId,
        invoiceId,
      });

      return {
        invoice_id: invoiceId,
        taxable_amount: taxable,
        gst_amount: gstAmount,
        tds_amount: tdsAmount,
        total_amount: totalAmount,
        net_payable: netPayable,
        status,
      };
    });
  }

  async checkBudget(
    tenantId: string,
    departmentId: number | undefined,
    amount: number,
    deptBudgetId?: string,
  ) {
    if (deptBudgetId) {
      const rows = await this.dataSource.query(
        `SELECT allocated_amount, utilized_amount, encumbered_amount FROM fin_dept_budgets
         WHERE budget_id = $1 AND tenant_id = $2`,
        [deptBudgetId, tenantId],
      );
      if (!rows[0]) return { allowed: true };
      const r = rows[0] as { allocated_amount: string; utilized_amount: string; encumbered_amount: string };
      const allocated = Number(r.allocated_amount);
      const committed = Number(r.utilized_amount) + Number(r.encumbered_amount);
      if (committed + amount > allocated) {
        return {
          allowed: false,
          message: `Budget cap reached (committed ₹${committed + amount} > allocated ₹${allocated})`,
          utilization_percent: allocated ? Math.round(((committed + amount) / allocated) * 100) : 100,
        };
      }
      return {
        allowed: true,
        utilization_percent: allocated ? Math.round(((committed + amount) / allocated) * 100) : 0,
      };
    }

    if (!departmentId) return { allowed: true };
    const rows = await this.dataSource.query(
      `SELECT allocated_amount, utilized_amount, encumbered_amount FROM fin_dept_budgets
       WHERE tenant_id = $1 AND department_id = $2 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, departmentId],
    );
    if (!rows[0]) {
      const legacy = await this.dataSource.query(
        `SELECT allocated_amount, utilized_amount FROM fin_budgets
         WHERE tenant_id = $1 AND department_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [tenantId, departmentId],
      );
      if (!legacy[0]) return { allowed: true };
      const allocated = Number((legacy[0] as { allocated_amount: string }).allocated_amount);
      const utilized = Number((legacy[0] as { utilized_amount: string }).utilized_amount);
      if (utilized + amount > allocated) {
        return { allowed: false, message: `Budget cap reached`, utilization_percent: 100 };
      }
      return { allowed: true, utilization_percent: allocated ? Math.round(((utilized + amount) / allocated) * 100) : 0 };
    }
    const r = rows[0] as { allocated_amount: string; utilized_amount: string; encumbered_amount: string };
    const allocated = Number(r.allocated_amount);
    const committed = Number(r.utilized_amount) + Number(r.encumbered_amount);
    if (committed + amount > allocated) {
      return {
        allowed: false,
        message: `Budget cap reached (${committed + amount} > ${allocated})`,
        utilization_percent: allocated ? Math.round(((committed + amount) / allocated) * 100) : 100,
      };
    }
    return {
      allowed: true,
      utilization_percent: allocated ? Math.round(((committed + amount) / allocated) * 100) : 0,
    };
  }

  listBudgets(tenantId: string) {
    return this.dataSource.query(
      `SELECT b.budget_id, b.financial_year, b.department_id, b.allocated_amount,
              b.utilized_amount, b.encumbered_amount, d.dept_name AS department_name,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND(((b.utilized_amount + b.encumbered_amount) / b.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_percent
       FROM fin_dept_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
       ORDER BY d.dept_name`,
      [tenantId],
    );
  }

  upsertBudget(
    tenantId: string,
    dto: { department_id: number; financial_year: string; allocated_amount: number },
  ) {
    return this.dataSource.query(
      `INSERT INTO fin_budgets (tenant_id, department_id, financial_year, allocated_amount)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, department_id, financial_year)
       DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount
       RETURNING *`,
      [tenantId, dto.department_id, dto.financial_year, dto.allocated_amount],
    );
  }

  private parsePayrollMonth(month?: string) {
    const iso = month ?? new Date().toISOString().slice(0, 7);
    const [yearStr, monStr] = iso.split('-');
    const monthNames = [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ];
    return { year: Number(yearStr), monthLabel: monthNames[Number(monStr) - 1] ?? 'June', iso };
  }

  async salaryProcessingSummary(tenantId: string, month?: string) {
    const { year, monthLabel, iso } = this.parsePayrollMonth(month);
    const rows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS staff_count,
              COALESCE(SUM(net_pay), 0) AS total_payout
       FROM staff_payslips
       WHERE tenant_id = $1 AND year = $2 AND month = $3`,
      [tenantId, year, monthLabel],
    );
    return {
      month: iso,
      staff_count: (rows[0] as { staff_count: number })?.staff_count ?? 0,
      total_payout: Number((rows[0] as { total_payout: string })?.total_payout ?? 0),
    };
  }

  async generateBankExport(tenantId: string, month?: string) {
    const { year, monthLabel, iso } = this.parsePayrollMonth(month);
    const rows = await this.dataSource.query(
      `SELECT u.name, ep.ifsc_code, p.net_pay
       FROM staff_payslips p
       JOIN users u ON u.user_id = p.staff_user_id
       LEFT JOIN hr_employee_profiles ep ON ep.user_id = p.staff_user_id
       WHERE p.tenant_id = $1 AND p.year = $2 AND p.month = $3`,
      [tenantId, year, monthLabel],
    );
    const lines = [
      'Beneficiary Name,Account Number,IFSC,Amount,Remarks',
      ...(rows as Array<{ name: string; ifsc_code: string; net_pay: string }>).map(
        (r) =>
          `"${r.name}","","${r.ifsc_code ?? ''}",${Number(r.net_pay).toFixed(2)},"Salary ${iso}"`,
      ),
    ];
    return { format: 'NEFT_CSV', month: iso, csv: lines.join('\n'), row_count: rows.length };
  }

  exportCsv(rows: Record<string, unknown>[], filename: string) {
    if (!rows.length) return { filename, csv: '' };
    const keys = Object.keys(rows[0]);
    const header = keys.join(',');
    const body = rows
      .map((row) => keys.map((k) => JSON.stringify(row[k] ?? '')).join(','))
      .join('\n');
    return { filename, csv: `${header}\n${body}` };
  }
}
