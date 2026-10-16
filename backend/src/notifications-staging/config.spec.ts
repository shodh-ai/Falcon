import { resolve } from 'node:path';
import {
  assertNotificationStagingRuntime,
  notificationStagingConfig,
} from './config';

export const stagingEnvironment = (): NodeJS.ProcessEnv => ({
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

describe('isolated notification staging configuration (offline)', () => {
  it('prepares only dedicated targets with no schema initialization or workers', () => {
    const settings = notificationStagingConfig(stagingEnvironment());
    expect(settings.database).toEqual(
      expect.objectContaining({
        host: 'falcon-notification-staging-postgres',
        database: 'falcon_notification_staging',
        username: 'notification_staging_app',
        synchronize: false,
        migrationsRun: false,
        dropSchema: false,
        installExtensions: false,
        migrations: [],
        subscribers: [],
        logging: false,
      }),
    );
    expect(settings.selected).not.toHaveProperty('EMAIL_PASSWORD');
    expect(settings.selected.PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED).toBe(
      'false',
    );
  });
  it.each([
    ['NODE_ENV', 'development'],
    ['FALCON_NOTIFICATION_STAGING', undefined],
    ['NOTIFICATION_STAGING_CAPTURE_ONLY', 'true'],
    ['NOTIFICATION_STAGING_DB_HOST', '127.0.0.1'],
    ['NOTIFICATION_STAGING_DB_PORT', '5433'],
    ['NOTIFICATION_STAGING_DB_NAME', 'university_governance'],
    ['NOTIFICATION_STAGING_DB_USER', 'postgres'],
    ['NOTIFICATION_STAGING_DB_PASSWORD', 'password'],
    ['NOTIFICATION_STAGING_REDIS_HOST', 'redis.example.invalid'],
    ['NOTIFICATION_STAGING_MAIL_HOST', 'smtp.gmail.com'],
    ['NOTIFICATION_STAGING_MAIL_PORT', '587'],
    ['NOTIFICATION_STAGING_PORT', '4000'],
    ['NOTIFICATION_STAGING_FRONTEND_URL', 'http://localhost:3001'],
    [
      'NOTIFICATION_STAGING_FRONTEND_URL',
      'https://staging.example.invalid/path',
    ],
    ['NOTIFICATION_STAGING_FRONTEND_URL', 'https://other.example.invalid'],
    ['NOTIFICATION_STAGING_APPROVED_FRONTEND_HOST', undefined],
    ['NOTIFICATION_STAGING_QUEUE_PREFIX', 'bull'],
    ['NOTIFICATION_STAGING_QUEUE_PREFIX', 'falcon-notification-production'],
    ['NOTIFICATION_STAGING_ACTIVATED_AFTER', '2035-01-01T00:00:00.000Z'],
    ['DB_HOST', 'localhost'],
    ['EMAIL_USER', 'personal@example.invalid'],
    ['PORTAL_EMAIL_DELIVERY_ENABLED', 'true'],
  ])('rejects unsafe/missing %s (%#)', (key, value) => {
    const env = stagingEnvironment();
    env[key] = value;
    expect(() => notificationStagingConfig(env)).toThrow();
  });
  it('requires compiled entrypoint, explicit CLI, Linux container and every guard', () => {
    const env = stagingEnvironment();
    const argv = [
      'node',
      resolve(__dirname, 'main.js'),
      '--approved-notification-staging',
    ];
    expect(() =>
      assertNotificationStagingRuntime(env, argv, 'linux', true),
    ).not.toThrow();
    expect(() =>
      assertNotificationStagingRuntime(
        env,
        [...argv, '--capture-once'],
        'linux',
        true,
      ),
    ).not.toThrow();
    expect(() =>
      assertNotificationStagingRuntime(
        env,
        [...argv, '--unknown'],
        'linux',
        true,
      ),
    ).toThrow();
    expect(() =>
      assertNotificationStagingRuntime(
        env,
        [
          'node',
          resolve(__dirname, '../main.js'),
          '--approved-notification-staging',
        ],
        'linux',
        true,
      ),
    ).toThrow();
    expect(() =>
      assertNotificationStagingRuntime(env, argv.slice(0, 2), 'linux', true),
    ).toThrow();
    expect(() =>
      assertNotificationStagingRuntime(env, argv, 'darwin', true),
    ).toThrow();
    expect(() =>
      assertNotificationStagingRuntime(env, argv, 'linux', false),
    ).toThrow();
    expect(() =>
      assertNotificationStagingRuntime(
        { ...env, FALCON_NOTIFICATION_STAGING: undefined },
        argv,
        'linux',
        true,
      ),
    ).toThrow();
  });
});
