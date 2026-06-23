import { Module } from '@nestjs/common';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { PhdLifecycleController } from './phd-lifecycle.controller';
import { PhdLifecycleService } from './phd-lifecycle.service';

@Module({
  imports: [NotificationsModule],
  controllers: [PhdLifecycleController],
  providers: [PhdLifecycleService],
  exports: [PhdLifecycleService],
})
export class PhdLifecycleModule {}
