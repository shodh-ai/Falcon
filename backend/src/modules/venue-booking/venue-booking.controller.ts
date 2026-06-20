import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CreateVenueBookingDto } from './dto/create-venue-booking.dto';
import { VenueBookingService } from './venue-booking.service';

type AuthUser = { user_id: string; tenant_id?: string };

@Controller('api/venue-bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VenueBookingController {
  constructor(private readonly venueBooking: VenueBookingService) {}

  private tenant(req: { user: AuthUser }) {
    return req.user.tenant_id ?? 'a0000000-0000-4000-8000-000000000001';
  }

  @Get('venues')
  @Roles('Student', 'Faculty', 'SuperAdmin')
  listVenues(@Req() req: { user: AuthUser }, @Query('tag') tag?: string) {
    return this.venueBooking.listVenues(this.tenant(req), tag);
  }

  @Get('amenity-tags')
  @Roles('Student', 'Faculty', 'SuperAdmin')
  amenityTags(@Req() req: { user: AuthUser }) {
    return this.venueBooking.listAmenityTags(this.tenant(req));
  }

  @Get('venues/:venueId/availability')
  @Roles('Student', 'Faculty', 'SuperAdmin')
  availability(
    @Req() req: { user: AuthUser },
    @Param('venueId') venueId: string,
    @Query('date') date: string,
  ) {
    if (!date) throw new BadRequestException('date query param required');
    return this.venueBooking.getVenueAvailability(
      this.tenant(req),
      venueId,
      date,
    );
  }

  @Get('my')
  @Roles('Student')
  myBookings(@Req() req: { user: AuthUser }) {
    return this.venueBooking.listMyBookings(this.tenant(req), req.user.user_id);
  }

  @Get('my/:bookingId/pass')
  @Roles('Student')
  myPass(
    @Req() req: { user: AuthUser },
    @Param('bookingId') bookingId: string,
  ) {
    return this.venueBooking.getBookingPass(
      this.tenant(req),
      req.user.user_id,
      bookingId,
    );
  }

  @Post()
  @Roles('Student')
  create(@Req() req: { user: AuthUser }, @Body() dto: CreateVenueBookingDto) {
    return this.venueBooking.createBooking(
      this.tenant(req),
      req.user.user_id,
      dto,
    );
  }
}
