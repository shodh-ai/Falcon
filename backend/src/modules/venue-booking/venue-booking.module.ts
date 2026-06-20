import { Module } from '@nestjs/common';
import { VenueBookingController } from './venue-booking.controller';
import { VenueBookingApprovalsController } from './venue-booking-approvals.controller';
import { VenueBookingService } from './venue-booking.service';

@Module({
  controllers: [VenueBookingController, VenueBookingApprovalsController],
  providers: [VenueBookingService],
  exports: [VenueBookingService],
})
export class VenueBookingModule {}
