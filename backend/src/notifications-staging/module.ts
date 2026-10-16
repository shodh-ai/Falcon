import {
  CanActivate,
  BeforeApplicationShutdown,
  Controller,
  ExecutionContext,
  Get,
  Injectable,
  Module,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  OnModuleDestroy,
  Param,
  Patch,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { getQueueToken } from '@nestjs/bullmq';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DelayedError, Queue, Worker } from 'bullmq';
import { lookup } from 'node:dns/promises';
import type { Request } from 'express';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { AUTH_PROVIDER } from '../auth/interfaces/auth-provider.interface';
import { LocalAuthProvider } from '../auth/providers/local-auth.provider';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CampusScopeService } from '../common/campus-scope/campus-scope.service';
import { TenantService } from '../tenant/tenant.service';
import { User } from '../entities/user.entity';
import { UserRole } from '../entities/user-role.entity';
import { Tenant } from '../entities/tenant.entity';
import { TenantSubscription } from '../entities/tenant-subscription.entity';
import { FalconNotification } from '../entities/falcon-notification.entity';
import { HrEntityContextService } from '../modules/hr/hr-entity-context.service';
import { HrAccessControlService } from '../modules/hr/hr-access-control.service';
import { CacheService } from '../core/redis/cache.service';
import { RedisService } from '../core/redis/redis.service';
import { FalconNotificationsService } from '../core/notifications/falcon-notifications.service';
import { NotificationDispatchService } from '../core/notifications/notification-dispatch.service';
import { NotificationOutboxService } from '../core/notifications/notification-outbox.service';
import {
  NOTIFICATION_CAPTURE_DELIVERY,
  NotificationsService,
} from '../core/notifications/notifications.service';
import { NotificationDeliveryProcessor } from '../core/notifications/notification-delivery.processor';
import { NotificationsGateway } from '../core/notifications/notifications.gateway';
import { notificationDeliveryLimiter } from '../core/notifications/notification-delivery-policy';
import {
  NOTIFICATION_DELIVERY_QUEUE,
  type NotificationDeliveryJob,
} from '../common/constants/notification-queue.constants';
import {
  assertNotificationStagingRuntime,
  STAGING_NOTIFICATION_RECIPIENT,
  STAGING_NOTIFICATION_TENANT,
  STAGING_TARGETS,
  type NotificationStagingConfig,
  notificationStagingConfig,
} from './config';
import { createStagingNotificationCapture } from './capture';

export const STAGING_NOTIFICATION_ACCOUNT = Symbol(
  'STAGING_NOTIFICATION_ACCOUNT',
);
export type StagingNotificationAccount = { user_id: string; tenant_id: string };

/** SELECT-only preflight must finish before Redis queues/workers are constructed. */
export async function verifyNotificationStagingDatabase(
  db: Pick<DataSource, 'query'>,
) {
  const identity = await db.query<
    Array<{
      database_name: string;
      username: string;
      server_address: string;
      server_port: number;
      schema_name: string;
      superuser: boolean;
      createdb: boolean;
      createrole: boolean;
      bypassrls: boolean;
      replication: boolean;
      schema_create: boolean;
      db_create: boolean;
      memberships: boolean;
      owns_objects: boolean;
      marker_owner: string;
    }>
  >(`SELECT current_database() AS database_name, current_user AS username,
    inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
    current_schema() AS schema_name, r.rolsuper AS superuser, r.rolcreatedb AS createdb,
    r.rolcreaterole AS createrole, r.rolbypassrls AS bypassrls, r.rolreplication AS replication,
    has_schema_privilege(current_user,'public','CREATE') AS schema_create,
    has_database_privilege(current_user,current_database(),'CREATE') AS db_create,
    EXISTS(SELECT 1 FROM pg_auth_members m WHERE m.member=r.oid) AS memberships,
    (EXISTS(SELECT 1 FROM pg_class c WHERE c.relowner=r.oid)
      OR EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspowner=r.oid)
      OR EXISTS(SELECT 1 FROM pg_database d WHERE d.datdba=r.oid)
      OR EXISTS(SELECT 1 FROM pg_proc p WHERE p.proowner=r.oid)
      OR EXISTS(SELECT 1 FROM pg_type y WHERE y.typowner=r.oid)) AS owns_objects,
    (SELECT pg_get_userbyid(c.relowner) FROM pg_class c
       INNER JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='public' AND c.relname='notification_staging_environment'
         AND c.relkind='r') AS marker_owner
    FROM pg_roles r WHERE r.rolname=current_user`);
  const row = identity[0];
  if (
    identity.length !== 1 ||
    row.database_name !== 'falcon_notification_staging' ||
    row.username !== 'notification_staging_app' ||
    ![
      STAGING_TARGETS.database.address,
      `${STAGING_TARGETS.database.address}/32`,
    ].includes(row.server_address) ||
    Number(row.server_port) !== 5432 ||
    row.schema_name !== 'public' ||
    row.marker_owner !== 'notification_staging_owner' ||
    [
      'superuser',
      'createdb',
      'createrole',
      'bypassrls',
      'replication',
      'schema_create',
      'db_create',
      'memberships',
      'owns_objects',
    ].some((key) => row[key] !== false)
  )
    throw new Error('Restricted isolated notification database required');
  const marker = await db.query<
    Array<{ id: boolean; environment: string; version: number }>
  >(
    'SELECT id,environment,version FROM public.notification_staging_environment',
  );
  if (
    marker.length !== 1 ||
    marker[0].id !== true ||
    marker[0].environment !== 'falcon-notification-staging' ||
    marker[0].version !== 1
  )
    throw new Error('Owner-reviewed notification staging marker required');
  const accounts = await db.query<
    Array<
      StagingNotificationAccount & {
        official_email: string;
        is_active: boolean;
        tenant_active: boolean;
        subdomain: string;
        role_name: string;
      }
    >
  >(
    `SELECT u.user_id,u.tenant_id,u.official_email,u.is_active,
      t.is_active AS tenant_active,t.subdomain,r.role_name FROM users u
      INNER JOIN tenants t ON t.tenant_id=u.tenant_id
      INNER JOIN roles r ON r.role_id=u.role_id
      WHERE LOWER(BTRIM(u.official_email))=$1 AND u.deleted_at IS NULL`,
    [STAGING_NOTIFICATION_RECIPIENT],
  );
  if (
    accounts.length !== 1 ||
    accounts[0].official_email !== STAGING_NOTIFICATION_RECIPIENT ||
    !accounts[0].is_active ||
    !accounts[0].tenant_active ||
    accounts[0].subdomain !== STAGING_NOTIFICATION_TENANT ||
    accounts[0].role_name !== 'Faculty'
  )
    throw new Error('Unique active synthetic notification account required');
  return { user_id: accounts[0].user_id, tenant_id: accounts[0].tenant_id };
}

export async function verifyNotificationStagingDns() {
  for (const target of [
    STAGING_TARGETS.database,
    STAGING_TARGETS.redis,
    STAGING_TARGETS.mail,
  ]) {
    const addresses = await lookup(target.host, { all: true });
    if (
      !addresses.length ||
      addresses.some((address) => address.address !== target.address)
    )
      throw new Error('Dedicated notification staging destination rejected');
  }
}

/** Trusted operator call only; never an HTTP route or application startup hook. */
export async function requestOneStagingCapture(
  db: DataSource,
  dispatch: NotificationDispatchService,
  settings: NotificationStagingConfig,
) {
  assertNotificationStagingRuntime();
  const actual = notificationStagingConfig(process.env);
  if (
    actual.activation.prefix !== settings.activation.prefix ||
    actual.activation.timestamp !== settings.activation.timestamp
  )
    throw new Error('Reviewed staging activation required');
  await verifyNotificationStagingDatabase(db);
  const runner = db.createQueryRunner();
  await runner.connect();
  try {
    await verifyNotificationStagingDatabase(runner);
    await runner.startTransaction();
    const key = `${settings.activation.prefix}:${new Date(settings.activation.timestamp).toISOString()}`;
    // All approved one-shot callers serialize while the committed intent is checked.
    // The real dispatch retains its own persistence/queue behavior, not a fake sender.
    await runner.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      key,
    ]);
    const existing = (await runner.query(
      `SELECT notification_id FROM public.falcon_notifications
       WHERE metadata->>'notificationStagingCapture'=$1 LIMIT 1`,
      [key],
    )) as unknown[];
    if (existing.length) {
      await runner.commitTransaction();
      return { created: false, reason: 'EXISTING_STAGING_INTENT' };
    }
    const account = await verifyNotificationStagingDatabase(db);
    await dispatch.dispatch({
      tenantId: account.tenant_id,
      userId: account.user_id,
      category: 'OPERATIONS',
      title: '[STAGING CAPTURE] Falcon notification acceptance',
      message:
        'Synthetic staging notification. No payment or document action is required.',
      actionLink: '/notifications',
      actionLabel: 'Open Falcon',
      severity: 'info',
      intent: 'info',
      metadata: { notificationStagingCapture: key },
    });
    await runner.commitTransaction();
    return { created: true, delivery: 'UNVERIFIED' };
  } catch {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    throw new Error(
      'Staging capture request failed; inspect saved intent before retry',
    );
  } finally {
    await runner.release();
  }
}

@Injectable()
export class NotificationStagingGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DataSource,
  ) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.method === 'GET' && req.path === '/health') return true;
    if (
      req.headers['x-tenant-subdomain'] &&
      req.headers['x-tenant-subdomain'] !== STAGING_NOTIFICATION_TENANT
    )
      throw new UnauthorizedException(
        'Synthetic notification staging account required',
      );
    const account = await verifyNotificationStagingDatabase(this.db);
    if (
      req.method === 'GET' &&
      req.path === '/api/tenants/resolve/notification-staging'
    )
      return true;
    if (req.method === 'POST' && req.path === '/api/auth/local-login') {
      const input = req.body as
        | { identifier?: unknown; email?: unknown }
        | undefined;
      if (
        (input?.identifier ?? input?.email) !==
          STAGING_NOTIFICATION_RECIPIENT ||
        req.headers['x-tenant-subdomain'] !== STAGING_NOTIFICATION_TENANT
      )
        throw new UnauthorizedException(
          'Synthetic notification staging account required',
        );
      return true;
    }
    const authorization = req.headers.authorization;
    const token =
      typeof authorization === 'string' && authorization.startsWith('Bearer ')
        ? authorization.slice(7)
        : (req.cookies as { falcon_auth_token?: string } | undefined)
            ?.falcon_auth_token;
    try {
      const payload = await this.jwt.verifyAsync<{
        sub?: string;
        tenantId?: string;
        authType?: string;
      }>(token ?? '');
      if (
        payload.sub !== account.user_id ||
        payload.tenantId !== account.tenant_id ||
        payload.authType === 'parent'
      )
        throw new Error();
      return true;
    } catch {
      throw new UnauthorizedException(
        'Synthetic notification staging account required',
      );
    }
  }
}

type NotificationRequest = { user: { user_id: string; tenant_id: string } };
@Controller('api/tenants')
export class NotificationStagingTenantController {
  constructor(private readonly tenants: TenantService) {}
  @Get('resolve/notification-staging')
  branding() {
    return this.tenants.getBrandingBySubdomain(STAGING_NOTIFICATION_TENANT);
  }
}
@Controller('api/notifications')
@UseGuards(JwtAuthGuard)
export class NotificationStagingInboxController {
  constructor(private readonly notifications: FalconNotificationsService) {}
  @Get() list(@Req() req: NotificationRequest, @Query('limit') limit?: string) {
    return this.notifications.listForUser(
      req.user.tenant_id,
      req.user.user_id,
      this.notifications.clampLimit(Number(limit)),
    );
  }
  @Get('recent') recent(@Req() req: NotificationRequest) {
    return this.notifications.listRecent(
      req.user.tenant_id,
      req.user.user_id,
      8,
    );
  }
  @Get('unread-count') async unread(@Req() req: NotificationRequest) {
    return {
      count: await this.notifications.unreadCount(
        req.user.tenant_id,
        req.user.user_id,
      ),
    };
  }
  @Patch(':id/read') read(
    @Req() req: NotificationRequest,
    @Param('id') id: string,
  ) {
    return this.notifications.markRead(
      id,
      req.user.tenant_id,
      req.user.user_id,
    );
  }
  @Patch(':id/dismiss') dismiss(
    @Req() req: NotificationRequest,
    @Param('id') id: string,
  ) {
    return this.notifications.dismiss(id, req.user.tenant_id, req.user.user_id);
  }
  @Post('mark-all-read') markAll(@Req() req: NotificationRequest) {
    return this.notifications.markAllRead(req.user.tenant_id, req.user.user_id);
  }
}

export class NotificationStagingRuntime
  implements
    OnApplicationBootstrap,
    OnModuleDestroy,
    BeforeApplicationShutdown,
    OnApplicationShutdown
{
  private readonly worker: Worker<NotificationDeliveryJob>;
  private readonly processor: NotificationDeliveryProcessor;
  private stopping = false;
  constructor(
    private readonly db: DataSource,
    _queue: Queue,
    channels: NotificationsService,
    config: ConfigService,
    settings: NotificationStagingConfig,
    account: StagingNotificationAccount,
  ) {
    channels.validateEmailDeliveryConfiguration();
    this.processor = new NotificationDeliveryProcessor(channels, db, config);
    this.worker = new Worker<NotificationDeliveryJob>(
      NOTIFICATION_DELIVERY_QUEUE,
      async (job, token) => {
        if (this.stopping)
          throw new Error('Notification staging worker stopping');
        if (
          job.data.userId !== account.user_id ||
          job.data.tenantId !== account.tenant_id ||
          job.data.channel !== 'EMAIL' ||
          job.data.email !== STAGING_NOTIFICATION_RECIPIENT
        ) {
          await job.moveToDelayed(Date.now() + 86_400_000, token);
          throw new DelayedError();
        }
        return this.processor.process(job, token);
      },
      {
        connection: settings.redis,
        prefix: settings.activation.prefix,
        autorun: false,
        limiter: notificationDeliveryLimiter(),
      },
    );
    this.worker.on('error', () => undefined);
  }
  async onApplicationBootstrap() {
    await this.worker.waitUntilReady();
    void this.worker.run().catch(() => undefined);
  }
  isRunning() {
    return !this.stopping && !this.worker.closing && this.worker.isRunning();
  }
  onModuleDestroy() {
    this.stopping = true;
    this.processor.onModuleDestroy();
    void this.worker.pause(true).catch(() => undefined);
  }
  async beforeApplicationShutdown() {
    this.onModuleDestroy();
    await this.processor.closeWorker(this.worker);
  }
  async onApplicationShutdown() {
    await this.beforeApplicationShutdown();
    // NotificationOutboxService owns the shared queue's bounded shutdown.
    if (this.db.isInitialized) await this.db.destroy();
  }
}

@Controller()
export class NotificationStagingHealthController {
  constructor(
    private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly runtime: NotificationStagingRuntime,
  ) {}
  @Get('health') async health() {
    try {
      await this.db.query('SELECT 1');
      if (
        (await this.redis.client.ping()) !== 'PONG' ||
        !this.runtime.isRunning()
      )
        throw new Error();
      return {
        status: 'ok',
        mode: 'notification-staging',
        database: 'ok',
        redis: 'ok',
        worker: 'running',
        email: 'capture-configured-not-delivery-evidence',
      };
    } catch {
      throw new ServiceUnavailableException(
        'Notification staging dependencies unavailable',
      );
    }
  }
}

@Module({})
export class NotificationStagingModule {
  static async configure(settings: NotificationStagingConfig) {
    assertNotificationStagingRuntime();
    await verifyNotificationStagingDns();
    const configModule = await ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      ignoreEnvVars: true,
      skipProcessEnv: true,
      load: [() => settings.selected],
    });
    return {
      module: NotificationStagingModule,
      imports: [configModule, PassportModule],
      controllers: [
        AuthController,
        NotificationStagingInboxController,
        NotificationStagingTenantController,
        NotificationStagingHealthController,
      ],
      providers: [
        {
          provide: DataSource,
          useFactory: async () => {
            const db = await new DataSource(settings.database).initialize();
            try {
              await verifyNotificationStagingDatabase(db);
              return db;
            } catch {
              await db.destroy();
              throw new Error('Notification staging database preflight failed');
            }
          },
        },
        {
          provide: STAGING_NOTIFICATION_ACCOUNT,
          inject: [DataSource],
          useFactory: verifyNotificationStagingDatabase,
        },
        ...[User, UserRole].map((entity) => ({
          provide: getRepositoryToken(entity),
          inject: [DataSource],
          useFactory: (db: DataSource) => db.getRepository(entity),
        })),
        {
          provide: JwtService,
          useValue: new JwtService({
            secret: settings.selected.JWT_SECRET,
            signOptions: { expiresIn: '1h' },
          }),
        },
        LocalAuthProvider,
        { provide: AUTH_PROVIDER, useExisting: LocalAuthProvider },
        {
          provide: TenantService,
          inject: [DataSource],
          useFactory: (db: DataSource) =>
            new TenantService(
              db.getRepository(Tenant),
              db.getRepository(TenantSubscription),
            ),
        },
        {
          provide: RedisService,
          inject: [ConfigService, DataSource],
          useFactory: (config: ConfigService) => {
            const redis = new RedisService(config);
            redis.client.on('error', () => undefined);
            return redis;
          },
        },
        CacheService,
        HrAccessControlService,
        HrEntityContextService,
        CampusScopeService,
        AuthService,
        JwtStrategy,
        JwtAuthGuard,
        { provide: APP_GUARD, useClass: NotificationStagingGuard },
        {
          provide: getQueueToken(NOTIFICATION_DELIVERY_QUEUE),
          inject: [DataSource],
          useFactory: () =>
            new Queue(NOTIFICATION_DELIVERY_QUEUE, {
              connection: settings.redis,
              prefix: settings.activation.prefix,
            }),
        },
        NotificationsGateway,
        {
          provide: FalconNotificationsService,
          inject: [DataSource, NotificationsGateway],
          useFactory: (db: DataSource, gateway: NotificationsGateway) =>
            new FalconNotificationsService(
              db.getRepository(FalconNotification),
              gateway,
            ),
        },
        {
          provide: NOTIFICATION_CAPTURE_DELIVERY,
          inject: [DataSource],
          useFactory: createStagingNotificationCapture,
        },
        NotificationsService,
        NotificationDispatchService,
        NotificationOutboxService,
        {
          provide: NotificationStagingRuntime,
          inject: [
            DataSource,
            getQueueToken(NOTIFICATION_DELIVERY_QUEUE),
            NotificationsService,
            ConfigService,
            STAGING_NOTIFICATION_ACCOUNT,
          ],
          useFactory: (
            db: DataSource,
            queue: Queue,
            channels: NotificationsService,
            config: ConfigService,
            account: StagingNotificationAccount,
          ) =>
            new NotificationStagingRuntime(
              db,
              queue,
              channels,
              config,
              settings,
              account,
            ),
        },
      ],
    };
  }
}
