import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { FinanceLedgerService } from './finance-ledger.service';

@Injectable()
export class FinanceAccountsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ledger: FinanceLedgerService,
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
          tuitionFee + developmentFee,
          dueDate,
          JSON.stringify({
            program: dto.program ?? 'B.Tech',
            tuition_fee: tuitionFee,
            development_fee: developmentFee,
          }),
          dto.template_id ?? null,
        ],
      );
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
    },
  ) {
    const vendors = await this.dataSource.query(
      `SELECT default_tds_rate FROM fin_vendors WHERE vendor_id = $1 AND tenant_id = $2`,
      [dto.vendor_id, tenantId],
    );
    if (!vendors[0]) throw new NotFoundException('Vendor not found');

    const budget = await this.checkBudget(tenantId, dto.department_id, Number(dto.taxable_amount));
    if (!budget.allowed) {
      throw new BadRequestException(budget.message ?? 'Department budget exceeded');
    }

    const tdsRate = Number((vendors[0] as { default_tds_rate: string }).default_tds_rate ?? 0);
    const gstRate = Number(dto.gst_rate ?? 18);
    const taxable = Number(dto.taxable_amount);
    const gstAmount = Number(((taxable * gstRate) / 100).toFixed(2));
    const tdsAmount = Number(((taxable * tdsRate) / 100).toFixed(2));
    const totalAmount = Number((taxable + gstAmount).toFixed(2));
    const netPayable = Number((totalAmount - tdsAmount).toFixed(2));

    const rows = await this.dataSource.query(
      `INSERT INTO fin_vendor_invoices
         (tenant_id, vendor_id, invoice_number, invoice_date, expense_head_id,
          taxable_amount, gst_amount, tds_amount, total_amount, net_payable, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'APPROVED')
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
      ],
    );
    const invoiceId = (rows[0] as { invoice_id: string }).invoice_id;

    const period = dto.invoice_date.slice(0, 7);
    await this.dataSource.query(
      `INSERT INTO finance_gst_tds_tracking
         (tenant_id, source_type, source_id, vendor_id, gst_amount, tds_amount, tax_period)
       VALUES ($1, 'VENDOR', $2, $3, $4, $5, $6)`,
      [tenantId, invoiceId, dto.vendor_id, gstAmount, tdsAmount, period],
    );

    if (dto.department_id) {
      await this.dataSource.query(
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

    await this.ledger.postExpense(tenantId, invoiceId, netPayable, gstAmount, tdsAmount);

    return {
      invoice_id: invoiceId,
      taxable_amount: taxable,
      gst_amount: gstAmount,
      tds_amount: tdsAmount,
      total_amount: totalAmount,
      net_payable: netPayable,
    };
  }

  async checkBudget(tenantId: string, departmentId: number | undefined, amount: number) {
    if (!departmentId) return { allowed: true };
    const rows = await this.dataSource.query(
      `SELECT allocated_amount, utilized_amount FROM fin_budgets
       WHERE tenant_id = $1 AND department_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, departmentId],
    );
    if (!rows[0]) return { allowed: true };
    const allocated = Number((rows[0] as { allocated_amount: string }).allocated_amount);
    const utilized = Number((rows[0] as { utilized_amount: string }).utilized_amount);
    if (utilized + amount > allocated) {
      return {
        allowed: false,
        message: `Budget cap reached (${utilized + amount} > ${allocated})`,
        utilization_percent: allocated ? Math.round((utilized / allocated) * 100) : 100,
      };
    }
    return {
      allowed: true,
      utilization_percent: allocated ? Math.round(((utilized + amount) / allocated) * 100) : 0,
    };
  }

  listBudgets(tenantId: string) {
    return this.dataSource.query(
      `SELECT b.*, d.dept_name AS department_name,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND((b.utilized_amount / b.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_percent
       FROM fin_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1
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
