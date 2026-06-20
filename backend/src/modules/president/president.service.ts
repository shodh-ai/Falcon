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
}
