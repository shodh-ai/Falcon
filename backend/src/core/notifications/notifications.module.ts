import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { resolveJwtSecret } from '../../common/config/jwt-secret';
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
import { NotificationsGateway } from './notifications.gateway';
import { notificationQueuePrefix } from './notification-activation';
import { NotificationOutboxService } from './notification-outbox.service';
import { NotificationReadinessService } from './notification-readiness.service';
import { NotificationReadinessController } from './notification-readiness.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([FalconNotification]),
    BullModule.registerQueueAsync({
      name: NOTIFICATION_DELIVERY_QUEUE,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prefix: notificationQueuePrefix((key) => config.get<unknown>(key)),
      }),
    }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: resolveJwtSecret(configService),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [FalconNotificationsController, NotificationReadinessController],
  providers: [
    NotificationsService,
    FalconNotificationsService,
    NotificationEventsListener,
    NotificationDeliveryProcessor,
    NotificationCronService,
    NotificationEmitterService,
    NotificationDispatchService,
    NotificationOutboxService,
    NotificationReadinessService,
    OnboardingVerificationNotifyService,
    NotificationsGateway,
  ],
  exports: [
    NotificationsService,
    FalconNotificationsService,
    NotificationEmitterService,
    NotificationDispatchService,
    NotificationOutboxService,
    OnboardingVerificationNotifyService,
    NotificationsGateway,
  ],
})
export class NotificationsModule {}
