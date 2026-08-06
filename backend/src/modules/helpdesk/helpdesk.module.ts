import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { User } from '../../entities/user.entity';
import { WorkflowModule } from '../../core/workflow/workflow.module';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { HelpdeskEscalationService } from './helpdesk-escalation.service';
import { TICKET_PROVIDER } from './providers/ticket-provider.interface';
import { LocalTicketProvider } from './providers/local-ticket.provider';
import { WebhookTicketProvider } from './providers/webhook-ticket.provider';
import { DofaEngineModule } from '../dofa-engine/dofa-engine.module';

const ticketProviderFactory = {
  provide: TICKET_PROVIDER,
  useFactory: (local: LocalTicketProvider, webhook: WebhookTicketProvider) => {
    const mode = process.env.HELPDESK_PROVIDER ?? 'local';
    return mode === 'webhook' ? webhook : local;
  },
  inject: [LocalTicketProvider, WebhookTicketProvider],
};

@Module({
  imports: [
    TypeOrmModule.forFeature([HelpdeskTicket, User]),
    WorkflowModule,
    DofaEngineModule,
  ],
  controllers: [TicketController],
  providers: [
    TicketService,
    HelpdeskEscalationService,
    LocalTicketProvider,
    WebhookTicketProvider,
    ticketProviderFactory,
  ],
  exports: [TicketService, TICKET_PROVIDER],
})
export class HelpdeskModule {}
