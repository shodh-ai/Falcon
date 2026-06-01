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

@Injectable()
export class TicketService {
  constructor(
    @Inject(TICKET_PROVIDER)
    private readonly ticketProvider: ITicketProvider,
    @InjectRepository(HelpdeskTicket)
    private tickets: Repository<HelpdeskTicket>,
  ) {}

  createTicket(studentUserId: string, dto: CreateTicketDto) {
    return this.ticketProvider.createTicket(studentUserId, dto);
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
    return this.tickets.save(ticket);
  }
}
