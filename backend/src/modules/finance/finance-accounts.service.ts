import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  LEADERSHIP_ANOMALY_QUEUE,
  LeadershipAnomalyJob,
} from '../../common/constants/leadership-queue.constants';
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
    @InjectQueue(LEADERSHIP_ANOMALY_QUEUE)
    private readonly anomalyQueue: Queue<LeadershipAnomalyJob>,
  ) {}

  async getDemoBook(tenantId: string, userId: string) {
    const books = (await this.dataSource.query(
      `SELECT b.book_id,b.code,b.title,b.created_at
       FROM finance_demo_books b
       JOIN users u ON u.user_id=b.owner_user_id AND u.tenant_id=b.tenant_id
       JOIN tenants t ON t.tenant_id=b.tenant_id
       WHERE b.tenant_id=$1 AND b.owner_user_id=$2 AND b.is_demo=true
         AND t.subdomain='sgvu'
         AND lower(u.official_email)='finance@mygyanvihar.com' AND u.is_active=true
       ORDER BY b.created_at DESC LIMIT 1`,
      [tenantId, userId],
    )) as unknown as Array<{
      book_id: string;
      code: string;
      title: string;
      created_at: string;
    }>;
    if (!books.length) throw new NotFoundException('Demo book not available');
    const book = books[0];
    const records = (await this.dataSource.query(
      `SELECT record_id,record_type,reference,description,amount::text AS amount,
              status,occurred_on::text AS occurred_on,details
       FROM finance_demo_records WHERE book_id=$1
       ORDER BY occurred_on DESC,reference`,
      [book.book_id],
    )) as unknown as Array<{
      record_id: string;
      record_type: 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL';
      reference: string;
      description: string;
      amount: string;
      status: string;
      occurred_on: string;
      details: Record<string, unknown>;
    }>;
    return {
      ...book,
      demo_only: true,
      disclaimer:
        'SIMULATED DATA — not posted to the general ledger, not a payable, and not a settled payment.',
      records,
    };
  }

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
    const name = dto.template_name?.trim();
    const academicYear = dto.academic_year?.trim();
    const amount = Number(dto.total_amount);
    if (!name || name.length > 180)
      throw new BadRequestException('Template name is required (maximum 180 characters)');
    if (!academicYear || !/^\d{4}-\d{2}$/.test(academicYear))
      throw new BadRequestException('Academic year must use YYYY-YY format');
    if (!Number.isFinite(amount) || amount <= 0)
      throw new BadRequestException('Total fee must be greater than zero');
    if (dto.semester != null && (!Number.isInteger(dto.semester) || dto.semester < 1 || dto.semester > 12))
      throw new BadRequestException('Semester must be between 1 and 12');
    return this.dataSource.query(
      `INSERT INTO finance_fee_templates
         (tenant_id, template_name, program_code, batch_year, academic_year, semester, fee_breakup, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
       RETURNING *`,
      [
        tenantId,
        name,
        dto.program_code ?? null,
        dto.batch_year ?? null,
        academicYear,
        dto.semester ?? null,
        JSON.stringify(dto.fee_breakup ?? {}),
        amount,
      ],
    );
  }

  async createBulkJob(tenantId: string, payload: Record<string, unknown>) {
    if (typeof payload.template_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(payload.template_id))
      throw new BadRequestException('Select a fee template before generating demands');
    const template = await this.dataSource.query(
      `SELECT template_id FROM finance_fee_templates WHERE tenant_id=$1 AND template_id=$2 AND is_active=true`,
      [tenantId, payload.template_id],
    );
    if (!template[0]) throw new NotFoundException('Fee template not found for this institution');
    const rows = await this.dataSource.query(
      `INSERT INTO finance_bulk_jobs (tenant_id, template_id, payload, status)
       VALUES ($1, $2, $3::jsonb, 'QUEUED')
       RETURNING job_id`,
      [tenantId, payload.template_id ?? null, JSON.stringify(payload)],
    );
    return { job_id: (rows[0] as { job_id: string }).job_id };
  }

  async getBulkJob(tenantId: string, jobId: string) {
    const rows = await this.dataSource.query(
      `SELECT job_id, template_id, status, generated_count, error_message, created_at, completed_at
       FROM finance_bulk_jobs WHERE tenant_id = $1 AND job_id = $2`,
      [tenantId, jobId],
    );
    if (!rows[0]) throw new NotFoundException('Demand generation job not found');
    return rows[0];
  }

  async markBulkJobFailed(tenantId: string, jobId: string, error: unknown) {
    await this.dataSource.query(
      `UPDATE finance_bulk_jobs SET status='FAILED', error_message=$3, completed_at=NOW()
       WHERE tenant_id=$1 AND job_id=$2`,
      [tenantId, jobId, error instanceof Error ? error.message.slice(0, 500) : 'Demand generation failed'],
    );
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
    await this.dataSource.query(
      `UPDATE finance_bulk_jobs SET status='IN_PROGRESS', error_message=NULL WHERE tenant_id=$1 AND job_id=$2`,
      [tenantId, jobId],
    );
    let tuitionFee = Number(dto.tuition_fee ?? 85000);
    let developmentFee = Number(dto.development_fee ?? 15000);
    let academicYear = dto.academic_year ?? '2026-27';
    let semester = Number(dto.semester ?? 3);
    let templateAmount: number | null = null;
    let templateBreakup: Record<string, unknown> | null = null;
    const dueDate =
      dto.due_date ??
      new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
        .toISOString()
        .slice(0, 10);

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
        templateAmount = Number(t.total_amount);
        templateBreakup = t.fee_breakup ?? {};
        academicYear = t.academic_year;
        semester = t.semester ?? semester;
      }
    }

    const students = await this.dataSource.query(
      `SELECT u.user_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE r.role_name = 'Student' AND u.tenant_id = $1
         AND sp.current_semester = $2 AND sp.status = 'ACTIVE'
       ORDER BY u.name ASC`,
      [tenantId, semester],
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

      const amount = templateAmount ?? tuitionFee + developmentFee;
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
          JSON.stringify(templateBreakup ?? {
            program: dto.program ?? null,
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
       WHERE (t.tenant_id = $1 OR (t.tenant_id IS NULL AND u.tenant_id = $1))
         AND ($2::text IS NULL OR t.gateway_payment_id ILIKE $2 OR t.gateway_order_id ILIKE $2
              OR sp.enrollment_no ILIKE $2 OR u.name ILIKE $2)
       ORDER BY t.created_at DESC
       LIMIT 200`,
      [tenantId, search],
    );
  }

  listVendors(tenantId: string) {
    return this.dataSource.query(
      `SELECT vendor_id, business_name, contact_email, gstin, pan_number,
              default_tds_rate, bank_account_no, ifsc_code, is_active
       FROM fin_vendors
       WHERE tenant_id = $1 AND COALESCE(is_active, true) = true
       ORDER BY business_name`,
      [tenantId],
    );
  }

  createVendor(tenantId: string, dto: Record<string, unknown>) {
    const vendor = this.validatedVendor(dto);
    return this.dataSource.query(
      `INSERT INTO fin_vendors
         (tenant_id, business_name, contact_email, gstin, pan_number, default_tds_rate, bank_account_no, ifsc_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tenantId,
        vendor.business_name,
        vendor.contact_email,
        vendor.gstin,
        vendor.pan_number,
        vendor.default_tds_rate,
        vendor.bank_account_no,
        vendor.ifsc_code,
      ],
    );
  }

  updateVendor(tenantId: string, vendorId: string, dto: Record<string, unknown>) {
    if (!/^[0-9a-f-]{36}$/i.test(vendorId)) throw new BadRequestException('Valid vendor ID is required');
    const vendor = this.validatedVendor(dto);
    return this.dataSource.query(
      `UPDATE fin_vendors SET business_name = $3, contact_email = $4, gstin = $5,
         pan_number = $6, default_tds_rate = $7, bank_account_no = $8, ifsc_code = $9
       WHERE tenant_id = $1 AND vendor_id = $2 AND is_active = true RETURNING *`,
      [tenantId, vendorId, vendor.business_name, vendor.contact_email, vendor.gstin,
        vendor.pan_number, vendor.default_tds_rate, vendor.bank_account_no, vendor.ifsc_code],
    ).then((result: unknown) => {
      const rows = Array.isArray(result) && Array.isArray(result[0]) ? result[0] : result as Array<Record<string, unknown>>;
      if (!rows.length) throw new NotFoundException('Vendor not found in this institution');
      return rows[0];
    });
  }

  private validatedVendor(dto: Record<string, unknown>) {
    const business_name = String(dto.business_name ?? '').trim();
    const gstin = String(dto.gstin ?? '').trim().toUpperCase() || null;
    const pan_number = String(dto.pan_number ?? '').trim().toUpperCase() || null;
    const ifsc_code = String(dto.ifsc_code ?? '').trim().toUpperCase() || null;
    const bank_account_no = String(dto.bank_account_no ?? '').trim() || null;
    const contact_email = String(dto.contact_email ?? '').trim() || null;
    const default_tds_rate = Number(dto.default_tds_rate ?? 0);
    if (!business_name) throw new BadRequestException('Business name is required');
    if (gstin && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin))
      throw new BadRequestException('GSTIN must be a valid 15-character identifier');
    if (pan_number && !/^[A-Z]{5}\d{4}[A-Z]$/.test(pan_number))
      throw new BadRequestException('PAN must be a valid 10-character identifier');
    if (ifsc_code && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc_code))
      throw new BadRequestException('IFSC must be a valid 11-character code');
    if (bank_account_no && !/^\d{6,34}$/.test(bank_account_no))
      throw new BadRequestException('Bank account number must contain 6 to 34 digits');
    if (contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact_email))
      throw new BadRequestException('Contact email is invalid');
    if (!Number.isFinite(default_tds_rate) || default_tds_rate < 0 || default_tds_rate > 100)
      throw new BadRequestException('TDS rate must be between 0 and 100 percent');
    return { business_name, gstin, pan_number, ifsc_code, bank_account_no, contact_email, default_tds_rate };
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
    const result = await this.dataSource.transaction(async (tx) => {
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
        deptBudgetId = (fyRows[0] as { budget_id: string } | undefined)
          ?.budget_id;
      }

      const tdsRate = Number(
        (vendors[0] as { default_tds_rate: string }).default_tds_rate ?? 0,
      );
      const gstRate = Number(dto.gst_rate ?? 18);
      const taxable = Number(dto.taxable_amount);
      const gstAmount = Number(((taxable * gstRate) / 100).toFixed(2));
      const tdsAmount = Number(((taxable * tdsRate) / 100).toFixed(2));
      const totalAmount = Number((taxable + gstAmount).toFixed(2));
      const netPayable = Number((totalAmount - tdsAmount).toFixed(2));

      if (dto.po_id) {
        const poRows = await tx.query(
          `SELECT source_system, proc_order_id FROM fin_purchase_orders
           WHERE po_id=$1 AND tenant_id=$2`,
          [dto.po_id, tenantId],
        );
        if (poRows[0]?.source_system === 'MODULE2') {
          throw new BadRequestException({
            message: 'Enter invoices through Progressive Procurement',
            code: 'MODULE2_CANONICAL_RECORD',
            proc_order_id: poRows[0].proc_order_id,
          });
        }
      }

      if (!dto.po_id) {
        await this.budgetFpa.checkEncumbrance({
          tenantId,
          programId: dto.program_id,
          budgetId: deptBudgetId,
          amount: netPayable,
        });
        const budget = await this.checkBudget(
          tenantId,
          dto.department_id,
          netPayable,
          deptBudgetId,
        );
        if (!budget.allowed) {
          throw new BadRequestException(
            budget.message ?? 'Department budget exceeded',
          );
        }
      }

      const requiresBoard = !dto.po_id && netPayable >= 100000;
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

      let approvalId: string | null = null;
      if (requiresBoard) {
        approvalId = await this.approvals.createApprovalRequest({
          tenantId,
          entityType: 'VENDOR_INVOICE',
          entityId: invoiceId,
          requestedBy: String(dto.approved_by ?? 'SYSTEM'),
          amount: netPayable,
        }, tx);
      }

      const period = dto.invoice_date.slice(0, 7);
      await tx.query(
        `INSERT INTO finance_gst_tds_tracking
           (tenant_id, source_type, source_id, vendor_id, gst_amount, tds_amount, tax_period)
         VALUES ($1, 'VENDOR', $2, $3, $4, $5, $6)`,
        [tenantId, invoiceId, dto.vendor_id, gstAmount, tdsAmount, period],
      );

      // Record expense inline (inside tx) to avoid cross-connection FK issues
      const expenseApprovedBy = !requiresBoard
        ? (dto.approved_by ?? null)
        : null;
      const expenseApprovedAt = expenseApprovedBy
        ? new Date().toISOString()
        : null;
      if (deptBudgetId) {
        await tx.query(
          `UPDATE fin_dept_budgets SET utilized_amount = utilized_amount + $2 WHERE budget_id = $1`,
          [deptBudgetId, netPayable],
        );
      }
      await tx.query(
        `INSERT INTO fin_expenses
           (tenant_id, program_id, budget_id, po_id, vendor_id, invoice_id, expense_head_id,
            description, amount, expense_date, approved_by, approved_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          tenantId,
          dto.program_id ?? null,
          deptBudgetId ?? null,
          dto.po_id ?? null,
          dto.vendor_id,
          invoiceId,
          dto.expense_head_id,
          `Invoice ${dto.invoice_number} - ${(vendors[0] as { business_name: string }).business_name}`,
          netPayable,
          dto.invoice_date,
          expenseApprovedBy,
          expenseApprovedAt,
        ],
      );

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
        await this.ledger.postExpense(
          tenantId,
          invoiceId,
          netPayable,
          gstAmount,
          tdsAmount,
          tx,
        );
      }

      const vendorName =
        (vendors[0] as { business_name: string }).business_name ?? 'Vendor';
      this.events.emit('leadership.expense_created', {
        tenantId,
        invoiceId,
        label: `Vendor Expense - ${vendorName}`,
        amount: netPayable,
      });

      if (dto.department_id) {
        const budgetAfter = await this.checkBudget(
          tenantId,
          dto.department_id,
          0,
        );
        if (
          budgetAfter.utilization_percent &&
          budgetAfter.utilization_percent >= 80
        ) {
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
        approval_id: approvalId,
      };
    });
    if (result.approval_id) {
      void this.approvals.notifyFinanceApprovers(
        tenantId, result.approval_id, 'VENDOR_INVOICE', result.net_payable,
      );
    }
    return result;
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
      const r = rows[0] as {
        allocated_amount: string;
        utilized_amount: string;
        encumbered_amount: string;
      };
      const allocated = Number(r.allocated_amount);
      const committed = Number(r.utilized_amount) + Number(r.encumbered_amount);
      if (committed + amount > allocated) {
        return {
          allowed: false,
          message: `Budget cap reached (committed ₹${committed + amount} > allocated ₹${allocated})`,
          utilization_percent: allocated
            ? Math.round(((committed + amount) / allocated) * 100)
            : 100,
        };
      }
      return {
        allowed: true,
        utilization_percent: allocated
          ? Math.round(((committed + amount) / allocated) * 100)
          : 0,
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
      const allocated = Number(
        (legacy[0] as { allocated_amount: string }).allocated_amount,
      );
      const utilized = Number(
        (legacy[0] as { utilized_amount: string }).utilized_amount,
      );
      if (utilized + amount > allocated) {
        return {
          allowed: false,
          message: `Budget cap reached`,
          utilization_percent: 100,
        };
      }
      return {
        allowed: true,
        utilization_percent: allocated
          ? Math.round(((utilized + amount) / allocated) * 100)
          : 0,
      };
    }
    const r = rows[0] as {
      allocated_amount: string;
      utilized_amount: string;
      encumbered_amount: string;
    };
    const allocated = Number(r.allocated_amount);
    const committed = Number(r.utilized_amount) + Number(r.encumbered_amount);
    if (committed + amount > allocated) {
      return {
        allowed: false,
        message: `Budget cap reached (${committed + amount} > ${allocated})`,
        utilization_percent: allocated
          ? Math.round(((committed + amount) / allocated) * 100)
          : 100,
      };
    }
    return {
      allowed: true,
      utilization_percent: allocated
        ? Math.round(((committed + amount) / allocated) * 100)
        : 0,
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
    dto: {
      department_id: number;
      financial_year: string;
      allocated_amount: number;
    },
  ) {
    const departmentId = Number(dto.department_id);
    const amount = Number(dto.allocated_amount);
    const fiscalYears = /^(\d{4})-(\d{4})$/.exec(dto.financial_year ?? '');
    if (!Number.isSafeInteger(departmentId) || departmentId <= 0 ||
        !fiscalYears || Number(fiscalYears[2]) !== Number(fiscalYears[1]) + 1 ||
        !Number.isFinite(amount) || amount < 0 ||
        !Number.isSafeInteger(Math.round(amount * 100)) ||
        Math.abs(amount * 100 - Math.round(amount * 100)) > 0.00001)
      throw new BadRequestException('Select a department, financial year and valid non-negative amount');
    return this.dataSource.transaction(async (manager) => {
      const department = await manager.query<Array<{ dept_id: number }>>(
        `SELECT d.dept_id FROM departments d
         WHERE d.dept_id = $1 AND d.deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM users u WHERE u.dept_id = d.dept_id AND u.tenant_id = $2 AND u.deleted_at IS NULL)`,
        [departmentId, tenantId],
      );
      if (!department.length) throw new BadRequestException('Department not found in this institution');
      const rows = await manager.query<Array<{ budget_id: string; utilized_amount: string; encumbered_amount: string; status: string }>>(
        `SELECT budget_id, utilized_amount, encumbered_amount, status FROM fin_dept_budgets
         WHERE tenant_id = $1 AND department_id = $2 AND financial_year = $3 FOR UPDATE`,
        [tenantId, departmentId, dto.financial_year],
      );
      if (rows[0]?.status === 'LOCKED')
        throw new BadRequestException('Locked budget cannot be edited here; submit a budget expansion for approval');
      if (rows[0] && amount < Number(rows[0].utilized_amount) + Number(rows[0].encumbered_amount))
        throw new BadRequestException('Allocation cannot fall below utilized and committed amounts');
      if (rows[0]) {
        const programs = await manager.query<Array<{ allocated: string }>>(
          `SELECT COALESCE(SUM(allocated_amount), 0) AS allocated FROM fin_program_budgets
           WHERE budget_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
          [rows[0].budget_id, tenantId],
        );
        if (amount < Number(programs[0]?.allocated ?? 0))
          throw new BadRequestException('Allocation cannot fall below program budgets already assigned');
      }
      const university = await manager.query<Array<{ university_budget_id: string; total_allocated: string; status: string }>>(
        `SELECT university_budget_id, total_allocated, status FROM fin_university_budgets
         WHERE tenant_id = $1 AND financial_year = $2 FOR UPDATE`,
        [tenantId, dto.financial_year],
      );
      if (!university.length)
        throw new BadRequestException('Create the university budget in the Allocation Board first');
      if (university[0].status === 'LOCKED')
        throw new BadRequestException('Approved university budget is locked; submit a budget expansion for approval');
      const other = await manager.query<Array<{ allocated: string }>>(
        `SELECT COALESCE(SUM(allocated_amount), 0) AS allocated FROM fin_dept_budgets
         WHERE tenant_id = $1 AND financial_year = $2 AND department_id IS DISTINCT FROM $3
           AND deleted_at IS NULL`,
        [tenantId, dto.financial_year, departmentId],
      );
      if (Number(other[0]?.allocated ?? 0) + amount > Number(university[0].total_allocated))
        throw new BadRequestException('Department allocations would exceed the university budget cap');
      return manager.query(
        `INSERT INTO fin_dept_budgets
           (tenant_id, department_id, financial_year, allocated_amount, university_budget_id, status)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT')
         ON CONFLICT (tenant_id, department_id, financial_year)
         DO UPDATE SET allocated_amount = EXCLUDED.allocated_amount,
           university_budget_id = EXCLUDED.university_budget_id, deleted_at = NULL
         WHERE fin_dept_budgets.status <> 'LOCKED'
         RETURNING *`,
        [tenantId, departmentId, dto.financial_year, amount, university[0].university_budget_id],
      );
    });
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
    return {
      year: Number(yearStr),
      monthLabel: monthNames[Number(monStr) - 1] ?? 'June',
      iso,
    };
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
      total_payout: Number(
        (rows[0] as { total_payout: string })?.total_payout ?? 0,
      ),
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
      ...(
        rows as Array<{ name: string; ifsc_code: string; net_pay: string }>
      ).map(
        (r) =>
          `"${r.name}","","${r.ifsc_code ?? ''}",${Number(r.net_pay).toFixed(2)},"Salary ${iso}"`,
      ),
    ];
    return {
      format: 'NEFT_CSV',
      month: iso,
      csv: lines.join('\n'),
      row_count: rows.length,
    };
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
