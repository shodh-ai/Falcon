import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NOTIFICATION_DELIVERY_QUEUE } from '../../common/constants/notification-queue.constants';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { NotificationsService } from './notifications.service';
import { FalconNotificationsService } from './falcon-notifications.service';
import { NotificationEventsListener } from './notification-events.listener';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { NotificationCronService } from './notification-cron.service';
import { FalconNotificationsController } from './falcon-notifications.controller';
import { NotificationEmitterService } from './notification-emitter.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { OnboardingVerificationNotifyService } from './onboarding-verification-notify.service';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([FalconNotification]),
    BullModule.registerQueue({ name: NOTIFICATION_DELIVERY_QUEUE }),
  ],
  controllers: [FalconNotificationsController],
  providers: [
    NotificationsService,
    FalconNotificationsService,
    NotificationEventsListener,
    NotificationDeliveryProcessor,
    NotificationCronService,
    NotificationEmitterService,
    NotificationDispatchService,
    OnboardingVerificationNotifyService,
  ],
  exports: [
    NotificationsService,
    FalconNotificationsService,
    NotificationEmitterService,
    NotificationDispatchService,
    OnboardingVerificationNotifyService,
  ],
})
export class NotificationsModule {}
