import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HelpdeskTicket } from '../../../entities/helpdesk-ticket.entity';
import type { CreateTicketDto } from '../dto/create-ticket.dto';
import type { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import type { ITicketProvider } from './ticket-provider.interface';

@Injectable()
export class LocalTicketProvider implements ITicketProvider {
  readonly providerId = 'local-postgres';

  constructor(@InjectRepository(HelpdeskTicket) private tickets: Repository<HelpdeskTicket>) {}

  createTicket(studentUserId: string, dto: CreateTicketDto) {
    return this.tickets.save(
      this.tickets.create({
        student_user_id: studentUserId,
        ...dto,
        status: 'PENDING',
      }),
    );
  }

  listMyTickets(studentUserId: string) {
    return this.tickets.find({
      where: { student_user_id: studentUserId },
      order: { updated_at: 'DESC' },
    });
  }

  listTicketsForAssignee(assigneeUserId: string) {
    return this.tickets.find({
      where: { assigned_to_user_id: assigneeUserId },
      order: { updated_at: 'DESC' },
    });
  }

  async updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    const ticket = await this.tickets.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    ticket.status = dto.status;
    if (dto.assigned_to_user_id !== undefined) {
      ticket.assigned_to_user_id = dto.assigned_to_user_id;
    }
    return this.tickets.save(ticket);
  }

  async getTicketForStudent(ticketId: string, studentUserId: string) {
    const ticket = await this.tickets.findOne({ where: { ticket_id: ticketId } });
    if (!ticket) throw new NotFoundException('Ticket not found');
    if (ticket.student_user_id !== studentUserId) {
      throw new ForbiddenException('Not your ticket');
    }
    return ticket;
  }
}
