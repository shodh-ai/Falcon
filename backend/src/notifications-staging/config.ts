import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import * as entities from '../entities';
import { notificationActivation } from '../core/notifications/notification-activation';
import { notificationEmailBody } from '../core/notifications/notification-email-body';

export const STAGING_NOTIFICATION_RECIPIENT =
  'notification-staging@example.invalid';
export const STAGING_NOTIFICATION_TENANT = 'notification-staging';
export const STAGING_TARGETS = Object.freeze({
  database: {
    host: 'falcon-notification-staging-postgres',
    address: '172.30.71.2',
    port: 5432,
  },
  redis: {
    host: 'falcon-notification-staging-redis',
    address: '172.30.71.3',
    port: 6379,
  },
  mail: {
    host: 'falcon-notification-staging-mail',
    address: '172.30.71.4',
    port: 1025,
  },
  ingress: '172.30.71.6',
});

/** Normal main.js, a host process or env flags alone cannot select this profile. */
export function assertNotificationStagingRuntime(
  env: NodeJS.ProcessEnv = process.env,
  argv: string[] = process.argv,
  platform: string = process.platform,
  container = existsSync('/.dockerenv'),
): void {
  if (
    env.NODE_ENV !== 'production' ||
    env.FALCON_NOTIFICATION_STAGING !== 'approved' ||
    env.NOTIFICATION_STAGING_CAPTURE_ONLY !== 'approved' ||
    platform !== 'linux' ||
    !container ||
    !argv[1] ||
    resolve(argv[1]) !== resolve(__dirname, 'main.js') ||
    ![
      '--approved-notification-staging',
      '--approved-notification-staging --capture-once',
    ].includes(argv.slice(2).join(' '))
  )
    throw new Error(
      'Explicit isolated notification staging entry point required',
    );
}

/** Pure preparation; callers must independently enforce the entry-point guard. */
export function notificationStagingConfig(env: NodeJS.ProcessEnv) {
  if (
    env.NODE_ENV !== 'production' ||
    env.FALCON_NOTIFICATION_STAGING !== 'approved' ||
    env.NOTIFICATION_STAGING_CAPTURE_ONLY !== 'approved'
  )
    throw new Error(
      'Explicit capture-only notification staging configuration required',
    );
  for (const key of Object.keys(env)) {
    if (
      /^(DB_|DATABASE_URL$|PG[A-Z_]|REDIS_|S3_|AWS_|EMAIL_|SMTP_|JWT_|GOOGLE_|FRONTEND_URL$|PORTAL_|FALCON_LOCAL_|RECOVERY_)/.test(
        key,
      )
    )
      throw new Error('Inherited application service configuration forbidden');
  }
  const exact = (key: string, expected: string) => {
    if (env[key] !== expected)
      throw new Error(`Notification staging setting rejected: ${key}`);
    return expected;
  };
  exact('NOTIFICATION_STAGING_DB_HOST', STAGING_TARGETS.database.host);
  exact('NOTIFICATION_STAGING_DB_PORT', '5432');
  exact('NOTIFICATION_STAGING_DB_NAME', 'falcon_notification_staging');
  exact('NOTIFICATION_STAGING_DB_USER', 'notification_staging_app');
  exact('NOTIFICATION_STAGING_REDIS_HOST', STAGING_TARGETS.redis.host);
  exact('NOTIFICATION_STAGING_REDIS_PORT', '6379');
  exact('NOTIFICATION_STAGING_MAIL_HOST', STAGING_TARGETS.mail.host);
  exact('NOTIFICATION_STAGING_MAIL_PORT', '1025');
  exact('NOTIFICATION_STAGING_PORT', '4110');
  const secret = (key: string, min = 24) => {
    const value = env[key];
    if (
      !value ||
      value.length < min ||
      /^(<|change|example|placeholder|your-|postgres|password|default)/i.test(
        value,
      )
    )
      throw new Error(`Notification staging credential required: ${key}`);
    return value;
  };
  const frontend = env.NOTIFICATION_STAGING_FRONTEND_URL;
  notificationEmailBody('', '/notifications', frontend, 'production');
  // Fail closed against production/local domains, rather than inventing a URL.
  const origin = new URL(frontend!);
  if (
    origin.protocol !== 'https:' ||
    !env.NOTIFICATION_STAGING_APPROVED_FRONTEND_HOST ||
    origin.hostname !== env.NOTIFICATION_STAGING_APPROVED_FRONTEND_HOST ||
    /^(localhost|127\.|\[::1\])/.test(origin.hostname)
  )
    throw new Error('Owner-approved HTTPS staging frontend required');
  const selected = {
    NODE_ENV: 'production',
    FRONTEND_URL: frontend!,
    JWT_SECRET: secret('NOTIFICATION_STAGING_JWT_SECRET', 32),
    REDIS_HOST: STAGING_TARGETS.redis.host,
    REDIS_PORT: STAGING_TARGETS.redis.port,
    REDIS_PASSWORD: secret('NOTIFICATION_STAGING_REDIS_PASSWORD'),
    PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
    PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED: 'false',
    PORTAL_NOTIFICATION_QUEUE_PREFIX: env.NOTIFICATION_STAGING_QUEUE_PREFIX,
    PORTAL_NOTIFICATION_ACTIVATED_AFTER:
      env.NOTIFICATION_STAGING_ACTIVATED_AFTER,
  };
  const activation = notificationActivation((key) => selected[key]);
  if (!activation.prefix.startsWith('falcon-notification-staging-'))
    throw new Error('Dedicated staging queue prefix required');
  const database: PostgresConnectionOptions = {
    type: 'postgres',
    host: STAGING_TARGETS.database.host,
    port: 5432,
    database: 'falcon_notification_staging',
    username: 'notification_staging_app',
    password: secret('NOTIFICATION_STAGING_DB_PASSWORD'),
    schema: 'public',
    entities: Object.values(entities).filter(
      (value) => typeof value === 'function',
    ),
    subscribers: [],
    migrations: [],
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    installExtensions: false,
    logging: false,
    extra: {
      max: 3,
      connectionTimeoutMillis: 3000,
      options: '-c search_path=public -c statement_timeout=10000',
    },
  };
  return Object.freeze({
    selected: Object.freeze(selected),
    activation: Object.freeze(activation),
    database,
    frontend: frontend!,
    redis: {
      host: STAGING_TARGETS.redis.host,
      port: 6379,
      password: selected.REDIS_PASSWORD,
      maxRetriesPerRequest: null,
    },
  });
}
export type NotificationStagingConfig = ReturnType<
  typeof notificationStagingConfig
>;
