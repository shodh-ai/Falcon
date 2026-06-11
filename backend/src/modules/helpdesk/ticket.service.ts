import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import {
  TICKET_PROVIDER,
  type ITicketProvider,
} from './providers/ticket-provider.interface';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import {
  WorkflowRoutingService,
  type RoutedApprover,
} from '../../core/workflow/workflow-routing.service';
import { WorkflowNotificationService } from '../../core/workflow/workflow-notification.service';
import { User } from '../../entities/user.entity';
import { assertNoPendingRow } from '../../common/validators/pending-request.util';

@Injectable()
export class TicketService {
  constructor(
    @Inject(TICKET_PROVIDER)
    private readonly ticketProvider: ITicketProvider,
    @InjectRepository(HelpdeskTicket)
    private tickets: Repository<HelpdeskTicket>,
    private readonly notify: NotificationEmitterService,
    private readonly workflowRouting: WorkflowRoutingService,
    private readonly workflowNotify: WorkflowNotificationService,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async createTicket(studentUserId: string, dto: CreateTicketDto) {
    const student = await this.users.findOne({ where: { user_id: studentUserId } });
    const tenantId = student?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';

    if (dto.category !== 'MENTORSHIP') {
      await assertNoPendingRow(this.tickets, {
        student_user_id: studentUserId,
        category: dto.category,
        status: 'PENDING',
      });
    }

    const assignee: RoutedApprover = dto.assigned_to_user_id
      ? {
          userId: dto.assigned_to_user_id,
          name: 'Mentor',
          email: '',
          routeReason: 'MENTORSHIP_DIRECT',
        }
      : await this.workflowRouting.getHelpdeskAssignee(studentUserId, tenantId, dto.category);

    const { assigned_to_user_id: _omit, ...ticketFields } = dto;

    const ticketRef = await this.nextTicketRef();

    const ticket = await this.tickets.save(
      this.tickets.create({
        student_user_id: studentUserId,
        ...ticketFields,
        assigned_to_user_id: assignee.userId,
        status: 'PENDING',
        tenant_id: tenantId,
        ticket_ref: ticketRef,
        sla_deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
      } as Partial<HelpdeskTicket>),
    );

    this.workflowNotify.notifyApprover({
      tenantId,
      approver: assignee,
      title: `Helpdesk: ${dto.subject}`,
      message: `${student?.name ?? 'Student'} opened a ${dto.category} ticket.`,
      actionLink: `/helpdesk/tickets/${ticket.ticket_id}`,
      category: 'HELPDESK',
      requesterName: student?.name,
    });

    return ticket;
  }

  private async nextTicketRef(): Promise<string> {
    const rows = await this.tickets.manager.query<Array<{ n: string }>>(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(ticket_ref FROM 5) AS INT)), 0) + 1 AS n
       FROM helpdesk_tickets
       WHERE ticket_ref ~ '^TKT-[0-9]+$'`,
    );
    const seq = Number(rows[0]?.n ?? 1);
    return `TKT-${String(seq).padStart(4, '0')}`;
  }

  async getTicketByRef(
    ticketRef: string,
    actorUserId: string,
    actorRole: string,
    tenantId: string,
  ) {
    const rows = await this.tickets.manager.query<Array<Record<string, unknown>>>(
      `SELECT t.ticket_id, t.ticket_ref, t.category, t.subject, t.description, t.status,
              t.student_user_id, t.assigned_to_user_id, t.conversation, t.created_at,
              su.name AS student_name, au.name AS assigned_to_name
       FROM helpdesk_tickets t
       JOIN users su ON su.user_id = t.student_user_id
       LEFT JOIN users au ON au.user_id = t.assigned_to_user_id
       WHERE UPPER(t.ticket_ref) = UPPER($1)
         AND COALESCE(t.tenant_id, su.tenant_id) = $2
       LIMIT 1`,
      [ticketRef, tenantId],
    );
    if (!rows.length) throw new NotFoundException('Ticket not found');

    const t = rows[0];
    const role = actorRole.trim().toLowerCase();
    const isOwner = t.student_user_id === actorUserId;
    const isAssignee = t.assigned_to_user_id === actorUserId;
    const isAdmin = [
      'superadmin',
      'registrar',
      'accountant',
      'warden',
      'hod',
      'dean',
      'faculty',
      'chairman',
      'president',
      'hr',
      'hradmin',
    ].includes(role);

    if (['student', 'applicant'].includes(role) && !isOwner) {
      throw new ForbiddenException('You can only view your own tickets');
    }
    if (!isOwner && !isAssignee && !isAdmin) {
      throw new ForbiddenException('You are not allowed to view this ticket');
    }

    return t;
  }

  listMyTickets(studentUserId: string) {
    return this.ticketProvider.listMyTickets(studentUserId);
  }

  listTicketsForAssignee(assigneeUserId: string) {
    return this.ticketProvider.listTicketsForAssignee(assigneeUserId);
  }

  async listProfileCorrectionTickets(tenantId: string, limit = 20) {
    return this.tickets
      .createQueryBuilder('t')
      .innerJoin('users', 'u', 'u.user_id = t.student_user_id')
      .where('t.status = :status', { status: 'PENDING' })
      .andWhere('u.tenant_id = :tenantId', { tenantId })
      .andWhere(
        `(t.category = 'STUDENT_PROFILE' OR (t.category = 'ACADEMICS' AND t.subject ILIKE :profileHint))`,
        { profileHint: '%profile%' },
      )
      .orderBy('t.created_at', 'DESC')
      .take(limit)
      .getMany();
  }

  updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    return this.ticketProvider.updateStatus(ticketId, dto);
  }

  async addMessage(ticketId: string, actorUserId: string, actorRole: string, message: string) {
    const ticket = await this.tickets.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    const isStudentOwner = ticket.student_user_id === actorUserId;
    const isAdminActor = [
      'SuperAdmin',
      'Registrar',
      'Accountant',
      'Warden',
      'HOD',
      'Dean',
      'Faculty',
    ].includes(actorRole);
    if (!isStudentOwner && !isAdminActor) {
      throw new ForbiddenException('You are not allowed to post messages in this ticket');
    }

    const conversation = ticket.conversation ?? [];
    conversation.push({
      sender_user_id: actorUserId,
      sender_role: actorRole,
      message,
      sent_at: new Date().toISOString(),
    });
    ticket.conversation = conversation;
    const saved = await this.tickets.save(ticket);

    if (isAdminActor && !isStudentOwner && ticket.category !== 'MENTORSHIP') {
      const student = await this.tickets.manager.query<Array<{ tenant_id: string }>>(
        `SELECT tenant_id FROM users WHERE user_id = $1 LIMIT 1`,
        [ticket.student_user_id],
      );
      const tenantId = student[0]?.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
      this.notify.ticketReply({
        tenantId,
        userId: ticket.student_user_id,
        ticketId: ticket.ticket_id,
        subject: ticket.subject,
      });
    }

    return saved;
  }
}
