import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
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
import { TenantModule } from './tenant/tenant.module';
import { StorageModule } from './storage/storage.module';
import { MetricsModule } from './metrics/metrics.module';
import { SystemModule } from './system/system.module';
import { TenantContextInterceptor } from './tenant/interceptors/tenant-context.interceptor';
import { TenantSchemaInterceptor } from './tenant/interceptors/tenant-schema.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
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
        synchronize: false,
        logging: configService.get('NODE_ENV') === 'development',
      }),
      inject: [ConfigService],
    }),
    NotificationsModule,
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
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: TenantSchemaInterceptor },
  ],
})
export class AppModule {}
