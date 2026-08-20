import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CampusEventsService } from './campus-events.service';
import { ProposeEventDto } from './dto/propose-event.dto';
import { RejectEventDto } from './dto/reject-event.dto';
import { UpsertMasterCalendarDto } from './dto/master-calendar.dto';
import { EstateApproveDto } from './dto/estate-approve.dto';
import { FundTransferDto } from './dto/fund-transfer.dto';
import { ConfirmEventRegistrationDto } from './dto/confirm-registration.dto';

type AuthUser = {
  user_id: string;
  tenant_id?: string;
  role?: string;
  roles?: string[];
};

/** Finance desk — club event fund transfers after Dean sign-off. */
const FINANCE_EVENT_FUNDING_ROLES = [
  'Accountant',
  'CFO',
  'APManager',
  'APClerk',
  'FinanceController',
  'SuperAdmin',
  'CampusAdmin',
] as const;

@Controller('api/campus-events')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CampusEventsController {
  constructor(private readonly events: CampusEventsService) {}

  @Get('master-calendar')
  @Roles('Registrar', 'Dean', 'SuperAdmin', 'Student', 'Faculty', 'CampusAdmin')
  masterCalendar(
    @Req() req: { user: AuthUser },
    @Query('academic_year') academicYear?: string,
  ) {
    return this.events.listMasterCalendar(this.tenant(req), academicYear);
  }

  @Post('master-calendar')
  @Roles('Registrar', 'Dean', 'SuperAdmin')
  upsertCalendar(
    @Req() req: { user: AuthUser },
    @Body() dto: UpsertMasterCalendarDto,
  ) {
    return this.events.upsertMasterCalendarEntry(
      this.tenant(req),
      dto,
      req.user,
    );
  }

  @Delete('master-calendar/:id')
  @Roles('Registrar', 'Dean', 'SuperAdmin')
  deleteCalendar(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.deleteMasterCalendarEntry(
      this.tenant(req),
      id,
      req.user,
    );
  }

  @Get('blocked-dates')
  @Roles('Student', 'Faculty', 'Registrar', 'Dean', 'SuperAdmin')
  blockedDates(@Req() req: { user: AuthUser }) {
    return this.events.listBlockedDates(this.tenant(req));
  }

  @Get('venues')
  @Roles('Student', 'Faculty', 'Registrar', 'Dean', 'SuperAdmin', 'CampusAdmin')
  venues(@Req() req: { user: AuthUser }) {
    return this.events.listVenues(this.tenant(req));
  }

  @Get('calendar/global')
  @Roles('Student', 'Faculty', 'Dean', 'SuperAdmin')
  globalCalendar(@Req() req: { user: AuthUser }) {
    return this.events.listGlobalCalendar(this.tenant(req));
  }

  @Get('events')
  @Roles('Student', 'Faculty', 'Dean', 'HOD', 'SuperAdmin', 'CampusAdmin')
  listEvents(@Req() req: { user: AuthUser }) {
    return this.events.listApprovedEvents(this.tenant(req));
  }

  @Get('events/:id')
  @Roles('Student', 'Faculty', 'Dean', 'SuperAdmin')
  eventDetail(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.getEventDetail(this.tenant(req), id);
  }

  @Get('events/:id/venue-clash')
  @Roles('Registrar', 'Dean', 'SuperAdmin', 'Student', 'Faculty')
  venueClash(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Query('venue_id') venueId: string,
    @Query('event_date') eventDate: string,
  ) {
    return this.events.checkVenueClash(
      this.tenant(req),
      venueId,
      eventDate,
      id,
    );
  }

  @Post('events/:id/register')
  @Roles('Student')
  register(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.registerForEvent(this.tenant(req), req.user.user_id, id);
  }

  @Get('registrations/:registrationId')
  @Roles('Student')
  registrationHold(
    @Req() req: { user: AuthUser },
    @Param('registrationId') registrationId: string,
  ) {
    return this.events.getPendingRegistration(
      this.tenant(req),
      req.user.user_id,
      registrationId,
    );
  }

  @Post('events/:id/register/confirm')
  @Roles('Student')
  confirm(
    @Req() req: { user: AuthUser },
    @Body() dto: ConfirmEventRegistrationDto,
  ) {
    return this.events.confirmPaidRegistration(
      this.tenant(req),
      req.user.user_id,
      dto.registration_id,
      dto.payment_ref,
    );
  }

  @Get('my-tickets')
  @Roles('Student')
  myTickets(@Req() req: { user: AuthUser }) {
    return this.events.getMyTickets(this.tenant(req), req.user.user_id);
  }

  @Get('clubs')
  @Roles('Student', 'Faculty')
  listClubsAndChapters(@Req() req: { user: AuthUser }) {
    return this.events.listClubsAndChapters(this.tenant(req), req.user.user_id);
  }

  @Post('clubs/:clubId/apply')
  @Roles('Student')
  applyToClub(
    @Req() req: { user: AuthUser },
    @Param('clubId') clubId: string,
    @Body() body: { motivation?: string },
  ) {
    return this.events.applyToClub(
      this.tenant(req),
      req.user.user_id,
      clubId,
      body.motivation,
    );
  }

  @Get('me/club-coordinator')
  @Roles('Student')
  clubCoordinator(@Req() req: { user: AuthUser }) {
    return this.events.isClubCoordinator(this.tenant(req), req.user.user_id);
  }

  @Post('coordinator/events')
  @Roles('Student')
  propose(@Req() req: { user: AuthUser }, @Body() dto: ProposeEventDto) {
    return this.events.proposeEvent(this.tenant(req), req.user.user_id, dto);
  }

  @Get('coordinator/events')
  @Roles('Student')
  coordinatorEvents(@Req() req: { user: AuthUser }) {
    return this.events.listClubEvents(this.tenant(req), req.user.user_id);
  }

  @Get('coordinator/clubs')
  @Roles('Student')
  myClubs(@Req() req: { user: AuthUser }) {
    return this.events.getMyClubs(this.tenant(req), req.user.user_id);
  }

  @Post('coordinator/events/:id/scan')
  @Roles('Student')
  scanTicket(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: { qr_code: string },
  ) {
    return this.events.scanAttendance(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.qr_code,
    );
  }

  @Get('coordinator/events/:id/scan-stats')
  @Roles('Student')
  scanStats(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.getScanStats(this.tenant(req), req.user.user_id, id);
  }

  @Get('coordinator/events/:id/attendees.csv')
  @Roles('Student')
  @Header('Content-Type', 'text/csv')
  @Header('Content-Disposition', 'attachment; filename="attendees.csv"')
  attendeesCsv(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.exportAttendeesCsv(
      this.tenant(req),
      req.user.user_id,
      id,
    );
  }

  @Get('approvals/pending')
  @Roles('Faculty', 'SuperAdmin')
  pendingApprovals(@Req() req: { user: AuthUser }) {
    return this.events.listPendingApprovals(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
    );
  }

  @Get('approvals/faculty/pending')
  @Roles('Faculty', 'SuperAdmin')
  facultyPending(@Req() req: { user: AuthUser }) {
    return this.events.listPendingApprovals(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
    );
  }

  @Post('approvals/:id/approve')
  @Roles('Faculty', 'SuperAdmin')
  approve(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.approveEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
    );
  }

  @Post('approvals/:id/reject')
  @Roles('Faculty', 'SuperAdmin')
  reject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.rejectEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
      dto.comment,
    );
  }

  @Get('approvals/hod/pending')
  @Roles('HOD', 'SuperAdmin')
  hodPending(@Req() req: { user: AuthUser }) {
    return this.events.listPendingHodApprovals(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
    );
  }

  @Post('approvals/hod/:id/approve')
  @Roles('HOD', 'SuperAdmin')
  hodApprove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.approveHodEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
    );
  }

  @Post('approvals/hod/:id/reject')
  @Roles('HOD', 'SuperAdmin')
  hodReject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.rejectHodEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
      dto.comment,
    );
  }

  @Get('approvals/dean/pending')
  @Roles('Dean', 'SuperAdmin')
  deanPending(@Req() req: { user: AuthUser }) {
    return this.events.listPendingDeanApprovals(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
    );
  }

  @Post('approvals/dean/:id/approve')
  @Roles('Dean', 'SuperAdmin')
  deanApprove(@Req() req: { user: AuthUser }, @Param('id') id: string) {
    return this.events.approveDeanEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
    );
  }

  @Post('approvals/dean/:id/reject')
  @Roles('Dean', 'SuperAdmin')
  deanReject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.rejectDeanEvent(
      this.tenant(req),
      req.user.user_id,
      req.user.roles ?? [],
      id,
      dto.comment,
    );
  }

  @Get('estate/pending')
  @Roles('Registrar', 'Dean', 'SuperAdmin', 'CampusAdmin')
  estatePending(@Req() req: { user: AuthUser }) {
    return this.events.listEstatePending(this.tenant(req));
  }

  @Post('estate/:id/approve')
  @Roles('Registrar', 'Dean', 'SuperAdmin', 'CampusAdmin')
  estateApprove(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: EstateApproveDto,
  ) {
    return this.events.approveEstate(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
    );
  }

  @Post('estate/:id/reject')
  @Roles('Registrar', 'Dean', 'SuperAdmin', 'CampusAdmin')
  estateReject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.rejectEstate(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.comment,
    );
  }

  @Get('finance-approvals/pending')
  @Roles(...FINANCE_EVENT_FUNDING_ROLES)
  financePending(@Req() req: { user: AuthUser }) {
    return this.events.listFinancePending(this.tenant(req));
  }

  @Get('funding/pending')
  @Roles(...FINANCE_EVENT_FUNDING_ROLES)
  fundingPending(@Req() req: { user: AuthUser }) {
    return this.events.listFinancePending(this.tenant(req));
  }

  @Post('finance-approvals/:id/approve')
  @Roles(...FINANCE_EVENT_FUNDING_ROLES)
  financeApprove(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: FundTransferDto,
  ) {
    return this.events.approveFinance(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
    );
  }

  @Post('funding/:id/transfer')
  @Roles(...FINANCE_EVENT_FUNDING_ROLES)
  fundingTransfer(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: FundTransferDto,
  ) {
    return this.events.approveFinance(
      this.tenant(req),
      req.user.user_id,
      id,
      dto,
    );
  }

  @Post('finance-approvals/:id/reject')
  @Roles(...FINANCE_EVENT_FUNDING_ROLES)
  financeReject(
    @Req() req: { user: AuthUser },
    @Param('id') id: string,
    @Body() dto: RejectEventDto,
  ) {
    return this.events.rejectFinance(
      this.tenant(req),
      req.user.user_id,
      id,
      dto.comment,
    );
  }

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }
}
