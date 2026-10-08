import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { budgetAlertMessage } from '../../core/notifications/notification-message.catalog';
import { evaluateThreeWayMatch } from '../coo-ops/three-way-match.util';

type DeptAllocation = { department_id: number; allocated_amount: number };

@Injectable()
export class BudgetFpaService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifyDispatch: NotificationDispatchService,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  /** Hard gate: PO payment requires GRN + matching invoice (3-way). */
  async assertThreeWayMatchForPay(tenantId: string, poId: string) {
    const tid = this.tenantId(tenantId);
    const poRows = await this.db.query(
      `SELECT po_id, amount, status FROM fin_purchase_orders
       WHERE po_id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
      [poId, tid],
    );
    if (!poRows[0]) {
      throw new NotFoundException({
        message: 'PO not found',
        code: 'PO_NOT_FOUND',
      });
    }
    const grn = await this.db.query(
      `SELECT grn_id FROM fin_goods_receipts WHERE po_id = $1 AND tenant_id = $2 LIMIT 1`,
      [poId, tid],
    );
    const invoices = await this.db.query(
      `SELECT invoice_id, COALESCE(total_amount, 0) AS amount
       FROM fin_vendor_invoices
       WHERE po_id = $1 AND tenant_id = $2`,
      [poId, tid],
    );
    const poAmount = Number(poRows[0].amount);
    const invoiceAmount = (
      invoices as Array<{ amount: string | number }>
    ).reduce((sum, inv) => sum + Number(inv.amount ?? 0), 0);
    const evaluated = evaluateThreeWayMatch({
      poStatus: String(poRows[0].status),
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

  currentFinancialYear() {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    return m >= 4 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  async getAllocationBoard(tenantId?: string, financialYear?: string) {
    const tid = this.tenantId(tenantId);
    const fy = financialYear ?? this.currentFinancialYear();

    const [univ, depts, departments] = await Promise.all([
      this.db.query(
        `SELECT * FROM fin_university_budgets WHERE tenant_id = $1 AND financial_year = $2`,
        [tid, fy],
      ),
      this.db.query(
        `SELECT b.*, d.dept_name,
                CASE WHEN b.allocated_amount > 0
                  THEN ROUND(((b.utilized_amount + b.encumbered_amount) / b.allocated_amount) * 100, 1)
                  ELSE 0 END AS utilization_percent
         FROM fin_dept_budgets b
         LEFT JOIN departments d ON d.dept_id = b.department_id
         WHERE b.tenant_id = $1 AND b.financial_year = $2 AND b.deleted_at IS NULL
         ORDER BY d.dept_name`,
        [tid, fy],
      ),
      this.db.query(
        `SELECT dept_id, dept_name FROM departments WHERE deleted_at IS NULL ORDER BY dept_name`,
      ),
    ]);

    return {
      financial_year: fy,
      university: univ[0] ?? { total_allocated: 0, status: 'DRAFT' },
      departments: departments as { dept_id: number; dept_name: string }[],
      dept_budgets: depts,
      total_dept_allocated: depts.reduce(
        (s: number, r: { allocated_amount: string }) =>
          s + Number(r.allocated_amount),
        0,
      ),
    };
  }

  async saveDraftAllocation(
    tenantId: string,
    userId: string,
    dto: {
      financial_year: string;
      total_university_budget: number;
      departments: DeptAllocation[];
    },
  ) {
    const tid = this.tenantId(tenantId);
    const deptSum = dto.departments.reduce((s, d) => s + d.allocated_amount, 0);
    if (deptSum > dto.total_university_budget) {
      throw new BadRequestException(
        `Department allocations (₹${deptSum}) exceed university budget (₹${dto.total_university_budget})`,
      );
    }

    const univRows = await this.db.query(
      `INSERT INTO fin_university_budgets (tenant_id, financial_year, total_allocated, status)
       VALUES ($1, $2, $3, 'DRAFT')
       ON CONFLICT (tenant_id, financial_year)
       DO UPDATE SET total_allocated = EXCLUDED.total_allocated
       RETURNING university_budget_id`,
      [tid, dto.financial_year, dto.total_university_budget],
    );
    const universityBudgetId = (univRows[0] as { university_budget_id: string })
      .university_budget_id;

    for (const dept of dto.departments) {
      await this.db.query(
        `INSERT INTO fin_dept_budgets
           (tenant_id, university_budget_id, financial_year, department_id, allocated_amount, allocated_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT')
         ON CONFLICT (tenant_id, department_id, financial_year)
         DO UPDATE SET
           allocated_amount = EXCLUDED.allocated_amount,
           university_budget_id = EXCLUDED.university_budget_id,
           allocated_by = EXCLUDED.allocated_by`,
        [
          tid,
          universityBudgetId,
          dto.financial_year,
          dept.department_id,
          dept.allocated_amount,
          userId,
        ],
      );
    }

    return { saved: true, university_budget_id: universityBudgetId };
  }

  async lockFinancialYear(
    tenantId: string,
    userId: string,
    financialYear: string,
  ) {
    const tid = this.tenantId(tenantId);
    await this.db.query(
      `UPDATE fin_university_budgets SET status = 'LOCKED', locked_at = NOW(), locked_by = $3
       WHERE tenant_id = $1 AND financial_year = $2`,
      [tid, financialYear, userId],
    );
    await this.db.query(
      `UPDATE fin_dept_budgets SET status = 'LOCKED'
       WHERE tenant_id = $1 AND financial_year = $2`,
      [tid, financialYear],
    );
    return { locked: true, financial_year: financialYear };
  }

  async listProgramBudgets(tenantId: string, budgetId: string) {
    return this.db.query(
      `SELECT p.*,
              CASE WHEN p.allocated_amount > 0
                THEN ROUND(((p.utilized_amount + p.encumbered_amount) / p.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_percent
       FROM fin_program_budgets p
       WHERE p.budget_id = $1 AND p.tenant_id = $2 AND p.deleted_at IS NULL
       ORDER BY p.program_name`,
      [budgetId, this.tenantId(tenantId)],
    );
  }

  async createProgramBudget(
    tenantId: string,
    dto: {
      budget_id: string;
      program_name: string;
      allocated_amount: number;
      program_type?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const deptRows = await this.db.query(
      `SELECT allocated_amount,
              (SELECT COALESCE(SUM(allocated_amount), 0) FROM fin_program_budgets
               WHERE budget_id = $1 AND deleted_at IS NULL) AS program_total
       FROM fin_dept_budgets WHERE budget_id = $1 AND tenant_id = $2`,
      [dto.budget_id, tid],
    );
    if (!deptRows[0])
      throw new NotFoundException('Department budget not found');
    const deptAlloc = Number(
      (deptRows[0] as { allocated_amount: string }).allocated_amount,
    );
    const programTotal = Number(
      (deptRows[0] as { program_total: string }).program_total,
    );
    if (programTotal + dto.allocated_amount > deptAlloc) {
      throw new BadRequestException(
        'Program allocations exceed department budget cap',
      );
    }

    const rows = await this.db.query(
      `INSERT INTO fin_program_budgets (tenant_id, budget_id, program_name, program_type, allocated_amount)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        tid,
        dto.budget_id,
        dto.program_name,
        dto.program_type ?? 'EVENT',
        dto.allocated_amount,
      ],
    );
    return rows[0];
  }

  async getSankeyData(tenantId?: string, financialYear?: string) {
    const tid = this.tenantId(tenantId);
    const fy = financialYear ?? this.currentFinancialYear();

    const nodes: { name: string }[] = [];
    const links: { source: string; target: string; value: number }[] = [];
    const nodeSet = new Set<string>();

    const addNode = (name: string) => {
      if (!nodeSet.has(name)) {
        nodeSet.add(name);
        nodes.push({ name });
      }
    };

    const univ = await this.db.query(
      `SELECT total_allocated FROM fin_university_budgets WHERE tenant_id = $1 AND financial_year = $2`,
      [tid, fy],
    );
    const total = Number(
      (univ[0] as { total_allocated: string } | undefined)?.total_allocated ??
        1000000000,
    );
    addNode('University');
    addNode('Unallocated');

    const depts = await this.db.query(
      `SELECT b.budget_id, b.allocated_amount, b.utilized_amount, b.encumbered_amount, d.dept_name
       FROM fin_dept_budgets b
       JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.financial_year = $2 AND b.deleted_at IS NULL`,
      [tid, fy],
    );

    let allocatedSum = 0;
    for (const d of depts as {
      budget_id: string;
      allocated_amount: string;
      dept_name: string;
    }[]) {
      const amt = Number(d.allocated_amount);
      allocatedSum += amt;
      const deptName = d.dept_name ?? 'Dept';
      addNode(deptName);
      links.push({ source: 'University', target: deptName, value: amt });

      const programs = await this.db.query(
        `SELECT program_name, allocated_amount, utilized_amount FROM fin_program_budgets
         WHERE budget_id = $1 AND deleted_at IS NULL`,
        [d.budget_id],
      );
      for (const p of programs as {
        program_name: string;
        allocated_amount: string;
        utilized_amount: string;
      }[]) {
        const pName = `${deptName} › ${p.program_name}`;
        addNode(pName);
        links.push({
          source: deptName,
          target: pName,
          value: Number(p.allocated_amount),
        });
        if (Number(p.utilized_amount) > 0) {
          const spentName = `${p.program_name} (Spent)`;
          addNode(spentName);
          links.push({
            source: pName,
            target: spentName,
            value: Number(p.utilized_amount),
          });
        }
      }
    }

    if (total > allocatedSum) {
      links.push({
        source: 'University',
        target: 'Unallocated',
        value: total - allocatedSum,
      });
    }

    return { nodes, links, financial_year: fy };
  }

  async getDeptMonitorList(tenantId?: string, financialYear?: string) {
    const tid = this.tenantId(tenantId);
    const fy = financialYear ?? this.currentFinancialYear();
    const rows = await this.db.query(
      `SELECT b.budget_id, b.department_id, d.dept_name,
              b.allocated_amount, b.encumbered_amount, b.utilized_amount,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND(((b.utilized_amount + b.encumbered_amount) / b.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_percent
       FROM fin_dept_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.financial_year = $2 AND b.deleted_at IS NULL
       ORDER BY b.allocated_amount DESC`,
      [tid, fy],
    );
    return rows.map((r: Record<string, unknown>) => ({
      budget_id: r.budget_id,
      department_id: r.department_id,
      department_name: r.dept_name,
      allocated_amount: Number(r.allocated_amount),
      encumbered_amount: Number(r.encumbered_amount),
      utilized_amount: Number(r.utilized_amount),
      utilization_percent: Number(r.utilization_percent),
    }));
  }

  async getProgramLedger(tenantId: string, programId: string) {
    const programs = await this.db.query(
      `SELECT p.*, d.dept_name FROM fin_program_budgets p
       JOIN fin_dept_budgets b ON b.budget_id = p.budget_id
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE p.program_id = $1 AND p.tenant_id = $2`,
      [programId, this.tenantId(tenantId)],
    );
    if (!programs[0]) throw new NotFoundException('Program not found');

    const breakdown = await this.db.query(
      `SELECT h.head_name AS category, COALESCE(SUM(e.amount), 0)::numeric AS total
       FROM fin_expenses e
       LEFT JOIN finance_expense_heads h ON h.expense_head_id = e.expense_head_id
       WHERE e.program_id = $1 AND e.deleted_at IS NULL
       GROUP BY h.head_name
       ORDER BY total DESC`,
      [programId],
    );

    return { program: programs[0], breakdown };
  }

  async getExpenseGroundTruth(
    tenantId: string,
    programId: string,
    category?: string,
  ) {
    let query = `
      SELECT e.expense_id, e.description, e.amount, e.expense_date, e.approved_at,
             v.business_name AS vendor_name, u.name AS approved_by_name, h.head_name AS category
      FROM fin_expenses e
      LEFT JOIN fin_vendors v ON v.vendor_id = e.vendor_id
      LEFT JOIN users u ON u.user_id = e.approved_by
      LEFT JOIN finance_expense_heads h ON h.expense_head_id = e.expense_head_id
      WHERE e.program_id = $1 AND e.tenant_id = $2 AND e.deleted_at IS NULL`;
    const params: unknown[] = [programId, this.tenantId(tenantId)];
    if (category) {
      params.push(category);
      query += ` AND h.head_name = $${params.length}`;
    }
    query += ` ORDER BY e.expense_date DESC`;
    return this.db.query(query, params);
  }

  /** Encumbrance check: utilized + encumbered + new_amount <= allocated */
  async checkEncumbrance(params: {
    tenantId: string;
    budgetId?: string;
    programId?: string;
    amount: number;
  }) {
    const { tenantId, budgetId, programId, amount } = params;
    const tid = this.tenantId(tenantId);

    if (programId) {
      const rows = await this.db.query(
        `SELECT allocated_amount, encumbered_amount, utilized_amount, program_name
         FROM fin_program_budgets WHERE program_id = $1 AND tenant_id = $2`,
        [programId, tid],
      );
      if (!rows[0]) return { allowed: true };
      const r = rows[0] as {
        allocated_amount: string;
        encumbered_amount: string;
        utilized_amount: string;
        program_name: string;
      };
      const allocated = Number(r.allocated_amount);
      const committed = Number(r.encumbered_amount) + Number(r.utilized_amount);
      if (committed + amount > allocated) {
        throw new ForbiddenException({
          statusCode: 403,
          message: `Budget Exceeded. PO Rejected. Program "${r.program_name}" has ₹${allocated - committed} remaining.`,
          code: 'BUDGET_EXCEEDED',
          program_id: programId,
        });
      }
      return { allowed: true, remaining: allocated - committed - amount };
    }

    if (budgetId) {
      const rows = await this.db.query(
        `SELECT allocated_amount, encumbered_amount, utilized_amount, budget_limit_mode, d.dept_name
         FROM fin_dept_budgets b
         LEFT JOIN departments d ON d.dept_id = b.department_id
         WHERE b.budget_id = $1 AND b.tenant_id = $2`,
        [budgetId, tid],
      );
      if (!rows[0]) return { allowed: true };
      const r = rows[0] as {
        allocated_amount: string;
        encumbered_amount: string;
        utilized_amount: string;
        budget_limit_mode: string;
        dept_name: string;
      };
      const allocated = Number(r.allocated_amount);
      const committed = Number(r.encumbered_amount) + Number(r.utilized_amount);
      const remaining = allocated - committed;
      if (amount > remaining) {
        if (r.budget_limit_mode === 'SOFT_WARNING') {
          return {
            allowed: true,
            remaining: remaining - amount,
            soft_warning: true,
            requires_chairman: true,
            department: r.dept_name,
          };
        }
        throw new ForbiddenException({
          statusCode: 403,
          message: `Budget Exceeded. PO Rejected. Department has ₹${remaining} remaining.`,
          code: 'BUDGET_EXCEEDED',
          budget_id: budgetId,
        });
      }
      return { allowed: true, remaining: remaining - amount };
    }

    return { allowed: true };
  }

  async createPurchaseOrder(
    tenantId: string,
    userId: string,
    dto: {
      program_id?: string;
      budget_id?: string;
      vendor_id?: string;
      description: string;
      amount: number;
    },
  ) {
    const encumbrance = await this.checkEncumbrance({
      tenantId,
      programId: dto.program_id,
      budgetId: dto.budget_id,
      amount: dto.amount,
    });

    const tid = this.tenantId(tenantId);
    const needsBoardApproval =
      dto.amount >= 100000 ||
      Boolean((encumbrance as { soft_warning?: boolean }).soft_warning);
    const status = needsBoardApproval ? 'PENDING_BOARD_APPROVAL' : 'APPROVED';

    const rows = await this.db.query(
      `INSERT INTO fin_purchase_orders
         (tenant_id, program_id, budget_id, vendor_id, description, amount, status, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        tid,
        dto.program_id ?? null,
        dto.budget_id ?? null,
        dto.vendor_id ?? null,
        dto.description,
        dto.amount,
        status,
        userId,
      ],
    );
    const po = rows[0] as {
      po_id: string;
      program_id: string;
      budget_id: string;
      amount: string;
    };

    if (po.program_id) {
      await this.db.query(
        `UPDATE fin_program_budgets SET encumbered_amount = encumbered_amount + $2 WHERE program_id = $1`,
        [po.program_id, dto.amount],
      );
    }
    if (po.budget_id) {
      await this.db.query(
        `UPDATE fin_dept_budgets SET encumbered_amount = encumbered_amount + $2 WHERE budget_id = $1`,
        [po.budget_id, dto.amount],
      );
    }

    return po;
  }

  async recordExpenseFromInvoice(
    tenantId: string,
    dto: {
      program_id?: string;
      budget_id?: string;
      po_id?: string;
      vendor_id?: string;
      invoice_id?: string;
      expense_head_id?: string;
      description: string;
      amount: number;
      approved_by?: string;
      expense_date?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const amount = dto.amount;

    if (dto.po_id) {
      const poRows = await this.db.query(
        `SELECT amount, program_id, budget_id, status, source_system, proc_order_id FROM fin_purchase_orders WHERE po_id = $1`,
        [dto.po_id],
      );
      const po = poRows[0] as {
        amount: string;
        program_id: string;
        budget_id: string;
        status: string;
        source_system?: string;
        proc_order_id?: string;
      };
      if (po?.source_system === 'MODULE2') {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Post expenditure through Progressive Procurement',
          code: 'MODULE2_CANONICAL_RECORD',
          proc_order_id: po.proc_order_id,
        });
      }
      if (po?.status && po.status !== 'APPROVED') {
        throw new ForbiddenException({
          statusCode: 403,
          message: 'Purchase order is not approved for payment',
          code: 'PO_NOT_APPROVED',
          po_id: dto.po_id,
          status: po.status,
        });
      }

      const match = await this.assertThreeWayMatchForPay(tid, dto.po_id);
      if (!match.can_pay) {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            '3-way match failed — cannot pay PO until GRN and invoice align',
          code: 'THREE_WAY_MISMATCH',
          po_id: dto.po_id,
          match,
        });
      }

      if (po?.program_id) {
        await this.db.query(
          `UPDATE fin_program_budgets SET encumbered_amount = GREATEST(0, encumbered_amount - $2),
           utilized_amount = utilized_amount + $2 WHERE program_id = $1`,
          [po.program_id, Number(po.amount)],
        );
      }
      if (po?.budget_id) {
        await this.db.query(
          `UPDATE fin_dept_budgets SET encumbered_amount = GREATEST(0, encumbered_amount - $2),
           utilized_amount = utilized_amount + $2 WHERE budget_id = $1`,
          [po.budget_id, Number(po.amount)],
        );
      }
      await this.db.query(
        `UPDATE fin_purchase_orders SET status = 'PAID' WHERE po_id = $1`,
        [dto.po_id],
      );
    } else {
      await this.checkEncumbrance({
        tenantId: tid,
        programId: dto.program_id,
        budgetId: dto.budget_id,
        amount,
      });
      if (dto.program_id) {
        await this.db.query(
          `UPDATE fin_program_budgets SET utilized_amount = utilized_amount + $2 WHERE program_id = $1`,
          [dto.program_id, amount],
        );
      }
      if (dto.budget_id) {
        await this.db.query(
          `UPDATE fin_dept_budgets SET utilized_amount = utilized_amount + $2 WHERE budget_id = $1`,
          [dto.budget_id, amount],
        );
      }
    }

    const approvedAt = dto.approved_by ? new Date().toISOString() : null;
    const rows = await this.db.query(
      `INSERT INTO fin_expenses
         (tenant_id, program_id, budget_id, po_id, vendor_id, invoice_id, expense_head_id,
          description, amount, expense_date, approved_by, approved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        tid,
        dto.program_id ?? null,
        dto.budget_id ?? null,
        dto.po_id ?? null,
        dto.vendor_id ?? null,
        dto.invoice_id ?? null,
        dto.expense_head_id ?? null,
        dto.description,
        amount,
        dto.expense_date ?? new Date().toISOString().slice(0, 10),
        dto.approved_by ?? null,
        approvedAt,
      ],
    );
    return rows[0];
  }

  async requestBudgetExpansion(
    tenantId: string,
    userId: string,
    dto: {
      budget_id?: string;
      program_id?: string;
      requested_amount: number;
      reason?: string;
    },
  ) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `INSERT INTO fin_budget_expansion_requests
         (tenant_id, budget_id, program_id, requested_amount, reason, requested_by)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        tid,
        dto.budget_id ?? null,
        dto.program_id ?? null,
        dto.requested_amount,
        dto.reason ?? null,
        userId,
      ],
    );
    const req = rows[0] as {
      request_id: string;
      requested_amount: string;
      reason: string;
    };

    const chairmen = await this.db.query(
      `SELECT u.user_id FROM users u JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Chairman', 'President') LIMIT 5`,
      [tid],
    );
    const programName = dto.program_id
      ? (
          await this.db.query(
            `SELECT program_name FROM fin_program_budgets WHERE program_id = $1`,
            [dto.program_id],
          )
        )[0]?.program_name
      : 'Department';
    for (const c of chairmen as { user_id: string }[]) {
      const msg = budgetAlertMessage({
        title: 'Budget expansion request',
        message: `${programName} is requesting ₹${Number(dto.requested_amount).toLocaleString('en-IN')} in additional budget.${dto.reason ? ` Reason: ${dto.reason}` : ''} Review and approve or reject.`,
      });
      await this.notifyDispatch.dispatch({
        tenantId: tid,
        userId: c.user_id,
        ...msg,
        actionLink: `/leadership/budget-allocation?expansion=${req.request_id}`,
        queueDelivery: false,
      });
    }
    return req;
  }

  async reviewBudgetExpansion(
    tenantId: string,
    reviewerId: string,
    requestId: string,
    approve: boolean,
  ) {
    const tid = this.tenantId(tenantId);
    const rows = await this.db.query(
      `SELECT * FROM fin_budget_expansion_requests WHERE request_id = $1 AND tenant_id = $2`,
      [requestId, tid],
    );
    const req = rows[0] as {
      request_id: string;
      budget_id: string;
      program_id: string;
      requested_amount: string;
      status: string;
    };
    if (!req) throw new NotFoundException('Request not found');
    if (req.status !== 'PENDING')
      throw new BadRequestException('Request already reviewed');

    const status = approve ? 'APPROVED' : 'REJECTED';
    await this.db.query(
      `UPDATE fin_budget_expansion_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW()
       WHERE request_id = $3`,
      [status, reviewerId, requestId],
    );

    if (approve) {
      const amt = Number(req.requested_amount);
      if (req.program_id) {
        await this.db.query(
          `UPDATE fin_program_budgets SET allocated_amount = allocated_amount + $2 WHERE program_id = $1`,
          [req.program_id, amt],
        );
        const prog = await this.db.query(
          `SELECT budget_id FROM fin_program_budgets WHERE program_id = $1`,
          [req.program_id],
        );
        const budgetId = (prog[0] as { budget_id: string })?.budget_id;
        if (budgetId) {
          await this.db.query(
            `UPDATE fin_dept_budgets SET allocated_amount = allocated_amount + $2 WHERE budget_id = $1`,
            [budgetId, amt],
          );
        }
      } else if (req.budget_id) {
        await this.db.query(
          `UPDATE fin_dept_budgets SET allocated_amount = allocated_amount + $2 WHERE budget_id = $1`,
          [req.budget_id, amt],
        );
      }
    }
    return { request_id: requestId, status };
  }
}
