import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { WorkflowRoutingService } from '../../core/workflow/workflow-routing.service';

type PendingTicket = {
  ticket_id: string;
  tenant_id: string;
  student_user_id: string;
  subject: string;
  category: string;
  assigned_to_user_id: string | null;
  escalation_level: number;
  created_at: Date;
  student_name: string;
};

@Injectable()
export class HelpdeskEscalationService {
  private readonly logger = new Logger(HelpdeskEscalationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
  ) {}

  /** Hourly SLA escalation pipeline for unresolved helpdesk tickets. */
  @Cron('0 * * * *')
  async escalatePendingTickets() {
    const tickets = await this.dataSource.query<PendingTicket[]>(
      `SELECT t.ticket_id, COALESCE(t.tenant_id, u.tenant_id) AS tenant_id,
              t.student_user_id, t.subject, t.category, t.assigned_to_user_id,
              COALESCE(t.escalation_level, 0) AS escalation_level, t.created_at,
              u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE t.status = 'PENDING'`,
    );

    for (const ticket of tickets) {
      const hoursOpen = (Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60);
      let targetLevel = 0;
      if (hoursOpen >= 72) targetLevel = 3;
      else if (hoursOpen >= 48) targetLevel = 2;
      else if (hoursOpen >= 24) targetLevel = 1;

      if (targetLevel <= ticket.escalation_level) continue;

      const assignee = await this.resolveEscalationAssignee(ticket.tenant_id, ticket.student_user_id, targetLevel);
      if (!assignee) continue;

      await this.dataSource.query(
        `UPDATE helpdesk_tickets
         SET assigned_to_user_id = $2, escalation_level = $3, updated_at = NOW()
         WHERE ticket_id = $1`,
        [ticket.ticket_id, assignee.userId, targetLevel],
      );

      const levelLabels = ['Faculty/Proctor', 'HOD', 'Vice Chancellor', 'Leadership/Chairman'];
      this.notify.approvalRequired({
        tenantId: ticket.tenant_id,
        userId: assignee.userId,
        title: `Red Alert: Helpdesk SLA breach (${Math.floor(hoursOpen)}h)`,
        message: `${ticket.student_name}'s ticket "${ticket.subject}" escalated to ${levelLabels[targetLevel]}.`,
        actionLink: `/helpdesk/tickets/${ticket.ticket_id}`,
        category: 'HELPDESK',
        requestType: 'SLA_ESCALATION',
      });

      this.logger.log(
        `Escalated ticket ${ticket.ticket_id} to level ${targetLevel} (${levelLabels[targetLevel]}) after ${Math.floor(hoursOpen)}h`,
      );
    }
  }

  private async resolveEscalationAssignee(tenantId: string, studentUserId: string, level: number) {
    try {
      if (level === 1) {
        return this.workflowRouting.getStudentProctor(studentUserId);
      }
      if (level === 2) {
        return this.workflowRouting.resolveUserByEmail(
          process.env.FALLBACK_HOD_EMAIL ?? 'hod@sgvu.edu.in',
          tenantId,
          'HELPDESK_ESCALATION_HOD',
        );
      }
      if (level === 3) {
        return this.workflowRouting.resolveUserByEmail(
          process.env.FALLBACK_VC_EMAIL ?? 'vc@sgvu.edu.in',
          tenantId,
          'HELPDESK_ESCALATION_VC',
        );
      }
      return this.workflowRouting.resolveUserByEmail(
        process.env.FALLBACK_CHAIRMAN_EMAIL ?? 'chairman@sgvu.edu.in',
        tenantId,
        'HELPDESK_ESCALATION_LEADERSHIP',
      );
    } catch {
      return null;
    }
  }
}
