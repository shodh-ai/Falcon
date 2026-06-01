import type { HelpdeskTicket } from '../../../entities/helpdesk-ticket.entity';
import type { CreateTicketDto } from '../dto/create-ticket.dto';
import type { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';

export const TICKET_PROVIDER = Symbol('TICKET_PROVIDER');

/**
 * Phase 1: local PostgreSQL tickets.
 * Phase 2: Chatwoot / FreeScout via webhooks (swap provider in HelpdeskModule).
 */
export interface ITicketProvider {
  readonly providerId: string;
  createTicket(studentUserId: string, dto: CreateTicketDto): Promise<HelpdeskTicket>;
  listMyTickets(studentUserId: string): Promise<HelpdeskTicket[]>;
  listTicketsForAssignee(assigneeUserId: string): Promise<HelpdeskTicket[]>;
  updateStatus(ticketId: string, dto: UpdateTicketStatusDto): Promise<HelpdeskTicket>;
  getTicketForStudent(ticketId: string, studentUserId: string): Promise<HelpdeskTicket>;
}
