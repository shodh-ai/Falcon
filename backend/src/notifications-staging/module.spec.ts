import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lookup } from 'node:dns/promises';
import { DataSource } from 'typeorm';
import { ConfigModule } from '@nestjs/config';
import {
  NotificationStagingModule,
  verifyNotificationStagingDatabase,
  verifyNotificationStagingDns,
  NotificationStagingGuard,
  requestOneStagingCapture,
} from './module';
import {
  assertNotificationStagingRuntime,
  notificationStagingConfig,
} from './config';
import {
  notificationStagingAccess,
  notificationStagingRoute,
  stagingSocketAllowed,
} from './main';
import type { ExecutionContext } from '@nestjs/common';

jest.mock('node:dns/promises', () => ({ lookup: jest.fn() }));
jest.mock('./config', () => ({
  ...jest.requireActual<typeof import('./config')>('./config'),
  assertNotificationStagingRuntime: jest.fn(),
}));
const environment = (): NodeJS.ProcessEnv => ({
  NODE_ENV: 'production',
  FALCON_NOTIFICATION_STAGING: 'approved',
  NOTIFICATION_STAGING_CAPTURE_ONLY: 'approved',
  NOTIFICATION_STAGING_DB_HOST: 'falcon-notification-staging-postgres',
  NOTIFICATION_STAGING_DB_PORT: '5432',
  NOTIFICATION_STAGING_DB_NAME: 'falcon_notification_staging',
  NOTIFICATION_STAGING_DB_USER: 'notification_staging_app',
  NOTIFICATION_STAGING_DB_PASSWORD: 'synthetic-only-never-used-DB-input',
  NOTIFICATION_STAGING_REDIS_HOST: 'falcon-notification-staging-redis',
  NOTIFICATION_STAGING_REDIS_PORT: '6379',
  NOTIFICATION_STAGING_REDIS_PASSWORD: 'synthetic-only-never-used-redis-input',
  NOTIFICATION_STAGING_MAIL_HOST: 'falcon-notification-staging-mail',
  NOTIFICATION_STAGING_MAIL_PORT: '1025',
  NOTIFICATION_STAGING_PORT: '4110',
  NOTIFICATION_STAGING_FRONTEND_URL: 'https://staging.example.invalid',
  NOTIFICATION_STAGING_APPROVED_FRONTEND_HOST: 'staging.example.invalid',
  NOTIFICATION_STAGING_JWT_SECRET:
    'synthetic-only-never-used-private-JWT-input',
  NOTIFICATION_STAGING_QUEUE_PREFIX: 'falcon-notification-staging-offline-test',
  NOTIFICATION_STAGING_ACTIVATED_AFTER: '2025-01-01T00:00:00.000Z',
});
const identity = {
  database_name: 'falcon_notification_staging',
  username: 'notification_staging_app',
  server_address: '172.30.71.2',
  server_port: 5432,
  schema_name: 'public',
  superuser: false,
  createdb: false,
  createrole: false,
  bypassrls: false,
  replication: false,
  schema_create: false,
  db_create: false,
  memberships: false,
  owns_objects: false,
  marker_owner: 'notification_staging_owner',
};
const marker = {
  id: true,
  environment: 'falcon-notification-staging',
  version: 1,
};
const account = {
  user_id: 'synthetic-user',
  tenant_id: 'synthetic-tenant',
  official_email: 'notification-staging@example.invalid',
  is_active: true,
  tenant_active: true,
  subdomain: 'notification-staging',
  role_name: 'Faculty',
};
const database = (replacement: Record<string, unknown> = {}) => ({
  query: jest.fn((sql: string): Promise<unknown[]> => {
    if (sql.includes('FROM pg_roles'))
      return Promise.resolve([{ ...identity, ...replacement }]);
    if (sql.includes('notification_staging_environment'))
      return Promise.resolve([marker]);
    return Promise.resolve([account]);
  }),
});

describe('restricted notification staging module (offline)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(assertNotificationStagingRuntime)
      .mockImplementation(() => undefined);
    jest.mocked(lookup).mockImplementation(
      (host) =>
        Promise.resolve([
          {
            address: (
              {
                'falcon-notification-staging-postgres': '172.30.71.2',
                'falcon-notification-staging-redis': '172.30.71.3',
                'falcon-notification-staging-mail': '172.30.71.4',
              } as Record<string, string>
            )[String(host)],
            family: 4,
          },
        ]) as never,
    );
  });
  it('verifies dedicated DB, unprivileged role, owner marker and canonical synthetic account with SELECT only', async () => {
    const db = database();
    await expect(
      verifyNotificationStagingDatabase(db as never),
    ).resolves.toEqual({
      user_id: 'synthetic-user',
      tenant_id: 'synthetic-tenant',
    });
    expect(db.query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(
      true,
    );
  });
  it.each([
    ['database_name', 'university_governance'],
    ['username', 'postgres'],
    ['server_address', '127.0.0.1'],
    ['server_port', 5433],
    ['schema_name', 'tenant_schema'],
    ['marker_owner', 'other_owner'],
    ['superuser', true],
    ['createdb', true],
    ['createrole', true],
    ['bypassrls', true],
    ['replication', true],
    ['schema_create', true],
    ['db_create', true],
    ['memberships', true],
    ['owns_objects', true],
  ])('rejects incorrect identity/privileges %s', async (key, value) => {
    await expect(
      verifyNotificationStagingDatabase(database({ [key]: value }) as never),
    ).rejects.toThrow('Restricted');
  });
  it('rejects missing marker and real/noncanonical/duplicate/inactive account', async () => {
    for (const invalid of [
      [],
      [{ ...marker, version: 2 }],
      [marker, marker],
      [{ ...marker, id: false }],
    ]) {
      const db = {
        query: jest
          .fn()
          .mockResolvedValueOnce([identity])
          .mockResolvedValueOnce(invalid),
      };
      await expect(
        verifyNotificationStagingDatabase(db as never),
      ).rejects.toThrow('marker');
    }
    for (const invalid of [
      [],
      [account, account],
      [{ ...account, official_email: 'real@example.com' }],
      [{ ...account, is_active: false }],
      [{ ...account, tenant_active: false }],
      [{ ...account, subdomain: 'other' }],
      [{ ...account, role_name: 'Admin' }],
    ]) {
      const db = {
        query: jest
          .fn()
          .mockResolvedValueOnce([identity])
          .mockResolvedValueOnce([marker])
          .mockResolvedValueOnce(invalid),
      };
      await expect(
        verifyNotificationStagingDatabase(db as never),
      ).rejects.toThrow('synthetic');
    }
  });
  it('refuses unexpected DNS destinations before providers exist', async () => {
    jest
      .mocked(lookup)
      .mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
    await expect(verifyNotificationStagingDns()).rejects.toThrow('destination');
  });
  it('prepares real services without connecting or importing normal/side-effect modules', async () => {
    const initialize = jest.spyOn(DataSource.prototype, 'initialize');
    const config = jest.spyOn(ConfigModule, 'forRoot');
    const module = await NotificationStagingModule.configure(
      notificationStagingConfig(environment()),
    );
    expect(initialize).not.toHaveBeenCalled();
    expect(config).toHaveBeenCalledWith(
      expect.objectContaining({
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        skipProcessEnv: true,
      }),
    );
    const providerNames = module.providers.map((provider) =>
      typeof provider === 'function' ? provider.name : '',
    );
    expect(providerNames).toEqual(
      expect.arrayContaining([
        'AuthService',
        'NotificationDispatchService',
        'NotificationOutboxService',
        'NotificationsService',
        'NotificationsGateway',
      ]),
    );
    const source = readFileSync(resolve(__dirname, 'module.ts'), 'utf8');
    expect(source).not.toMatch(
      /import .*AppModule|import .*ScheduleModule|import .*StorageModule|import .*AuthModule|import .*NotificationsModule/,
    );
    const normal = readFileSync(
      resolve(__dirname, '../core/notifications/notifications.module.ts'),
      'utf8',
    );
    expect(normal).not.toContain('NOTIFICATION_CAPTURE_DELIVERY');
    initialize.mockRestore();
    config.mockRestore();
  });
  it('guards synthetic login and rejects mismatched tenant/user tokens without account writes', async () => {
    const req = {
      method: 'GET',
      path: '/api/notifications',
      headers: { authorization: 'Bearer synthetic' },
    };
    const context = {
      switchToHttp: () => ({ getRequest: () => req }),
    } as ExecutionContext;
    const db = database();
    const guard = new NotificationStagingGuard(
      {
        verifyAsync: jest
          .fn()
          .mockResolvedValue({ sub: 'other', tenantId: 'synthetic-tenant' }),
      } as never,
      db as never,
    );
    await expect(guard.canActivate(context)).rejects.toThrow('Synthetic');
    expect(db.query.mock.calls.every(([sql]) => /^SELECT/.test(sql))).toBe(
      true,
    );
  });
  it.each([
    ['POST', '/api/auth/forgot-password'],
    ['POST', '/api/auth/reset-password'],
    ['GET', '/api/auth/google'],
    ['POST', '/api/notifications/local-test'],
    ['POST', '/api/finance/receipt'],
    ['GET', '/api/tasks/assignments/my'],
  ])(
    'does not expose recovery, OAuth, producer or unrelated routes (%s %s)',
    (method, path) => {
      expect(notificationStagingRoute(method, path)).toBe(false);
    },
  );
  it('allows only approved ingress peer and browser Origin for HTTP/socket connections', () => {
    const next = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const access = notificationStagingAccess('https://staging.example.invalid');
    access(
      {
        method: 'GET',
        path: '/health',
        socket: { remoteAddress: '172.30.71.5' },
        headers: {},
      } as never,
      res as never,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    expect(
      stagingSocketAllowed(
        {
          socket: { remoteAddress: '172.30.71.6' },
          headers: { origin: 'https://staging.example.invalid' },
        } as never,
        'https://staging.example.invalid',
      ),
    ).toBe(true);
    expect(
      stagingSocketAllowed(
        {
          socket: { remoteAddress: '172.30.71.6' },
          headers: { origin: 'https://other.example.invalid' },
        } as never,
        'https://staging.example.invalid',
      ),
    ).toBe(false);
    expect(
      stagingSocketAllowed(
        { socket: { remoteAddress: '172.30.71.6' }, headers: {} } as never,
        'https://staging.example.invalid',
      ),
    ).toBe(false);
  });
  it('never calls the prepared one-shot producer during module startup', () => {
    const source = readFileSync(resolve(__dirname, 'main.ts'), 'utf8');
    const normalStartup = source.slice(
      source.indexOf('export async function startNotificationStaging()'),
      source.indexOf('export async function requestNotificationStagingOnce()'),
    );
    expect(normalStartup).not.toContain('requestOneStagingCapture(');
    expect(source).toContain(
      "'--approved-notification-staging --capture-once'",
    );
    expect(source).toMatch(/app\.listen\(4110,\s*'0\.0\.0\.0'\)/);
  });
  it('uses a serialized durable guard before invoking the actual dispatcher once', async () => {
    const original = process.env;
    process.env = environment();
    const settings = notificationStagingConfig(process.env);
    const runner = {
      ...database(),
      connect: jest.fn(),
      startTransaction: jest.fn(),
      commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(),
      release: jest.fn(),
      isTransactionActive: true,
    };
    const query = runner.query;
    runner.query = jest.fn(async (sql: string) =>
      sql.includes('pg_advisory_xact_lock') ||
      sql.includes('notificationStagingCapture')
        ? []
        : query(sql),
    );
    const db = { ...database(), createQueryRunner: () => runner };
    const dispatch = { dispatch: jest.fn().mockResolvedValue({}) };
    try {
      await expect(
        requestOneStagingCapture(db as never, dispatch as never, settings),
      ).resolves.toEqual({ created: true, delivery: 'UNVERIFIED' });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'synthetic-user',
          tenantId: 'synthetic-tenant',
        }),
      );
      const sent = dispatch.dispatch.mock.calls as unknown as Array<
        [{ metadata: { notificationStagingCapture: string } }]
      >;
      expect(sent[0][0].metadata.notificationStagingCapture).toBe(
        `${settings.activation.prefix}:${new Date(settings.activation.timestamp).toISOString()}`,
      );
      runner.query = jest.fn(async (sql: string) =>
        sql.includes('notificationStagingCapture')
          ? [{ notification_id: 'existing' }]
          : sql.includes('pg_advisory_xact_lock')
            ? []
            : query(sql),
      );
      await expect(
        requestOneStagingCapture(db as never, dispatch as never, settings),
      ).resolves.toEqual({ created: false, reason: 'EXISTING_STAGING_INTENT' });
      expect(dispatch.dispatch).toHaveBeenCalledTimes(1);
    } finally {
      process.env = original;
    }
  });
});
