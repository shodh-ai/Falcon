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

  async getExecutiveSummary(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const [students, staff, demands, pendingVerifications, pendingGovernance] =
      await Promise.all([
        this.countUsersByRole('Student'),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
          .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
          .getCount(),
        this.demands.find(),
        this.db
          .query(
            `SELECT COUNT(*)::int AS total FROM users
             WHERE tenant_id = $1 AND onboarding_status = 'PENDING_ADMIN_APPROVAL'`,
            [tid],
          )
          .then((r) => Number(r[0]?.total ?? 0)),
        this.taskAssignments.count({ where: { status: 'Pending' } }),
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
    };
  }

  async getAcademics() {
    const rows = await this.enrollments.find({
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

  async getFinance() {
    const demands = await this.demands.find();
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

  async getCompliance() {
    const pending = await this.taskAssignments.find({
      where: { status: 'Pending' },
      relations: ['task', 'assigned_user', 'assigned_user.department'],
      order: { due_date: 'ASC' },
      take: 50,
    });
    const stats = await this.db.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'Pending')::int AS pending,
         COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
         COUNT(*)::int AS total
       FROM task_assignments`,
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

  async getHrAnalytics() {
    const [students, faculty, staff, currentPayslips, activeFacultyYearAgo] =
      await Promise.all([
        this.countUsersByRole('Student'),
        this.countUsersByRole('Faculty'),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
          .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
          .getCount(),
        this.payslips.find({ order: { generated_at: 'DESC' }, take: 100 }),
        this.users
          .createQueryBuilder('user')
          .leftJoin('user.role', 'role')
          .where('user.is_active = true')
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

  private countUsersByRole(roleName: string) {
    return this.users
      .createQueryBuilder('user')
      .leftJoin('user.role', 'role')
      .where('user.is_active = true')
      .andWhere('role.role_name = :roleName', { roleName })
      .getCount();
  }

  private sumDemandTotal(demands: FeeDemand[]) {
    return demands.reduce((sum, row) => sum + Number(row.total_amount ?? 0), 0);
  }

  async getFinanceBudgetaryControl(tenantId?: string) {
    const tid = this.tenantId(tenantId);
    const budgets = await this.db.query(
      `SELECT d.dept_name as department, b.allocated_amount, b.utilized_amount
       FROM fin_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1
       ORDER BY b.allocated_amount DESC NULLS LAST LIMIT 20`,
      [tid],
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

    const pendingApprovals = await this.db
      .query(
        `SELECT COUNT(*)::int AS total FROM finance_approval_requests
         WHERE tenant_id = $1 AND status = 'PENDING'`,
        [tid],
      )
      .catch(() => [{ total: 0 }]);

    return {
      department_budgets,
      total_allocated: totalAllocated,
      total_utilized: totalUtilized,
      pending_approvals: Number(pendingApprovals[0]?.total ?? 0),
      grant_disbursements: 0,
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

    return {
      active_projects: Number(counts[0]?.active ?? 0),
      patents_filed: 0,
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
    const orders = await this.db
      .query(
        `SELECT order_id, order_code, subject, order_type, status, issued_at
         FROM leadership_executive_orders
         WHERE tenant_id = $1
         ORDER BY issued_at DESC NULLS LAST
         LIMIT 50`,
        [tid],
      )
      .catch(() => []);

    const stats = await this.db
      .query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'ACTIVE')::int AS active,
           COUNT(*) FILTER (WHERE status LIKE '%Pending%')::int AS pending,
           COUNT(*)::int AS total
         FROM leadership_executive_orders WHERE tenant_id = $1`,
        [tid],
      )
      .catch(() => [{ active: 0, pending: 0, total: 0 }]);

    return {
      active_suspensions: Number(stats[0]?.active ?? 0),
      pending_ratifications: Number(stats[0]?.pending ?? 0),
      emergency_orders_ytd: Number(stats[0]?.total ?? 0),
      orders: (orders as Array<Record<string, unknown>>).map((o) => ({
        id: o.order_code ?? o.order_id,
        date: o.issued_at,
        subject: o.subject ?? 'Executive order',
        type: o.order_type ?? 'Administrative',
        status: o.status ?? 'Unknown',
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
           COUNT(*) FILTER (WHERE status = 'PENDING')::int AS pending_hires,
           COUNT(*) FILTER (WHERE request_type ILIKE '%tenure%')::int AS tenure_reviews,
           COUNT(*) FILTER (WHERE request_type ILIKE '%disciplinary%')::int AS disciplinary
         FROM hr_approval_requests WHERE tenant_id = $1`,
        [tid],
      ).catch(() => [{ pending_hires: 0, tenure_reviews: 0, disciplinary: 0 }]),
      this.db.query(
        `SELECT candidate_name AS candidate, department_name AS department,
                request_type AS action, submitted_at AS date_submitted, status
         FROM hr_approval_requests
         WHERE tenant_id = $1 AND status = 'PENDING'
         ORDER BY submitted_at DESC NULLS LAST
         LIMIT 20`,
        [tid],
      ).catch(() => []),
    ]);

    return {
      pending_hires: Number(stats[0]?.pending_hires ?? 0),
      tenure_reviews: Number(stats[0]?.tenure_reviews ?? 0),
      disciplinary_cases: Number(stats[0]?.disciplinary ?? 0),
      approvals: approvals as Array<Record<string, unknown>>,
    };
  }
}
