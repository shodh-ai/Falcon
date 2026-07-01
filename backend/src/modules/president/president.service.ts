import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { StaffPayslip } from '../../entities/staff-payslip.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { TaskAssignment } from '../../entities/task-assignment.entity';
import { User } from '../../entities/user.entity';

@Injectable()
export class PresidentService {
  constructor(
    @InjectRepository(User) private users: Repository<User>,
    @InjectRepository(FeeDemand) private demands: Repository<FeeDemand>,
    @InjectRepository(StudentCourseEnrollment)
    private enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(TaskAssignment)
    private taskAssignments: Repository<TaskAssignment>,
    @InjectRepository(StaffPayslip) private payslips: Repository<StaffPayslip>,
  ) {}

  async getExecutiveSummary() {
    const [students, staff, demands] = await Promise.all([
      this.countUsersByRole('Student'),
      this.users
        .createQueryBuilder('user')
        .leftJoin('user.role', 'role')
        .where('user.is_active = true')
        .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
        .getCount(),
      this.demands.find(),
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
    return {
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
    const [students, faculty, staff, currentPayslips] = await Promise.all([
      this.countUsersByRole('Student'),
      this.countUsersByRole('Faculty'),
      this.users
        .createQueryBuilder('user')
        .leftJoin('user.role', 'role')
        .where('user.is_active = true')
        .andWhere("role.role_name NOT IN ('Student', 'Applicant')")
        .getCount(),
      this.payslips.find({ order: { generated_at: 'DESC' }, take: 100 }),
    ]);
    const payrollExpense = currentPayslips.reduce(
      (sum, row) => sum + Number(row.net_pay ?? 0),
      0,
    );
    return {
      faculty_retention_rate: 94,
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

  async getFinanceBudgetaryControl() {
    let budgets = await this.users.manager.query(
      `SELECT d.dept_name as department, b.allocated_amount, b.utilized_amount 
       FROM fin_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       ORDER BY b.allocated_amount DESC LIMIT 10`
    );

    // Provide smoke data if the fin_budgets table is empty
    if (!budgets || budgets.length === 0) {
      budgets = [
        { department: 'Computer Science', allocated_amount: 15000000, utilized_amount: 12500000 },
        { department: 'Mechanical Engineering', allocated_amount: 12000000, utilized_amount: 8000000 },
        { department: 'Business Administration', allocated_amount: 8000000, utilized_amount: 7500000 },
        { department: 'Electrical Engineering', allocated_amount: 9000000, utilized_amount: 4000000 },
        { department: 'Civil Engineering', allocated_amount: 6000000, utilized_amount: 2500000 },
      ];
    }

    let totalAllocated = 0;
    let totalUtilized = 0;

    const department_budgets = budgets.map((b: any) => {
      const allocated = Number(b.allocated_amount || 0);
      const utilized = Number(b.utilized_amount || 0);
      totalAllocated += allocated;
      totalUtilized += utilized;
      return {
        department: b.department || 'Central',
        allocated,
        utilized,
        status: utilized > allocated * 0.9 ? 'Critical' : 'Healthy',
      };
    });

    return {
      department_budgets,
      total_allocated: totalAllocated || 50000000,
      total_utilized: totalUtilized || 34500000,
      pending_approvals: 14,
      grant_disbursements: 2450000,
      audit_status: 'On Track',
    };
  }

  async getResearchHub() {
    return {
      active_projects: 42,
      patents_filed: 12,
      grants_received: 8500000,
      extension_programs: 8,
      projects: [
        { title: 'AI in Agriculture Optimization', pi: 'Dr. Sharma', type: 'Research', status: 'Ongoing', funding: 1500000 },
        { title: 'Smart Grid IoT Infrastructure', pi: 'Dr. Verma', type: 'Grant', status: 'Approved', funding: 2500000 },
        { title: 'Advanced Water Purification Tech', pi: 'Dr. Singh', type: 'Patent', status: 'Filed', funding: 0 },
        { title: 'Rural Digital Literacy Drive', pi: 'Dr. Patel', type: 'Extension', status: 'Active', funding: 500000 },
        { title: 'Renewable Energy Storage Models', pi: 'Dr. Gupta', type: 'Research', status: 'Ongoing', funding: 3200000 },
        { title: 'Blockchain for Academic Records', pi: 'Dr. Reddy', type: 'Research', status: 'Completed', funding: 1200000 },
        { title: 'National Science Foundation Grant', pi: 'Dr. Kumar', type: 'Grant', status: 'Pending', funding: 5000000 },
      ]
    };
  }

  async getExecutiveOrders() {
    return {
      active_suspensions: 2,
      pending_ratifications: 5,
      emergency_orders_ytd: 12,
      orders: [
        { id: 'EO-2026-001', date: '2026-06-15', subject: 'Emergency Campus Closure Due to Weather', type: 'Administrative', status: 'Ratified' },
        { id: 'EO-2026-002', date: '2026-06-20', subject: 'Suspension of Student IDs 4521, 4522', type: 'Disciplinary', status: 'Pending Ratification' },
        { id: 'EO-2026-003', date: '2026-06-25', subject: 'Immediate Appointment of Interim Dean', type: 'HR', status: 'Active' },
      ]
    };
  }

  async getConvocation() {
    return {
      eligible_graduates: 1245,
      medals_approved: 24,
      pending_verifications: 156,
      graduates: [
        { student_name: 'Aarav Patel', program: 'B.Tech Computer Science', status: 'Verified', honors: 'Gold Medal' },
        { student_name: 'Priya Sharma', program: 'MBA Finance', status: 'Pending', honors: 'None' },
        { student_name: 'Rahul Kumar', program: 'B.Tech Mechanical', status: 'Verified', honors: 'Silver Medal' },
        { student_name: 'Neha Singh', program: 'Ph.D Physics', status: 'Approved by VC', honors: 'None' },
      ]
    };
  }

  async getHrApprovals() {
    return {
      pending_hires: 8,
      tenure_reviews: 3,
      disciplinary_cases: 1,
      approvals: [
        { candidate: 'Dr. Ananya Reddy', department: 'Computer Science', action: 'New Hire - Assistant Professor', date_submitted: '2026-06-28', status: 'Pending VC Approval' },
        { candidate: 'Prof. Vikram Malhotra', department: 'Mechanical', action: 'Tenure Approval', date_submitted: '2026-06-25', status: 'Pending VC Approval' },
        { candidate: 'Mr. Rohan Desai', department: 'Administration', action: 'Suspension Review', date_submitted: '2026-06-30', status: 'Under Investigation' },
      ]
    };
  }
}
