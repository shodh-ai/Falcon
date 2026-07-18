import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class PresidentService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(FeeDemand) private demands: Repository<FeeDemand>,
    @InjectRepository(StudentCourseEnrollment)
    private enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(TaskAssignment)
    private taskAssignments: Repository<TaskAssignment>,
    @InjectRepository(StaffPayslip) private payslips: Repository<StaffPayslip>,
  ) {}

  private tenantId(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private fetchTenantDemands(tenantId: string) {
    return this.demands
      .createQueryBuilder('demand')
      .innerJoin('users', 'u', 'u.user_id = demand.student_user_id')
      .where('u.tenant_id = :tenantId', { tenantId })
      .getMany();
  }

  async getExecutiveSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [students, staff, demands, pendingVerifications, pendingGovernance, pendingHr, pendingOrders, pendingRatify] =
      await Promise.all([
        this.countUsersByRole('Student', tid),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
          .andWhere('user.tenant_id = :tid', { tid })
          .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
          .getCount(),
        this.fetchTenantDemands(tid),
        this.db
          .query(
            `SELECT COUNT(*)::int AS total FROM users
             WHERE tenant_id = $1 AND onboarding_status = 'PENDING_ADMIN_APPROVAL'`,
            [tid],
          )
          .then((r) => Number(r[0]?.total ?? 0)),
        this.taskAssignments
          .createQueryBuilder('ta')
          .innerJoin('ta.assigned_user', 'u')
          .where('ta.status = :status', { status: 'Pending' })
          .andWhere('u.tenant_id = :tid', { tid })
          .getCount(),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM executive_hr_approval_requests
           WHERE tenant_id = $1 AND status = 'PENDING'`,
          [tid],
        ).then((r) => Number(r[0]?.c ?? 0)),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM leadership_executive_orders
           WHERE tenant_id = $1 AND status IN ('ISSUED', 'IN_PROGRESS', 'ACKNOWLEDGED')`,
          [tid],
        ).catch(() => [{ c: 0 }]).then((r) => Number(r[0]?.c ?? 0)),
        this.db.query(
          `SELECT COUNT(*)::int AS c FROM cert_applications
           WHERE tenant_id = $1 AND verification_status = 'VERIFIED'
             AND president_ratification_status = 'PENDING' AND certificate_generated = false`,
          [tid],
        ).catch(() => [{ c: 0 }]).then((r) => Number(r[0]?.c ?? 0)),
      ]);

    return {
      total_university_revenue: this.sumDemandTotal(demands),
      total_collected: demands.reduce(
        (sum, row) => sum + Number(row.paid_amount ?? 0),
        0,
      ),
      headcount: {
        students,
        staff,
        total: students + staff,
      },
      pending_student_verifications: pendingVerifications,
      pending_governance_tasks: pendingGovernance,
      pending_hr_approvals: pendingHr,
      pending_executive_orders: pendingOrders,
      pending_convocation_ratifications: pendingRatify,
    };
  }

  async getAcademics(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const rows = await this.enrollments.find({
      where: { tenant_id: tid },
      relations: ['student', 'student.department'],
    });
    const byDepartment = new Map<
      string,
      { total: number; passed: number; failed: number; attendance: number }
    >();
    for (const row of rows) {
      const key = row.student?.department?.dept_name ?? 'Unassigned';
      const bucket = byDepartment.get(key) ?? {
        total: 0,
        passed: 0,
        failed: 0,
        attendance: 0,
      };
      bucket.total += 1;
      bucket.attendance += Number(row.attendance_percent ?? 0);
      if (row.status === 'FAILED') bucket.failed += 1;
      if (row.status === 'COMPLETED') bucket.passed += 1;
      byDepartment.set(key, bucket);
    }
    return {
      schools: Array.from(byDepartment.entries()).map(
        ([department, stats]) => ({
          department,
          pass_count: stats.passed,
          fail_count: stats.failed,
          average_attendance: stats.total
            ? Number((stats.attendance / stats.total).toFixed(2))
            : 0,
        }),
      ),
    };
  }

  async getFinance(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const demands = await this.fetchTenantDemands(tid);
    const collected = demands.reduce(
      (sum, row) => sum + Number(row.paid_amount ?? 0),
      0,
    );
    const total = this.sumDemandTotal(demands);
    return {
      collected,
      pending: Math.max(0, total - collected),
      status_breakdown: [
        'PENDING',
        'PARTIALLY_PAID',
        'PAID',
        'OVERDUE',
        'WAIVED',
      ].map((status) => ({
        status,
        count: demands.filter((row) => row.status === status).length,
      })),
    };
  }

  async getCompliance(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const pending = await this.taskAssignments
      .createQueryBuilder('ta')
      .leftJoinAndSelect('ta.task', 'task')
      .leftJoinAndSelect('ta.assigned_user', 'assigned_user')
      .leftJoinAndSelect('assigned_user.department', 'department')
      .where('ta.status = :status', { status: 'Pending' })
      .andWhere('assigned_user.tenant_id = :tid', { tid })
      .orderBy('ta.due_date', 'ASC')
      .take(50)
      .getMany();
    const stats = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE ta.status = 'Pending')::int AS pending,
         COUNT(*) FILTER (WHERE ta.status = 'Completed')::int AS completed,
         COUNT(*)::int AS total
       FROM task_assignments ta
       JOIN users u ON u.user_id = ta.assigned_to
       WHERE u.tenant_id = $1`,
      [tid],
    );
    return {
      pending_count: Number(stats[0]?.pending ?? 0),
      completed_count: Number(stats[0]?.completed ?? 0),
      total_assignments: Number(stats[0]?.total ?? 0),
      defaulting_units: pending.map((row) => ({
        assignment_id: row.assignment_id,
        task: row.task?.task_name,
        assigned_to: row.assigned_user?.name,
        department: row.assigned_user?.department?.dept_name ?? 'Unassigned',
        due_date: row.due_date,
      })),
    };
  }

  async getHrAnalytics(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [students, faculty, staff, currentPayslips, activeFacultyYearAgo] =
      await Promise.all([
        this.countUsersByRole('Student', tid),
        this.countUsersByRole('Faculty', tid),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
          .andWhere('user.tenant_id = :tid', { tid })
          .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
          .getCount(),
        this.payslips.find({
          where: { tenant_id: tid },
          order: { generated_at: 'DESC' },
          take: 100,
        }),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
          .andWhere('user.tenant_id = :tid', { tid })
          .andWhere('role.role_name = :roleName', { roleName: 'Faculty' })
          .andWhere('user.created_at <= NOW() - INTERVAL \'1 year\'')
          .getCount(),
      ]);
    const payrollExpense = currentPayslips.reduce(
      (sum, row) => sum + Number(row.net_pay ?? 0),
      0,
    );
    const retentionRate =
      activeFacultyYearAgo > 0
        ? Number(((faculty / activeFacultyYearAgo) * 100).toFixed(1))
        : null;
    return {
      faculty_retention_rate: retentionRate,
      faculty_to_student_ratio:
        faculty > 0 ? Number((students / faculty).toFixed(2)) : 0,
      total_payroll_expense: payrollExpense,
      headcount: { faculty, staff, students },
    };
  }

  private countUsersByRole(roleName: string, tenantId?: string) {
    const qb = this.users
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .where('user.is_active = true')
      .andWhere('role.role_name = :roleName', { roleName });
    if (tenantId) {
      qb.andWhere('user.tenant_id = :tenantId', { tenantId });
    }
    return qb.getCount();
  }

  private sumDemandTotal(demands: FeeDemand[]) {
    return demands.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  }

  async getFinanceBudgetaryControl(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const budgets = await this.db.query(
      `SELECT d.dept_name AS department, b.allocated_amount, b.utilized_amount
       FROM fin_dept_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
       ORDER BY b.allocated_amount DESC NULLS LAST LIMIT 20`,
      [tid],
    ).catch(async () =>
      this.db.query(
        `SELECT d.dept_name AS department, b.allocated_amount, b.utilized_amount
         FROM fin_budgets b
         LEFT JOIN departments d ON d.dept_id = b.department_id
         WHERE b.tenant_id = $1 AND b.deleted_at IS NULL
         ORDER BY b.allocated_amount DESC NULLS LAST LIMIT 20`,
        [tid],
      ),
    );

    let totalAllocated = 0;
    let totalUtilized = 0;

    const department_budgets = (budgets as Array<Record<string, unknown>>).map(
      (b) => {
        const allocated = Number(b.allocated_amount || 0);
        const utilized = Number(b.utilized_amount || 0);
        totalAllocated += allocated;
        totalUtilized += utilized;
        return {
          department: (b.department as string) || 'Central',
          allocated,
          utilized,
          status: utilized > allocated * 0.9 ? 'Critical' : 'Healthy',
        };
      },
    );

    const [pendingApprovals, pendingBudgetExpansions] = await Promise.all([
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM fin_approval_requests
         WHERE tenant_id = $1 AND status = 'PENDING'`,
        [tid],
      ),
      this.db.query(
        `SELECT COUNT(*)::int AS total FROM fin_budget_expansion_requests
         WHERE tenant_id = $1 AND status = 'PENDING'`,
        [tid],
      ).catch(() => [{ total: 0 }]),
    ]);

    const grantRows = await this.db.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM fin_budget_reappropriations WHERE tenant_id = $1`,
      [tid],
    ).catch(() => [{ total: 0 }]);

    return {
      department_budgets,
      total_allocated: totalAllocated,
      total_utilized: totalUtilized,
      pending_approvals: Number(pendingApprovals[0]?.total ?? 0),
      pending_budget_expansions: Number(pendingBudgetExpansions[0]?.total ?? 0),
      grant_disbursements: Number(grantRows[0]?.total ?? 0),
      audit_status:
        department_budgets.length > 0 ? 'On Track' : 'No budget data',
    };
  }

  async getResearchHub(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [counts, projects] = await Promise.all([
      this.db
        .query(
          `SELECT
             COUNT(*) FILTER (WHERE status NOT IN ('REJECTED', 'CLOSED'))::int AS active,
             COUNT(*) FILTER (WHERE status = 'APPROVED')::int AS approved
           FROM academic_rnd_applications WHERE tenant_id = $1`,
          [tid],
        )
        .catch(() => [{ active: 0, approved: 0 }]),
      this.db
        .query(
          `SELECT a.title, u.name AS pi, a.status, a.funding_amount AS funding, a.application_type AS type
           FROM academic_rnd_applications a
           LEFT JOIN users u ON u.user_id = a.applicant_user_id
           WHERE a.tenant_id = $1
           ORDER BY a.updated_at DESC NULLS LAST
           LIMIT 20`,
          [tid],
        )
        .catch(() => []),
    ]);

    const totalFunding = (projects as Array<{ funding: number }>).reduce(
      (sum, p) => sum + Number(p.funding ?? 0),
      0,
    );

    const patentCount = await this.db.query(
      `SELECT COUNT(*)::int AS c FROM academic_rnd_applications
       WHERE tenant_id = $1 AND application_type ILIKE '%patent%'`,
      [tid],
    ).catch(() => [{ c: 0 }]);

    return {
      active_projects: Number(counts[0]?.active ?? 0),
      patents_filed: Number(patentCount[0]?.c ?? 0),
      grants_received: totalFunding,
      extension_programs: Number(counts[0]?.approved ?? 0),
      projects: (projects as Array<Record<string, unknown>>).map((p) => ({
        title: p.title ?? 'Untitled',
        pi: p.pi ?? '—',
        type: p.type ?? 'Research',
        status: p.status ?? 'Unknown',
        funding: Number(p.funding ?? 0),
      })),
    };
  }

  async getExecutiveOrders(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const orders = await this.db.query(
      `SELECT order_id, order_code, subject, order_type, destination_module,
              status, issued_at, completed_at, assigned_to_user_id
       FROM leadership_executive_orders
       WHERE tenant_id = $1
       ORDER BY issued_at DESC NULLS LAST
       LIMIT 50`,
      [tid],
    );

    const stats = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'ACTIVE' OR status = 'ISSUED')::int AS active,
         COUNT(*) FILTER (WHERE status LIKE '%Pending%' OR status = 'IN_PROGRESS')::int AS pending,
         COUNT(*)::int AS total
       FROM leadership_executive_orders WHERE tenant_id = $1`,
      [tid],
    );

    return {
      active_suspensions: Number(stats[0]?.active ?? 0),
      pending_ratifications: Number(stats[0]?.pending ?? 0),
      emergency_orders_ytd: Number(stats[0]?.total ?? 0),
      orders: (orders as Array<Record<string, unknown>>).map((o) => ({
        order_id: o.order_id,
        id: o.order_code ?? o.order_id,
        date: o.issued_at,
        subject: o.subject ?? 'Executive order',
        type: o.order_type ?? 'Administrative',
        status: o.status ?? 'Unknown',
        destination_module: o.destination_module,
      })),
    };
  }

  async getConvocation(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [stats, graduates, events] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE ca.verification_status = 'PENDING_VERIFICATION')::int AS pending_verifications,
           COUNT(*) FILTER (WHERE ca.verification_status = 'VERIFIED')::int AS verified,
           COUNT(*) FILTER (WHERE ca.certificate_generated = true)::int AS certificates_generated,
           COUNT(*)::int AS total_applications
         FROM cert_applications ca
         WHERE ca.tenant_id = $1`,
        [tid],
      ),
      this.db.query(
        `SELECT u.name AS student_name,
                COALESCE(sp.branch_name, sp.batch, 'Programme') AS program,
                ca.verification_status AS status,
                CASE WHEN ca.certificate_generated THEN 'Certificate Issued' ELSE 'Pending' END AS honors
         FROM cert_applications ca
         JOIN users u ON u.user_id = ca.student_user_id
         LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
         WHERE ca.tenant_id = $1
         ORDER BY ca.updated_at DESC NULLS LAST
         LIMIT 50`,
        [tid],
      ),
      this.db.query(
        `SELECT COUNT(DISTINCT sp.user_id)::int AS eligible
         FROM student_profiles sp
         JOIN users u ON u.user_id = sp.user_id AND u.is_active = true
         WHERE u.tenant_id = $1
           AND sp.deleted_at IS NULL
           AND COALESCE(sp.current_semester, 0) >= 8`,
        [tid],
      ),
    ]);

    return {
      eligible_graduates: Number(events[0]?.eligible ?? 0),
      medals_approved: Number(stats[0]?.verified ?? 0),
      pending_verifications: Number(stats[0]?.pending_verifications ?? 0),
      certificates_generated: Number(stats[0]?.certificates_generated ?? 0),
      total_applications: Number(stats[0]?.total_applications ?? 0),
      graduates: graduates.map((g: Record<string, unknown>) => ({
        student_name: g.student_name,
        program: g.program,
        status: g.status,
        honors: g.honors,
      })),
    };
  }

  async getHrApprovals(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [stats, approvals] = await Promise.all([
      this.db.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type = 'HIRING')::int AS pending_hires,
           COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type ILIKE '%tenure%')::int AS tenure_reviews,
           COUNT(*) FILTER (WHERE status = 'PENDING' AND request_type ILIKE '%disciplinary%')::int AS disciplinary
         FROM executive_hr_approval_requests WHERE tenant_id = $1`,
        [tid],
      ),
      this.db.query(
        `SELECT r.request_id, r.title, r.request_type AS action, r.amount,
                r.created_at AS date_submitted, r.status, r.payload,
                (r.payload->>'candidate_name') AS candidate,
                (r.payload->>'department_name') AS department,
                u.name AS requested_by_name,
                r.requested_by
         FROM executive_hr_approval_requests r
         LEFT JOIN users u ON u.user_id = r.requested_by
         WHERE r.tenant_id = $1 AND r.status = 'PENDING'
         ORDER BY r.created_at DESC NULLS LAST
         LIMIT 50`,
        [tid],
      ),
    ]);

    return {
      pending_hires: Number(stats[0]?.pending_hires ?? 0),
      tenure_reviews: Number(stats[0]?.tenure_reviews ?? 0),
      disciplinary_cases: Number(stats[0]?.disciplinary ?? 0),
      approvals: (approvals as Array<Record<string, unknown>>).map((a) => ({
        request_id: a.request_id,
        candidate: a.candidate ?? a.title,
        department: a.department ?? '—',
        action: a.action,
        date_submitted: a.date_submitted,
        status: a.status,
        amount: a.amount,
        requested_by: a.requested_by_name ?? null,
        business_reason: a.title,
        financial_impact: a.amount,
      })),
    };
  }
}
