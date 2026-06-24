import { Module } from '@nestjs/common';
import { WeeklyTestsController } from './weekly-tests.controller';
import { WeeklyTestsService } from './weekly-tests.service';

@Module({
  controllers: [WeeklyTestsController],
  providers: [WeeklyTestsService],
})
export class WeeklyTestsModule {}
