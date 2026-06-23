const { NestFactory } = require('@nestjs/core');
const { AppModule } = require('./dist/app.module');
const { VenueBookingService } = require('./dist/modules/venue-booking/venue-booking.service');

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(VenueBookingService);
  try {
    const venueId = '27706d63-dc5b-4136-ab54-1d1b9a3ee752'; // Block B
    const dto = {
      venue_id: venueId,
      start_time: '2026-06-23T11:00:00Z',
      end_time: '2026-06-23T12:00:00Z',
      purpose: 'test API script'
    };
    const res = await service.createBooking(
      'a0000000-0000-4000-8000-000000000001',
      'b0000002-0000-4000-8000-000000000002',
      dto
    );
    console.log('API call succeeded:', res);
  } catch(e) {
    console.error('API call failed:', e);
  }
  process.exit(0);
}
bootstrap();
