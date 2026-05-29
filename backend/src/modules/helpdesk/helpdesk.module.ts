import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { TICKET_PROVIDER } from './providers/ticket-provider.interface';
import { LocalTicketProvider } from './providers/local-ticket.provider';
import { WebhookTicketProvider } from './providers/webhook-ticket.provider';

const ticketProviderFactory = {
  provide: TICKET_PROVIDER,
  useFactory: (local: LocalTicketProvider, webhook: WebhookTicketProvider) => {
    const mode = process.env.HELPDESK_PROVIDER ?? 'local';
    return mode === 'webhook' ? webhook : local;
  },
  inject: [LocalTicketProvider, WebhookTicketProvider],
};

@Module({
  imports: [TypeOrmModule.forFeature([HelpdeskTicket])],
  controllers: [TicketController],
  providers: [
    TicketService,
    LocalTicketProvider,
    WebhookTicketProvider,
    ticketProviderFactory,
  ],
  exports: [TicketService, TICKET_PROVIDER],
})
export class HelpdeskModule {}
