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

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private emailTransporter: nodemailer.Transporter;

  constructor(
    @InjectRepository(TaskAssignment)
    private taskAssignmentRepository: Repository<TaskAssignment>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private tasksService: TasksService,
    private configService: ConfigService,
  ) {
    this.initializeEmailTransporter();
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
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      const assignments = await this.tasksService.distributeTasksForMonth(currentMonth);
      
      this.logger.log(`Successfully distributed ${assignments.length} task assignments for ${currentMonth}`);
      
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
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      const pendingAssignments = await this.taskAssignmentRepository.find({
        where: { status: 'Pending' },
        relations: ['assigned_user', 'task'],
      });

      const tasksForCurrentMonth = pendingAssignments.filter(
        assignment => assignment.task.month === currentMonth
      );

      this.logger.log(`Found ${tasksForCurrentMonth.length} pending tasks for ${currentMonth}`);

      for (const assignment of tasksForCurrentMonth) {
        if (assignment.assigned_user) {
          await this.sendReminderEmail(
            assignment.assigned_user.email,
            assignment.assigned_user.name,
            assignment.task.task_name,
            assignment.due_date,
          );
          
          // Add delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      this.logger.log(`Reminder emails sent for ${tasksForCurrentMonth.length} pending tasks`);
    } catch (error) {
      this.logger.error('Error during reminder email process', error);
    }
  }

  // Defaulter Generator - Runs on the 30th of every month at 5:00 PM
  @Cron('0 17 30 * *')
  async generateDefaulterReport(month?: string) {
    this.logger.log('Generating defaulter report...');
    
    try {
      const currentMonth = month || new Date().toLocaleString('en-US', { month: 'long' });
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
      const report = this.generateDefaulterReportContent(overdueAssignments, currentMonth);
      
      // Send report to IQAC and Top Management
      const iqacUsers = await this.userRepository.find({
        where: { is_active: true },
        relations: ['role'],
      });
      
      const managementUsers = iqacUsers.filter(
        user => user.role?.role_name === 'IQAC' || user.role?.role_name === 'President'
      );

      for (const user of managementUsers) {
        await this.sendNotificationEmail(
          user.email,
          `Monthly Defaulter Report - ${currentMonth}`,
          report,
        );
        
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      this.logger.log(`Defaulter report generated and sent. Total defaulters: ${overdueAssignments.length}`);
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
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
    
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
    const frontendUrl = this.configService.get('FRONTEND_URL') || 'http://localhost:3000';
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

  private generateDefaulterReportContent(overdueAssignments: TaskAssignment[], month: string): string {
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
      assignment => assignment.task.month === month
    );

    for (const assignment of tasksForMonth) {
      if (assignment.assigned_user) {
        await this.sendReminderEmail(
          assignment.assigned_user.email,
          assignment.assigned_user.name,
          assignment.task.task_name,
          assignment.due_date,
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { sent: tasksForMonth.length };
  }

  async manualGenerateReport(month: string) {
    this.logger.log(`Manual defaulter report triggered for ${month}`);
    return this.generateDefaulterReport(month);
  }
}
