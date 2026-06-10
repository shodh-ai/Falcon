import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { FeatureGuard } from '../../common/guards/feature.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequiresFeature } from '../../common/decorators/requires-feature.decorator';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddTicketMessageDto } from './dto/add-ticket-message.dto';

type AuthUser = { user_id: string; role?: string; tenant_id?: string };

/** Users who can raise tickets and list tickets they filed (ESS / student helpdesk). */
const HELPDESK_REQUESTER_ROLES = [
  'Student',
  'Faculty',
  'HOD',
  'Dean',
  'HR',
  'HRAdmin',
  'SuperAdmin',
  'Registrar',
  'Accountant',
  'Warden',
] as const;

@Controller('api/helpdesk/tickets')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequiresFeature('helpdesk')
export class TicketController {
  constructor(private readonly tickets: TicketService) {}

  @Post()
  @Roles(...HELPDESK_REQUESTER_ROLES)
  create(@Req() req: { user: AuthUser }, @Body() dto: CreateTicketDto) {
    return this.tickets.createTicket(req.user.user_id, dto);
  }

  @Get('my')
  @Roles(...HELPDESK_REQUESTER_ROLES)
  listMine(@Req() req: { user: AuthUser }) {
    return this.tickets.listMyTickets(req.user.user_id);
  }

  @Get('my-tickets')
  @Roles(...HELPDESK_REQUESTER_ROLES)
  listMyTickets(@Req() req: { user: AuthUser }) {
    return this.tickets.listMyTickets(req.user.user_id);
  }

  @Get('assigned')
  @Roles('SuperAdmin', 'Registrar', 'Accountant', 'Warden', 'HOD', 'Dean', 'Faculty')
  listAssigned(@Req() req: { user: AuthUser }) {
    return this.tickets.listTicketsForAssignee(req.user.user_id);
  }

  @Get('profile-corrections')
  @Roles('SuperAdmin', 'Registrar', 'HOD', 'Dean', 'Admin')
  listProfileCorrections(@Req() req: { user: AuthUser }) {
    return this.tickets.listProfileCorrectionTickets(this.tenant(req));
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Patch(':ticketId/status')
  @Roles('SuperAdmin', 'Registrar', 'Accountant', 'Warden', 'HOD', 'Dean')
  updateStatus(@Param('ticketId') ticketId: string, @Body() dto: UpdateTicketStatusDto) {
    return this.tickets.updateStatus(ticketId, dto);
  }

  @Post(':ticketId/messages')
  addMessage(@Param('ticketId') ticketId: string, @Req() req: { user: AuthUser }, @Body() dto: AddTicketMessageDto) {
    return this.tickets.addMessage(ticketId, req.user.user_id, req.user.role ?? 'UNKNOWN', dto.message);
  }
}
