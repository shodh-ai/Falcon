import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketStatusDto } from './dto/update-ticket-status.dto';
import { AddTicketMessageDto } from './dto/add-ticket-message.dto';

type AuthUser = {
  user_id: string;
  role?: string;
  roles?: string[];
  tenant_id?: string;
};

/** Users who can raise tickets and list tickets they filed (ESS / student helpdesk). */
const HELPDESK_REQUESTER_ROLES = [
  'Student',
  'Faculty',
  'HOD',
  'Dean',
  'HR',
  'HRAdmin',
  'SuperAdmin',
  'AdmissionsOfficer',
  'CampusAdmin',
  'Registrar',
  'Accountant',
  'Warden',
  'ExamCell',
  'IQAC',
  'Librarian',
  'PlacementCell',
  'TransportOfficer',
  'DC_MEMBER',
] as const;

/** Finance desk — grievance queue and ticket actions. */
const FINANCE_HELPDESK_ROLES = [
  'Accountant',
  'CFO',
  'APManager',
  'APClerk',
  'FinanceController',
  'SuperAdmin',
  'CampusAdmin',
  'Registrar',
] as const;

@Controller('api/helpdesk/tickets')
@UseGuards(JwtAuthGuard, RolesGuard)
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
  @Roles(
    'SuperAdmin',
    'Registrar',
    ...FINANCE_HELPDESK_ROLES,
    'Warden',
    'HOD',
    'Dean',
    'Faculty',
  )
  listAssigned(@Req() req: { user: AuthUser }) {
    return this.tickets.listTicketsForAssignee(req.user.user_id);
  }

  @Get('finance-grievances')
  @Roles(...FINANCE_HELPDESK_ROLES)
  listFinanceGrievances(@Req() req: { user: AuthUser }) {
    return this.tickets.listFinanceGrievances(this.tenant(req), req.user);
  }

  @Get('ref/:ticketRef')
  @Roles(...HELPDESK_REQUESTER_ROLES, 'Chairman', 'President')
  getByRef(
    @Req() req: { user: AuthUser },
    @Param('ticketRef') ticketRef: string,
  ) {
    return this.tickets.getTicketByRef(
      ticketRef,
      req.user.user_id,
      req.user.role ?? 'UNKNOWN',
      this.tenant(req),
      req.user,
    );
  }

  @Get('hr-grievances')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  listHrGrievances(@Req() req: { user: AuthUser }) {
    return this.tickets.listHrGrievances(this.tenant(req));
  }

  @Get('hr-grievances/:ticketId')
  @Roles('HR', 'HRAdmin', 'SuperAdmin')
  getHrGrievance(
    @Req() req: { user: AuthUser },
    @Param('ticketId') ticketId: string,
  ) {
    return this.tickets.getHrGrievance(ticketId, this.tenant(req));
  }

  @Get('profile-corrections')
  @Roles(
    'CampusAdmin',
    'SuperAdmin',
    'AdmissionsOfficer',
    'Registrar',
    'HOD',
    'Dean',
    'Admin',
  )
  async listProfileCorrections(@Req() req: { user: AuthUser }) {
    const tenantId = this.tenant(req);
    const hodDeptIds = await this.tickets.resolveHodDepartmentIds(
      req.user.user_id,
    );
    const deptIds = hodDeptIds.length ? hodDeptIds : undefined;
    return this.tickets.listProfileCorrectionTickets(
      tenantId,
      100,
      deptIds,
      req.user,
    );
  }

  @Get(':ticketId')
  @Roles(...HELPDESK_REQUESTER_ROLES, 'Chairman', 'President')
  getTicket(
    @Req() req: { user: AuthUser },
    @Param('ticketId') ticketId: string,
  ) {
    return this.tickets.getTicketById(
      ticketId,
      req.user.user_id,
      req.user.role ?? 'UNKNOWN',
      this.tenant(req),
      req.user,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Patch(':ticketId/status')
  @Roles(
    'CampusAdmin',
    'SuperAdmin',
    'AdmissionsOfficer',
    'Registrar',
    ...FINANCE_HELPDESK_ROLES,
    'Warden',
    'HOD',
    'Dean',
    'HR',
    'HRAdmin',
  )
  updateStatus(
    @Param('ticketId') ticketId: string,
    @Body() dto: UpdateTicketStatusDto,
    @Req() req: { user: AuthUser },
  ) {
    return this.tickets.updateStatus(ticketId, dto, {
      userId: req.user.user_id,
      role: req.user.role ?? 'UNKNOWN',
      roles: req.user.roles,
      tenantId: this.tenant(req),
    });
  }

  @Post(':ticketId/messages')
  addMessage(
    @Param('ticketId') ticketId: string,
    @Req() req: { user: AuthUser },
    @Body() dto: AddTicketMessageDto,
  ) {
    return this.tickets.addMessage(
      ticketId,
      req.user.user_id,
      req.user.role ?? 'UNKNOWN',
      dto.message,
    );
  }

  @Post(':ticketId/escalate')
  @Roles('HOD', 'Dean', 'SuperAdmin')
  escalate(
    @Param('ticketId') ticketId: string,
    @Req() req: { user: AuthUser },
  ) {
    return this.tickets.escalateTicket(
      ticketId,
      req.user.user_id,
      req.user.role ?? 'UNKNOWN',
      this.tenant(req),
    );
  }
}
