import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemAlert } from '../entities/system-alert.entity';
import { SystemAlertsController } from './system-alerts.controller';
import { SystemAlertsService } from './system-alerts.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemAlert])],
  controllers: [SystemAlertsController],
  providers: [SystemAlertsService],
})
export class SystemModule {}
