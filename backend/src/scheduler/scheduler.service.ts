import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TaskAssignment } from '../entities/task-assignment.entity';
import { TaskMaster } from '../entities/task-master.entity';
import { User } from '../entities/user.entity';
import { TasksService } from '../tasks/tasks.service';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { wrapFalconEmailHtml } from '../common/email/falcon-email.template';
import { LeadershipService } from '../modules/leadership/leadership.service';
import { DepartmentScoreService } from '../modules/leadership/department-score.service';
import { FinancialGeminiService } from '../modules/leadership-ai/financial-gemini.service';
import { OwnerDailyBrief } from '../entities/owner-daily-brief.entity';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(TaskAssignment)
    private taskAssignmentRepository: Repository<TaskAssignment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(OwnerDailyBrief)
    private ownerBriefRepository: Repository<OwnerDailyBrief>,
    private tasksService: TasksService,
    private configService: ConfigService,
    private leadershipService: LeadershipService,
    private departmentScoreService: DepartmentScoreService,
    private financialGemini: FinancialGeminiService,
  ) {
    this.initializeEmailTransporter();
  }

  /** Owner vital-sign ratios — 5:00 AM */
  @Cron('0 5 * * *')
  async computeOwnerFinancialRatios() {
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    const today = new Date().toISOString().slice(0, 10);
    this.logger.log('Computing owner financial ratios…');

    try {
      const [
        marketingRows,
        revenueRows,
        payrollRows,
        demandedRows,
        collectedRows,
        enrolledRows,
      ] = await Promise.all([
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(SUM(jl.debit_amount), 0)::numeric AS total
             FROM finance_journal_lines jl
             JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
             WHERE je.tenant_id = $1
               AND je.deleted_at IS NULL
               AND jl.deleted_at IS NULL
               AND je.entry_date >= (CURRENT_DATE - INTERVAL '30 days')
               AND jl.ledger_category LIKE 'MARKETING_%'`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0)::numeric AS total
             FROM finance_journal_lines jl
             JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
             WHERE je.tenant_id = $1
               AND je.deleted_at IS NULL
               AND jl.deleted_at IS NULL
               AND je.entry_date >= (CURRENT_DATE - INTERVAL '30 days')
               AND jl.ledger_category LIKE 'TUITION_%'`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(SUM(jl.debit_amount), 0)::numeric AS total
             FROM finance_journal_lines jl
             JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
             WHERE je.tenant_id = $1
               AND je.deleted_at IS NULL
               AND jl.deleted_at IS NULL
               AND je.entry_date >= (CURRENT_DATE - INTERVAL '30 days')
               AND jl.ledger_category LIKE 'PAYROLL_%'`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(SUM(total_amount), 0)::numeric AS total
             FROM finance_fee_demands d
             JOIN users u ON u.user_id = d.student_user_id
             WHERE u.tenant_id = $1 AND d.deleted_at IS NULL`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(SUM(paid_amount), 0)::numeric AS total
             FROM finance_fee_demands d
             JOIN users u ON u.user_id = d.student_user_id
             WHERE u.tenant_id = $1 AND d.deleted_at IS NULL`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
        this.ownerBriefRepository.manager
          .query(
            `SELECT COALESCE(COUNT(DISTINCT t.student_user_id), 0)::int AS total
             FROM finance_transactions t
             JOIN users u ON u.user_id = t.student_user_id
             WHERE u.tenant_id = $1
               AND t.deleted_at IS NULL
               AND t.status = 'SUCCESS'
               AND t.created_at >= NOW() - INTERVAL '30 days'`,
            [tenantId],
          )
          .catch(() => [{ total: 0 }]),
      ]);

      const marketingSpend = Number(marketingRows[0]?.total ?? 0);
      const revenue = Number(revenueRows[0]?.total ?? 0);
      const payroll = Number(payrollRows[0]?.total ?? 0);
      const demanded = Number(demandedRows[0]?.total ?? 0);
      const collected = Number(collectedRows[0]?.total ?? 0);
      const newEnrolled = Number(enrolledRows[0]?.total ?? 0);

      const cac = newEnrolled > 0 ? marketingSpend / newEnrolled : null;
      const facultyRoi = payroll > 0 ? revenue / payroll : null;

      const opexRows = await this.ownerBriefRepository.manager
        .query(
          `SELECT COALESCE(SUM(jl.debit_amount), 0)::numeric AS total
           FROM finance_journal_lines jl
           JOIN finance_journal_entries je ON je.journal_entry_id = jl.journal_entry_id
           WHERE je.tenant_id = $1
             AND je.deleted_at IS NULL
             AND jl.deleted_at IS NULL
             AND je.entry_date >= (CURRENT_DATE - INTERVAL '30 days')
             AND (
               jl.ledger_category LIKE 'ELECTRICITY_%'
               OR jl.ledger_category LIKE 'MAINTENANCE_%'
               OR jl.ledger_category LIKE 'IT_%'
               OR jl.ledger_category LIKE 'ADMIN_%'
               OR jl.ledger_category LIKE 'OPERATIONS_%'
             )`,
          [tenantId],
        )
        .catch(() => [{ total: 0 }]);
      const opex = Number(opexRows[0]?.total ?? 0);
      const opexRatio = revenue > 0 ? opex / revenue : null;

      const feeCollectionEfficiency =
        demanded > 0 ? collected / demanded : null;

      await this.ownerBriefRepository.manager.query(
        `INSERT INTO owner_financial_ratios_daily
           (tenant_id, ratio_date, cac, faculty_roi, opex_ratio, fee_collection_efficiency, sources)
         VALUES ($1, $2::date, $3, $4, $5, $6, $7::jsonb)
         ON CONFLICT (tenant_id, ratio_date)
         DO UPDATE SET
           cac = EXCLUDED.cac,
           faculty_roi = EXCLUDED.faculty_roi,
           opex_ratio = EXCLUDED.opex_ratio,
           fee_collection_efficiency = EXCLUDED.fee_collection_efficiency,
           sources = EXCLUDED.sources,
           generated_at = NOW()`,
        [
          tenantId,
          today,
          cac,
          facultyRoi,
          opexRatio,
          feeCollectionEfficiency,
          JSON.stringify({
            window_days: 30,
            marketing_spend: marketingSpend,
            tuition_revenue: revenue,
            payroll_expense: payroll,
            opex,
            fee_demanded: demanded,
            fee_collected: collected,
            new_enrolled_proxy: newEnrolled,
          }),
        ],
      );

      this.logger.log('Owner financial ratios computed');
    } catch (error) {
      this.logger.error('Owner ratios cron failed', error);
    }
  }

  /** Falcon Owner’s Brief — 8:00 AM daily */
  @Cron('0 8 * * *')
  async generateOwnersBrief() {
    this.logger.log('Generating Falcon Owner’s Brief…');
    const tenantId = 'a0000000-0000-4000-8000-000000000001';
    const today = new Date().toISOString().slice(0, 10);

    try {
      const yesterday = new Date(Date.now() - 1000 * 60 * 60 * 24)
        .toISOString()
        .slice(0, 10);

      const [collectedRows, payrollRows, placementsRows] = await Promise.all([
        this.ownerBriefRepository.manager.query(
          `SELECT COALESCE(SUM(amount), 0)::numeric AS total
           FROM finance_transactions
           WHERE deleted_at IS NULL
             AND status = 'SUCCESS'
             AND created_at::date = $2::date
             AND student_user_id IN (SELECT user_id FROM users WHERE tenant_id = $1)`,
          [tenantId, yesterday],
        ),
        this.ownerBriefRepository.manager.query(
          `SELECT COALESCE(SUM(net_pay), 0)::numeric AS total
           FROM staff_payslips
           WHERE tenant_id = $1
             AND generated_at::date >= (CURRENT_DATE - INTERVAL '7 days')`,
          [tenantId],
        ),
        this.ownerBriefRepository.manager.query(
          `SELECT COALESCE(COUNT(*), 0)::int AS hires
           FROM placement_job_applications
           WHERE status IN ('ACCEPTED', 'OFFERED')
             AND created_at::date = $2::date
             AND student_user_id IN (SELECT user_id FROM users WHERE tenant_id = $1)`,
          [tenantId, yesterday],
        ),
      ]);

      const collected = Number(collectedRows[0]?.total ?? 0);
      const payrollWeek = Number(payrollRows[0]?.total ?? 0);
      const hires = Number(placementsRows[0]?.hires ?? 0);

      const bullets = [
        `Cash flow update: ₹${(collected / 10000000).toFixed(2)} Cr collected yesterday (${yesterday}).`,
        `Payroll watch: ₹${(payrollWeek / 10000000).toFixed(2)} Cr payslips generated in the last 7 days.`,
        hires > 0
          ? `Placements: ${hires} offers accepted yesterday.`
          : `Placements: No offer acceptances recorded yesterday — monitor pipeline health.`,
        `System integrity: Ledger tagging is enforced — any untagged money movement is blocked from posting.`,
      ];

      await this.ownerBriefRepository
        .createQueryBuilder()
        .insert()
        .into(OwnerDailyBrief)
        .values({
          tenant_id: tenantId,
          brief_date: today,
          bullets,
          sources: {
            collected_yesterday: collected,
            payroll_week: payrollWeek,
            hires_yesterday: hires,
          },
        })
        .orUpdate(
          ['bullets', 'sources', 'generated_at'],
          ['tenant_id', 'brief_date'],
        )
        .execute();

      this.logger.log('Falcon Owner’s Brief generated');
    } catch (error) {
      this.logger.error('Owner brief job failed', error);
    }
  }

  /** Nightly SLA escalation scan — midnight */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processHelpdeskSlaEscalations() {
    this.logger.log('Processing helpdesk SLA escalations…');
    try {
      await this.leadershipService.processSlaEscalations();
    } catch (error) {
      this.logger.error('SLA escalation job failed', error);
    }
  }

  /** Nightly executive analytics refresh — 2:00 AM */
  @Cron('0 2 * * *')
  async refreshExecutiveMaterializedViews() {
    this.logger.log('Refreshing executive materialized views…');
    try {
      await this.leadershipService.refreshMaterializedViews();
      await this.leadershipService.seedLiveMetrics();
      this.logger.log('Executive materialized views refreshed');
    } catch (error) {
      this.logger.error('Executive MV refresh failed', error);
    }
  }

  /** Cash flow forecast — 3:00 AM */
  @Cron('0 3 * * *')
  async generateCashFlowForecasts() {
    this.logger.log('Generating cash flow forecasts…');
    try {
      await this.financialGemini.generateForecasts(
        'a0000000-0000-4000-8000-000000000001',
      );
    } catch (error) {
      this.logger.error('Cash flow forecast failed', error);
    }
  }

  /** Department financial scores — 4:00 AM */
  @Cron('0 4 * * *')
  async computeDepartmentFinancialScores() {
    this.logger.log('Computing department financial scores…');
    try {
      await this.departmentScoreService.computeDailyScores();
      await this.departmentScoreService.updateVendorRiskScores();
    } catch (error) {
      this.logger.error('Department score computation failed', error);
    }
  }

  private initializeEmailTransporter() {
    this.emailTransporter = nodemailer.createTransport({
      host: this.configService.get('EMAIL_HOST'),
      port: parseInt(this.configService.get('EMAIL_PORT') || '587'),
      secure: false,
      auth: {
        user: this.configService.get('EMAIL_USER'),
        pass: this.configService.get('EMAIL_PASSWORD'),
      },
    });
  }

  // Task Distributor - Runs on the 1st of every month at 12:00 AM
  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async distributeMonthlyTasks() {
    this.logger.log('Starting monthly task distribution...');

    try {
      const currentMonth = new Date().toLocaleString('en-US', {
        month: 'long',
      });
      const assignments =
        await this.tasksService.distributeTasksForMonth(currentMonth);

      this.logger.log(
        `Successfully distributed ${assignments.length} task assignments for ${currentMonth}`,
      );

      // Send notification to IQAC
      await this.sendNotificationEmail(
        this.configService.get('EMAIL_FROM') || 'noreply@mygyanvihar.org',
        'Task Distribution Completed',
        `Monthly task distribution for ${currentMonth} has been completed. Total assignments: ${assignments.length}`,
      );
    } catch (error) {
      this.logger.error('Error during monthly task distribution', error);
    }
  }

  // Reminder Emailer - Runs on the 15th of every month at 9:00 AM
  @Cron('0 9 15 * *')
  async sendReminderEmails() {
    this.logger.log('Starting reminder email process...');

    try {
      const currentMonth = new Date().toLocaleString('en-US', {
        month: 'long',
      });
      const pendingAssignments = await this.taskAssignmentRepository.find({
        where: { status: 'Pending' },
        relations: ['assigned_user', 'task'],
      });

      const tasksForCurrentMonth = pendingAssignments.filter(
        (assignment) => assignment.task.month === currentMonth,
      );

      this.logger.log(
        `Found ${tasksForCurrentMonth.length} pending tasks for ${currentMonth}`,
      );

      for (const assignment of tasksForCurrentMonth) {
        if (assignment.assigned_user) {
          await this.sendReminderEmail(
            assignment.assigned_user.email,
            assignment.assigned_user.name,
            assignment.task.task_name,
            assignment.due_date,
          );

          // Add delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      this.logger.log(
        `Reminder emails sent for ${tasksForCurrentMonth.length} pending tasks`,
      );
    } catch (error) {
      this.logger.error('Error during reminder email process', error);
    }
  }

  // Defaulter Generator - Runs on the 30th of every month at 5:00 PM
  @Cron('0 17 30 * *')
  async generateDefaulterReport(month?: string) {
    this.logger.log('Generating defaulter report...');

    try {
      const currentMonth =
        month || new Date().toLocaleString('en-US', { month: 'long' });
      const overdueAssignments = await this.taskAssignmentRepository
        .createQueryBuilder('assignment')
        .leftJoinAndSelect('assignment.assigned_user', 'user')
        .leftJoinAndSelect('user.department', 'department')
        .leftJoinAndSelect('assignment.task', 'task')
        .leftJoinAndSelect('task.role', 'role')
        .where('assignment.status = :status', { status: 'Pending' })
        .andWhere('task.month = :month', { month: currentMonth })
        .andWhere('assignment.due_date < :now', { now: new Date() })
        .getMany();

      // Update status to Overdue
      for (const assignment of overdueAssignments) {
        assignment.status = 'Overdue';
        await this.taskAssignmentRepository.save(assignment);
      }

      // Generate report
      const report = this.generateDefaulterReportContent(
        overdueAssignments,
        currentMonth,
      );

      // Send report to IQAC and Top Management
      const iqacUsers = await this.userRepository.find({
        where: { is_active: true },
        relations: ['role'],
      });

      const managementUsers = iqacUsers.filter(
        (user) =>
          user.role?.role_name === 'IQAC' ||
          user.role?.role_name === 'President',
      );

      for (const user of managementUsers) {
        await this.sendNotificationEmail(
          user.email,
          `Monthly Defaulter Report - ${currentMonth}`,
          report,
        );

        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      this.logger.log(
        `Defaulter report generated and sent. Total defaulters: ${overdueAssignments.length}`,
      );
    } catch (error) {
      this.logger.error('Error during defaulter report generation', error);
    }
  }

  private async sendReminderEmail(
    email: string,
    userName: string,
    taskName: string,
    dueDate: Date,
  ) {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';

    const bodyHtml = `
        <h2 style="margin-top:0;color:#08234a;">Falcon Core Reminder</h2>
        <p>Dear ${userName},</p>
        <p>This is a reminder that you have a pending Falcon Core task that needs to be completed:</p>
        <p><strong>Task:</strong> ${taskName}</p>
        <p><strong>Due Date:</strong> ${dueDate ? new Date(dueDate).toLocaleDateString() : 'N/A'}</p>
        <p>Please sign in to your Falcon Workspace to complete this task:</p>
        <p><a href="${frontendUrl}" style="display:inline-block;background:#08234a;color:#d6b65d;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600;">Open Falcon Dashboard</a></p>
        <p style="margin-bottom:0;">Best regards,<br>SGVU IQAC Team</p>
      `;

    const mailOptions = {
      from: this.configService.get('EMAIL_FROM') || 'noreply@mygyanvihar.org',
      to: email,
      subject: 'Falcon Reminder: Pending Task Submission',
      html: wrapFalconEmailHtml(bodyHtml, frontendUrl),
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  private async sendNotificationEmail(
    to: string,
    subject: string,
    content: string,
  ) {
    const frontendUrl =
      this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    const bodyHtml = `
        <h2 style="margin-top:0;color:#08234a;">${subject}</h2>
        <div>${content}</div>
        <p style="margin-bottom:0;">Best regards,<br>Falcon Campus OS</p>
      `;

    const mailOptions = {
      from: this.configService.get('EMAIL_FROM'),
      to,
      subject: `[Falcon] ${subject}`,
      html: wrapFalconEmailHtml(bodyHtml, frontendUrl),
    };

    await this.emailTransporter.sendMail(mailOptions);
  }

  private generateDefaulterReportContent(
    overdueAssignments: TaskAssignment[],
    month: string,
  ): string {
    let report = '';
    report += `<p>Total Defaulters: ${overdueAssignments.length}</p>`;
    report += `<table border="1" cellpadding="5" cellspacing="0">`;
    report += `<tr><th>Name</th><th>Email</th><th>Department</th><th>Role</th><th>Task</th><th>Due Date</th></tr>`;

    for (const assignment of overdueAssignments) {
      const user = assignment.assigned_user;
      const task = assignment.task;

      report += `<tr>`;
      report += `<td>${user?.name || 'N/A'}</td>`;
      report += `<td>${user?.email || 'N/A'}</td>`;
      report += `<td>${user?.department?.dept_name || 'N/A'}</td>`;
      report += `<td>${task?.role?.role_name || 'N/A'}</td>`;
      report += `<td>${task?.task_name || 'N/A'}</td>`;
      report += `<td>${assignment.due_date ? new Date(assignment.due_date).toLocaleDateString() : 'N/A'}</td>`;
      report += `</tr>`;
    }

    report += `</table>`;
    report += `<p>Please take necessary action to ensure timely completion of tasks.</p>`;

    return report;
  }

  // Manual trigger for testing
  async manualDistributeTasks(month: string) {
    this.logger.log(`Manual task distribution triggered for ${month}`);
    return this.tasksService.distributeTasksForMonth(month);
  }

  async manualSendReminders(month: string) {
    this.logger.log(`Manual reminder emails triggered for ${month}`);
    const pendingAssignments = await this.taskAssignmentRepository.find({
      where: { status: 'Pending' },
      relations: ['assigned_user', 'task'],
    });

    const tasksForMonth = pendingAssignments.filter(
      (assignment) => assignment.task.month === month,
    );

    for (const assignment of tasksForMonth) {
      if (assignment.assigned_user) {
        await this.sendReminderEmail(
          assignment.assigned_user.email,
          assignment.assigned_user.name,
          assignment.task.task_name,
          assignment.due_date,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return { sent: tasksForMonth.length };
  }

  async manualGenerateReport(month: string) {
    this.logger.log(`Manual defaulter report triggered for ${month}`);
    return this.generateDefaulterReport(month);
  }
}
