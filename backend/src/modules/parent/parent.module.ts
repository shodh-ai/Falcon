import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ReadOnlyPortalGuard } from '../../common/guards/read-only-portal.guard';
import { ParentController } from './parent.controller';
import { ParentService } from './parent.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET') || 'default-secret-key',
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
