import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { NotificationService } from './notification.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, NotificationService],
  exports: [IntegrationsService, NotificationService],
})
export class IntegrationsModule {}
