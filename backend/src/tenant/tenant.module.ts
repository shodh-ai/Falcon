import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../entities/tenant.entity';
import { TenantSubscription } from '../entities/tenant-subscription.entity';
import { TenantService } from './tenant.service';
import { TenantController } from './tenant.controller';
import { TenantContextService } from './tenant-context.service';
import { TenantConnectionService } from './tenant-connection.service';
import { TenantResolutionMiddleware } from './middleware/tenant-resolution.middleware';
import { TenantSettingsService } from './tenant-settings.service';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Tenant, TenantSubscription])],
  controllers: [TenantController],
  providers: [
    TenantService,
    TenantContextService,
    TenantConnectionService,
    TenantSettingsService,
  ],
  exports: [
    TenantService,
    TenantContextService,
    TenantConnectionService,
    TenantSettingsService,
  ],
})
export class TenantModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolutionMiddleware).forRoutes('*');
  }
}
