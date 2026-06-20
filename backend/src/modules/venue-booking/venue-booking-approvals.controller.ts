import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { ApproveVenueBookingDto } from './dto/approve-venue-booking.dto';
import { VenueBookingService } from './venue-booking.service';

type AuthUser = { user_id: string; tenant_id?: string };

const LIBRARIAN_ROLES = ['LIBRARIAN'];
const HOD_ROLES = ['HOD_CSE', 'HOD_MECH', 'HOD'];
const ESTATE_ROLES = ['ESTATE_OFFICER'];

@Controller('api/venue-bookings/approvals')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueBookingApprovalsController {
  constructor(private readonly venueBooking: VenueBookingService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('librarian/pending')
  @Roles('Librarian', 'SuperAdmin')
  librarianPending(@Req() req: { user: AuthUser }) {
    return this.venueBooking.listPendingForApprover(this.tenant(req), LIBRARIAN_ROLES);
  }

  @Post('librarian/:bookingId/approve')
  @Roles('Librarian', 'SuperAdmin')
  librarianApprove(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.approveBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      LIBRARIAN_ROLES,
    );
  }

  @Post('librarian/:bookingId/reject')
  @Roles('Librarian', 'SuperAdmin')
  librarianReject(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.rejectBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      LIBRARIAN_ROLES,
    );
  }

  @Get('hod/pending')
  @Roles('HOD', 'SuperAdmin')
  hodPending(@Req() req: { user: AuthUser }) {
    return this.venueBooking.listPendingForApprover(this.tenant(req), HOD_ROLES);
  }

  @Post('hod/:bookingId/approve')
  @Roles('HOD', 'SuperAdmin')
  hodApprove(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.approveBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      HOD_ROLES,
    );
  }

  @Post('hod/:bookingId/reject')
  @Roles('HOD', 'SuperAdmin')
  hodReject(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.rejectBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      HOD_ROLES,
    );
  }

  @Get('estate/pending')
  @Roles('Registrar', 'Dean', 'SuperAdmin')
  estatePending(@Req() req: { user: AuthUser }) {
    return this.venueBooking.listPendingForApprover(this.tenant(req), ESTATE_ROLES);
  }

  @Post('estate/:bookingId/approve')
  @Roles('Registrar', 'Dean', 'SuperAdmin')
  estateApprove(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.approveBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      ESTATE_ROLES,
    );
  }

  @Post('estate/:bookingId/reject')
  @Roles('Registrar', 'Dean', 'SuperAdmin')
  estateReject(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
    @Body() dto: ApproveVenueBookingDto,
  ) {
    return this.venueBooking.rejectBooking(
      this.tenant(req),
      req.user.user_id,
      bookingId,
      dto.remarks,
      ESTATE_ROLES,
    );
  }
}
