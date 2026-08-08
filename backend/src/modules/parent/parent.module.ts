import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { resolveJwtSecret } from '../../common/config/jwt-secret';
import { ReadOnlyPortalGuard } from '../../common/guards/read-only-portal.guard';
import { NotificationsModule } from '../../core/notifications/notifications.module';
import { TransportModule } from '../transport/transport.module';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';

@Module({
  imports: [
    NotificationsModule,
    TransportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: resolveJwtSecret(config),
        signOptions: { expiresIn: config.get('JWT_EXPIRATION') || '7d' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ParentController],
  providers: [ParentService, ReadOnlyPortalGuard],
  exports: [ParentService],
})
export class ParentModule {}
