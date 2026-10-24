import { falconEmailTransportOptions } from '../../common/email/falcon-email-sender';
import { redisConnectionOptions } from '../redis/redis-connection.config';
import { notificationActivation } from './notification-activation';
import { notificationEmailBody } from './notification-email-body';

type ReadConfiguration = (name: string) => unknown;

/** Pure release preflight: never loads .env, connects, starts a worker or sends. */
export function notificationReleaseConfiguration(read: ReadConfiguration) {
  const failures: string[] = [];
  const nonempty = (name: string) => {
    const value = read(name);
    return typeof value === 'string' && value.trim().length > 0;
  };
  if (read('NODE_ENV') !== 'production') failures.push('NODE_ENV');
  if (
    !['true', 'false'].includes(read('PORTAL_EMAIL_DELIVERY_ENABLED') as string)
  )
    failures.push('PORTAL_EMAIL_DELIVERY_ENABLED');
  // Scheduled sources have a separate, unresolved historical-event review.
  if (read('PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED') !== 'false')
    failures.push('PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED');
  try {
    notificationActivation(read);
  } catch {
    failures.push('PORTAL_NOTIFICATION_QUEUE_PREFIX/ACTIVATED_AFTER');
  }
  try {
    notificationEmailBody(
      '',
      '/notifications',
      read('FRONTEND_URL'),
      'production',
    );
    const hostname = new URL(String(read('FRONTEND_URL'))).hostname;
    if (
      ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(hostname) ||
      hostname.endsWith('.localhost')
    )
      throw new Error();
  } catch {
    failures.push('FRONTEND_URL');
  }
  try {
    // Validation only. Never return the transport object containing credentials.
    falconEmailTransportOptions(read);
  } catch {
    failures.push('EMAIL_HOST/PORT/SECURE/USER/PASSWORD');
  }
  try {
    if (
      !['REDIS_HOST', 'REDIS_PORT', 'REDIS_PASSWORD'].every(nonempty) ||
      !['true', 'false'].includes(read('REDIS_TLS') as string)
    )
      throw new Error();
    redisConnectionOptions(read);
  } catch {
    failures.push('REDIS_HOST/PORT/PASSWORD/USERNAME/TLS');
  }
  if (
    !['DB_HOST', 'DB_PORT', 'DB_DATABASE', 'DB_USERNAME', 'DB_PASSWORD'].every(
      nonempty,
    ) ||
    !/^[1-9]\d{0,4}$/.test(String(read('DB_PORT'))) ||
    Number(read('DB_PORT')) > 65_535 ||
    read('DB_SYNCHRONIZE') !== 'false'
  )
    failures.push('DB_HOST/PORT/DATABASE/USERNAME/PASSWORD/SYNCHRONIZE');
  if (!nonempty('JWT_SECRET') || String(read('JWT_SECRET')).length < 32)
    failures.push('JWT_SECRET');
  return {
    status: failures.length ? 'BLOCKED' : 'CONFIGURATION_VALID',
    invalidOrMissing: failures,
    deliveryEnabled: read('PORTAL_EMAIL_DELIVERY_ENABLED') === 'true',
    runtimeVerified: false,
    credentialsVerified: false,
    stagingAcceptanceVerified: false,
    productionReady: false,
  } as const;
}
