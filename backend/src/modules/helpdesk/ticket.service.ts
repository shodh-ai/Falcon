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

    const ticket = await this.tickets.save(
      this.tickets.create({
        student_user_id: studentUserId,
        ...ticketFields,
        assigned_to_user_id: assignee.userId,
        status: 'PENDING',
      }),
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

  listMyTickets(studentUserId: string) {
    return this.ticketProvider.listMyTickets(studentUserId);
  }

  listTicketsForAssignee(assigneeUserId: string) {
    return this.ticketProvider.listTicketsForAssignee(assigneeUserId);
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
