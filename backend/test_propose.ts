import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { CampusEventsService } from './src/modules/campus-events/campus-events.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const service = app.get(CampusEventsService);

  const tenantId = 'a0000000-0000-4000-8000-000000000001';
  const coordinatorId = 'b0000001-0000-4000-8000-000000000001';
  const dto = {
    club_id: '1e92fe1d-3829-4279-a0c8-ad30f7e21ffb',
    title: 'Test Propose API',
    description: 'A test event proposal',
    venue: 'Main Auditorium',
    event_date: new Date().toISOString(),
    total_slots: 50,
    is_paid: false,
  };

  try {
    const result = await service.proposeEvent(tenantId, coordinatorId, dto);
    console.log('SUCCESS:', result.event_id);
  } catch (error) {
    console.error('PROPOSE_ERROR_CAUGHT:');
    console.error(error);
  }

  await app.close();
}

bootstrap();
