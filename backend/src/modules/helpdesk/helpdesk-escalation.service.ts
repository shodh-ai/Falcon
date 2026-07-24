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
  sla_deadline: Date | null;
  student_name: string;
};

/**
 * Production SLA escalation:
 * 1 Estate/COO (ops isolation)
 * 2 HOD / category owner
 * 3 VC only if still breached
 * 4 Chairman last resort
 * Uses sla_deadline from policies when present.
 */
@Injectable()
export class HelpdeskEscalationService {
  private readonly logger = new Logger(HelpdeskEscalationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
  ) {}

  @Cron('0 * * * *')
  async escalatePendingTickets() {
    try {
      await this.runEscalationPass();
    } catch (err) {
      this.logger.warn(
        `Helpdesk escalation skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async runEscalationPass() {
    const tickets = await this.dataSource.query<PendingTicket[]>(
      `SELECT t.ticket_id, COALESCE(t.tenant_id, u.tenant_id) AS tenant_id,
              t.student_user_id, t.subject, t.category, t.assigned_to_user_id,
              COALESCE(t.escalation_level, 0) AS escalation_level, t.created_at,
              t.sla_deadline, u.name AS student_name
       FROM helpdesk_tickets t
       JOIN users u ON u.user_id = t.student_user_id
       WHERE t.status IN ('PENDING', 'IN_PROGRESS')
         AND t.sla_paused_at IS NULL
         AND (
           (t.sla_deadline IS NOT NULL AND t.sla_deadline < NOW())
           OR (t.sla_deadline IS NULL AND t.created_at < NOW() - INTERVAL '24 hours')
         )`,
    );

    for (const ticket of tickets) {
      const hoursOpen =
        (Date.now() - new Date(ticket.created_at).getTime()) / (1000 * 60 * 60);
      const breached =
        ticket.sla_deadline != null
          ? new Date(ticket.sla_deadline).getTime() < Date.now()
          : hoursOpen >= 24;

      if (!breached) continue;

      let targetLevel = 1; // Estate / COO first
      if (hoursOpen >= 36) targetLevel = 2;
      if (hoursOpen >= 60) targetLevel = 3; // VC
      if (hoursOpen >= 84) targetLevel = 4; // Chairman last

      if (targetLevel <= ticket.escalation_level) continue;

      const assignee = await this.resolveEscalationAssignee(
        ticket.tenant_id,
        ticket.student_user_id,
        ticket.category,
        targetLevel,
      );
      if (!assignee) continue;

      await this.dataSource.query(
        `UPDATE helpdesk_tickets
         SET assigned_to_user_id = $2, escalation_level = $3, updated_at = NOW()
         WHERE ticket_id = $1`,
        [ticket.ticket_id, assignee.userId, targetLevel],
      );

      await this.dataSource.query(
        `INSERT INTO helpdesk_ticket_events (ticket_id, event_type, actor_user_id, payload)
         VALUES ($1, 'ESCALATED', NULL, $2::jsonb)`,
        [
          ticket.ticket_id,
          JSON.stringify({
            level: targetLevel,
            assignee: assignee.userId,
            hours_open: Math.floor(hoursOpen),
          }),
        ],
      );

      const levelLabels = [
        'None',
        'Estate/COO',
        'HOD/Category Owner',
        'Vice Chancellor',
        'Chairman (last resort)',
      ];
      this.notify.approvalRequired({
        tenantId: ticket.tenant_id,
        userId: assignee.userId,
        title: `SLA breach: ${levelLabels[targetLevel]} (${Math.floor(hoursOpen)}h)`,
        message: `${ticket.student_name}'s ticket "${ticket.subject}" escalated to ${levelLabels[targetLevel]}.`,
        actionLink:
          targetLevel <= 2
            ? `/operations/esm`
            : `/helpdesk/tickets/${ticket.ticket_id}`,
        category: 'HELPDESK',
        requestType: 'SLA_ESCALATION',
      });

      this.logger.log(
        `Escalated ticket ${ticket.ticket_id} to level ${targetLevel} after ${Math.floor(hoursOpen)}h`,
      );
    }
  }

  private async resolveByRole(tenantId: string, roleName: string) {
    const rows = await this.dataSource.query<
      Array<{ user_id: string; name: string; official_email: string }>
    >(
      `SELECT u.user_id, u.name, u.official_email
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.is_active = true
         AND lower(r.role_name) = lower($2)
       LIMIT 1`,
      [tenantId, roleName],
    );
    if (!rows[0]) return null;
    return {
      userId: rows[0].user_id,
      name: rows[0].name,
      email: rows[0].official_email ?? '',
      routeReason: `ROLE_${roleName}`,
    };
  }

  private async resolveEscalationAssignee(
    tenantId: string,
    studentUserId: string,
    category: string,
    level: number,
  ) {
    try {
      if (level === 1) {
        if (category === 'FACILITIES' || category === 'HOSTEL' || category === 'IT') {
          return (
            (await this.resolveByRole(tenantId, 'EstateOfficer')) ??
            (await this.resolveByRole(tenantId, 'COO')) ??
            this.workflowRouting.resolveUserByEmail(
              process.env.FALLBACK_COO_EMAIL ?? 'coo@sgvu.edu.in',
              tenantId,
              'HELPDESK_ESCALATION_COO',
            )
          );
        }
        return this.workflowRouting.getStudentProctor(studentUserId);
      }
      if (level === 2) {
        return (
          (await this.resolveByRole(tenantId, 'COO')) ??
          this.workflowRouting.resolveUserByEmail(
            process.env.FALLBACK_HOD_EMAIL ?? 'hod@sgvu.edu.in',
            tenantId,
            'HELPDESK_ESCALATION_HOD',
          )
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
