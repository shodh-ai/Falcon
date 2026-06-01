import { Injectable, Logger, NotImplementedException } from '@nestjs/common';
import type { HelpdeskTicket } from '../../../entities/helpdesk-ticket.entity';
import type { CreateTicketDto } from '../dto/create-ticket.dto';
import type { UpdateTicketStatusDto } from '../dto/update-ticket-status.dto';
import type { ITicketProvider } from './ticket-provider.interface';
import { LocalTicketProvider } from './local-ticket.provider';

/**
 * Stub for Chatwoot / FreeScout integration.
 * Set HELPDESK_PROVIDER=webhook and configure HELPDESK_WEBHOOK_URL in Phase 2.
 */
@Injectable()
export class WebhookTicketProvider implements ITicketProvider {
  readonly providerId = 'webhook';
  private readonly logger = new Logger(WebhookTicketProvider.name);

  constructor(private readonly local: LocalTicketProvider) {}

  createTicket(studentUserId: string, dto: CreateTicketDto): Promise<HelpdeskTicket> {
    const webhookUrl = process.env.HELPDESK_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.warn('HELPDESK_WEBHOOK_URL not set — falling back to local tickets');
      return this.local.createTicket(studentUserId, dto);
    }
    throw new NotImplementedException('Webhook ticket sync not yet implemented');
  }

  listMyTickets(studentUserId: string) {
    return this.local.listMyTickets(studentUserId);
  }

  listTicketsForAssignee(assigneeUserId: string) {
    return this.local.listTicketsForAssignee(assigneeUserId);
  }

  updateStatus(ticketId: string, dto: UpdateTicketStatusDto) {
    return this.local.updateStatus(ticketId, dto);
  }

  getTicketForStudent(ticketId: string, studentUserId: string) {
    return this.local.getTicketForStudent(ticketId, studentUserId);
  }
}
