import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import * as entities from './entities';
import { AuthModule } from './auth/auth.module';
import { UploadsModule } from './uploads/uploads.module';
import { TasksModule } from './tasks/tasks.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { UsersModule } from './users/users.module';
import { HandoverModule } from './handover/handover.module';
import { NotificationsModule } from './core/notifications/notifications.module';
import { WorkflowModule } from './core/workflow/workflow.module';
import { IdGeneratorModule } from './core/id-generator/id-generator.module';
import { IamModule } from './modules/iam/iam.module';
import { AdmissionsModule } from './modules/admissions/admissions.module';
import { PlacementModule } from './modules/placement/placement.module';
import { AlumniModule } from './modules/alumni/alumni.module';
import { AdminOpsModule } from './modules/admin-ops/admin-ops.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ParentModule } from './modules/parent/parent.module';
import { ExamCellModule } from './modules/exam-cell/exam-cell.module';
import { AcademicsModule } from './modules/academics/academics.module';
import { FinanceModule } from './modules/finance/finance.module';
import { ExamsModule } from './modules/exams/exams.module';
import { HrModule } from './modules/hr/hr.module';
import { IqacModule } from './modules/iqac/iqac.module';
import { PresidentModule } from './modules/president/president.module';
import { OperationsModule } from './modules/operations/operations.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HelpdeskModule } from './modules/helpdesk/helpdesk.module';
import { StudentPortalModule } from './modules/student-portal/student-portal.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SuperAdminModule } from './modules/super-admin/super-admin.module';
import { LmsExtendedModule } from './modules/lms-extended/lms-extended.module';
import { HostelTatkalModule } from './modules/hostel-tatkal/hostel-tatkal.module';
import { CampusWalletModule } from './modules/campus-wallet/campus-wallet.module';
import { TransportModule } from './modules/transport/transport.module';
import { LibraryModule } from './modules/library/library.module';
import { HostelAdminModule } from './modules/hostel-admin/hostel-admin.module';
import { CampusEventsModule } from './modules/campus-events/campus-events.module';
import { AuditModule } from './core/audit/audit.module';
import { RedisModule } from './core/redis/redis.module';
import { ImpersonationReadOnlyGuard } from './common/guards/impersonation-readonly.guard';
import { TenantModule } from './tenant/tenant.module';
import { StorageModule } from './storage/storage.module';
import { MetricsModule } from './metrics/metrics.module';
import { SystemModule } from './system/system.module';
import { TenantContextInterceptor } from './tenant/interceptors/tenant-context.interceptor';
import { TenantSchemaInterceptor } from './tenant/interceptors/tenant-schema.interceptor';
import { HrEntityScopeInterceptor } from './common/interceptors/hr-entity-scope.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', '127.0.0.1'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
      inject: [ConfigService],
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get('DB_USERNAME', 'postgres'),
        password: configService.get('DB_PASSWORD', 'postgres'),
        database: configService.get('DB_DATABASE', 'university_governance'),
        entities: Object.values(entities).filter((e) => typeof e === 'function'),
        synchronize: configService.get<string>('DB_SYNCHRONIZE', 'false') === 'true',
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    AuditModule,
    RedisModule,
    NotificationsModule,
    WorkflowModule,
    IdGeneratorModule,
    TenantModule,
    StorageModule,
    MetricsModule,
    SystemModule,
    AuthModule,
    UploadsModule,
    TasksModule,
    SchedulerModule,
    UsersModule,
    HandoverModule,
    IamModule,
    AdmissionsModule,
    PlacementModule,
    AlumniModule,
    AdminOpsModule,
    IntegrationsModule,
    ParentModule,
    ExamCellModule,
    AcademicsModule,
    ExamsModule,
    FinanceModule,
    HrModule,
    IqacModule,
    PresidentModule,
    OperationsModule,
    SettingsModule,
    HelpdeskModule,
    StudentPortalModule,
    ReportsModule,
    SuperAdminModule,
    LmsExtendedModule,
    HostelTatkalModule,
    CampusWalletModule,
    TransportModule,
    LibraryModule,
    HostelAdminModule,
    CampusEventsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ImpersonationReadOnlyGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantSchemaInterceptor },
    HrEntityScopeInterceptor,
    { provide: APP_INTERCEPTOR, useClass: HrEntityScopeInterceptor },
  ],
})
export class AppModule {}
