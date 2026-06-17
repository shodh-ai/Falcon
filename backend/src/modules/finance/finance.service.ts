import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Not, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FeeDemand } from '../../entities/fee-demand.entity';
import { Transaction } from '../../entities/transaction.entity';
import { LateFinePolicy } from '../../entities/late-fine-policy.entity';
import { CreateFeeDemandDto } from './dto/create-fee-demand.dto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);

  constructor(
    @InjectRepository(FeeDemand) private demands: Repository<FeeDemand>,
    @InjectRepository(Transaction) private transactions: Repository<Transaction>,
    @InjectRepository(LateFinePolicy) private finePolicies: Repository<LateFinePolicy>,
    private readonly notify: NotificationEmitterService,
  ) {}

  listDemands(studentUserId?: string) {
    if (studentUserId) {
      return this.demands.find({ where: { student_user_id: studentUserId }, order: { due_date: 'ASC' } });
    }
    return this.demands.find({ order: { due_date: 'ASC' } });
  }

  async createDemand(dto: CreateFeeDemandDto, tenantId: string) {
    const saved = await this.demands.save(this.demands.create(dto));
    this.notify.feeGenerated({
      tenantId,
      userId: saved.student_user_id,
      amount: Number(saved.total_amount),
      dueDate: String(saved.due_date),
      feeHead: saved.fee_head,
    });
    return saved;
  }

  async getDashboard(tenantId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const successfulToday = await this.transactions
      .createQueryBuilder('transaction')
      .where('transaction.status = :status', { status: 'SUCCESS' })
      .andWhere('DATE(transaction.created_at) = :today', { today })
      .getMany();
    const openDemands = await this.demands
      .createQueryBuilder('demand')
      .where("demand.status NOT IN ('PAID', 'WAIVED')")
      .getMany();
    const recentTransactions = await this.transactions.find({
      where: { status: 'SUCCESS' },
      order: { created_at: 'DESC' },
      take: 8,
    });

    const budgets = await this.demands.manager.query(
      `SELECT b.budget_id, d.dept_name AS department,
              b.allocated_amount, b.utilized_amount,
              CASE WHEN b.allocated_amount > 0
                THEN ROUND((b.utilized_amount / b.allocated_amount) * 100, 1)
                ELSE 0 END AS utilization_percent
       FROM fin_budgets b
       LEFT JOIN departments d ON d.dept_id = b.department_id
       WHERE b.tenant_id = $1
       ORDER BY utilization_percent DESC
       LIMIT 12`,
      [tenantId],
    );

    return {
      todays_collection: successfulToday.reduce((sum, row) => sum + Number(row.amount), 0),
      total_outstanding: openDemands.reduce(
        (sum, row) => sum + Math.max(0, Number(row.total_amount) - Number(row.paid_amount ?? 0)),
        0,
      ),
      recent_transactions: recentTransactions,
      transaction_count_today: successfulToday.length,
      budget_utilization: budgets,
    };
  }

  async bulkGenerateDemands(dto: {
    program?: string;
    semester?: number;
    academic_year?: string;
    due_date?: string;
    tuition_fee?: number;
    development_fee?: number;
  }) {
    const semester = Number(dto.semester ?? 3);
    const tuitionFee = Number(dto.tuition_fee ?? 85000);
    const developmentFee = Number(dto.development_fee ?? 15000);
    const academicYear = dto.academic_year ?? '2026-27';
    const dueDate = dto.due_date ?? new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString().slice(0, 10);
    const students = await this.demands.manager.query(
      `SELECT u.user_id
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE r.role_name = 'Student'
       ORDER BY u.name ASC`,
    );

    const created: FeeDemand[] = [];
    for (const student of students as Array<{ user_id: string }>) {
      const existing = await this.demands.findOne({
        where: {
          student_user_id: student.user_id,
          fee_head: 'SEMESTER_FEE',
          academic_year: academicYear,
          semester,
        },
      });
      if (existing) continue;
      created.push(
        this.demands.create({
          student_user_id: student.user_id,
          fee_head: 'SEMESTER_FEE',
          academic_year: academicYear,
          semester,
          total_amount: tuitionFee + developmentFee,
          paid_amount: 0,
          due_date: dueDate,
          status: 'PENDING',
          fee_breakup: {
            program: dto.program ?? 'B.Tech',
            tuition_fee: tuitionFee,
            development_fee: developmentFee,
          },
        }),
      );
    }
    const saved = created.length ? await this.demands.save(created) : [];
    return {
      queued: true,
      job: 'finance.bulk-demand-generation',
      generated: saved.length,
      message: 'Smoke implementation completed synchronously; production path can enqueue this via BullMQ.',
    };
  }

  listFinePolicies() {
    return this.finePolicies.find();
  }

  /**
   * Nightly sweep: flips any unpaid demand past its due date to OVERDUE so
   * the UI can show the fine banner. The exact ₹ amount is computed lazily
   * from the active `LateFinePolicy.slabs` JSON at display / payment time.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async markOverdueDemands(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const result = await this.demands
      .createQueryBuilder()
      .update(FeeDemand)
      .set({ status: 'OVERDUE' })
      .where({ due_date: LessThan(today), status: Not('PAID') })
      .andWhere('status NOT IN (:...skip)', { skip: ['OVERDUE', 'WAIVED'] })
      .execute();
    this.logger.log(`Late-fee sweep: marked ${result.affected ?? 0} demands as OVERDUE`);
  }

  listTransactions(studentUserId?: string) {
    if (studentUserId) {
      return this.transactions.find({ where: { student_user_id: studentUserId }, order: { created_at: 'DESC' } });
    }
    return this.transactions.find({ order: { created_at: 'DESC' } });
  }

  async uploadReceipt(transactionId: string, receiptUrl: string) {
    const result = await this.transactions.update({ transaction_id: transactionId }, { receipt_url: receiptUrl });
    if (result.affected === 0) throw new BadRequestException('Transaction not found');
    return { success: true };
  }

  async listDefaulters() {
    const rows = await this.demands.find({
      where: [
        { status: 'PENDING' },
        { status: 'PARTIALLY_PAID' },
        { status: 'OVERDUE' },
      ],
      order: { due_date: 'ASC' },
    });
    const studentIds = [...new Set(rows.map((row) => row.student_user_id))];
    const students =
      studentIds.length > 0
        ? await this.demands.manager.query(
            `SELECT user_id, name, official_email FROM users WHERE user_id = ANY($1::uuid[])`,
            [studentIds],
          )
        : [];
    const studentMap = new Map(
      (students as Array<{ user_id: string; name: string; official_email: string }>).map((row) => [row.user_id, row]),
    );

    return rows.map((row) => ({
      ...row,
      outstanding_amount: Math.max(0, Number(row.total_amount) - Number(row.paid_amount ?? 0)),
      admit_card_locked: row.status !== 'PAID' && row.status !== 'WAIVED',
      student: studentMap.get(row.student_user_id) ?? null,
    }));
  }

  async lockAdmitCards(tenantId: string) {
    const defaulters = await this.listDefaulters();
    const studentIds = [...new Set(defaulters.map((row) => row.student_user_id))];
    for (const userId of studentIds) {
      this.notify.admitCardLocked({
        tenantId,
        userId,
        actionLink: '/student/finance',
      });
    }
    return {
      locked: true,
      affected_students: studentIds.length,
      exam_signal: 'DEFaulter admit-card lock active for open fee demands',
    };
  }

  async applyScholarship(dto: { student_user_id?: string; discount_percent?: number }) {
    if (!dto.student_user_id) throw new BadRequestException('student_user_id is required');
    const discountPercent = Number(dto.discount_percent ?? 50);
    const activeDemand = await this.demands.findOne({
      where: [
        { student_user_id: dto.student_user_id, status: 'PENDING' },
        { student_user_id: dto.student_user_id, status: 'PARTIALLY_PAID' },
        { student_user_id: dto.student_user_id, status: 'OVERDUE' },
      ],
      order: { due_date: 'ASC' },
    });
    if (!activeDemand) throw new BadRequestException('No active fee demand found for this student');
    const original = Number(activeDemand.total_amount);
    activeDemand.total_amount = Number((original * (1 - discountPercent / 100)).toFixed(2));
    activeDemand.fee_breakup = {
      ...(activeDemand.fee_breakup ?? {}),
      scholarship_discount_percent: discountPercent,
      original_total_amount: original,
    };
    return this.demands.save(activeDemand);
  }

  async getPendingDues(studentUserId: string): Promise<FeeDemand[]> {
    const demands = await this.demands.find({
      where: { student_user_id: studentUserId },
      order: { due_date: 'ASC' },
    });
    return demands.filter((d) => {
      const status = String(d.status ?? '').toUpperCase();
      if (status === 'PAID' || status === 'WAIVED') return false;
      const total = Number(d.total_amount);
      const paid = Number(d.paid_amount);
      return total - paid > 0;
    });
  }

  async listFundingRequests(tenantId: string) {
    return this.demands.manager.query(
      `SELECT fr.*, g.project_title, u.name AS faculty_name, d.dept_name
       FROM project_funding_requests fr
       INNER JOIN faculty_project_guides g ON g.guide_id = fr.guide_id
       INNER JOIN users u ON u.user_id = fr.requested_by
       INNER JOIN departments d ON d.dept_id = u.dept_id
       WHERE fr.tenant_id = $1 AND fr.status IN ('APPROVED_HOD', 'TRANSFERRED')
       ORDER BY CASE fr.status WHEN 'TRANSFERRED' THEN 1 ELSE 0 END, fr.created_at DESC`,
      [tenantId]
    );
  }

  async transferFunding(requestId: string, accountantUserId: string, tenantId: string) {
    const queryRunner = this.demands.manager.connection.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const requestRows = await queryRunner.query(
        `UPDATE project_funding_requests
         SET status = 'TRANSFERRED', accountant_user_id = $1, updated_at = NOW()
         WHERE request_id = $2 AND tenant_id = $3 AND status = 'APPROVED_HOD'
         RETURNING *`,
        [accountantUserId, requestId, tenantId]
      );

      if (!requestRows.length) {
        throw new BadRequestException('Funding request not found or not approved by HOD');
      }

      const request = requestRows[0];

      await queryRunner.query(
        `UPDATE faculty_project_guides
         SET funding_allocated = COALESCE(funding_allocated, 0) + $1
         WHERE guide_id = $2 AND tenant_id = $3`,
        [request.amount, request.guide_id, tenantId]
      );

      await queryRunner.commitTransaction();

      // Trigger notifications concurrently
      this.notify.approvalRequired({
        tenantId,
        userId: request.requested_by,
        category: 'Funding',
        requestType: 'Fund Transfer',
        requesterName: 'Accounts Team',
        title: 'Funding Transferred',
        message: `₹${request.amount} has been transferred to your bank account for project funding.`,
        actionLink: '/faculty/projects',
      });
      if (request.hod_user_id) {
        this.notify.approvalRequired({
          tenantId,
          userId: request.hod_user_id,
          category: 'Funding',
          requestType: 'Fund Transfer',
          requesterName: 'Accounts Team',
          title: 'Funding Transferred',
          message: `Funding of ₹${request.amount} for faculty project has been transferred.`,
          actionLink: '/hod/dashboard',
        });
      }

      return request;
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
