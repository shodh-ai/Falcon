import { notificationReleaseConfiguration } from './notification-release.config';

describe('offline notification release configuration', () => {
  const valid: Record<string, string> = {
    NODE_ENV: 'production',
    PORTAL_EMAIL_DELIVERY_ENABLED: 'false',
    PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED: 'false',
    PORTAL_NOTIFICATION_QUEUE_PREFIX: 'falcon-notification-release-test',
    PORTAL_NOTIFICATION_ACTIVATED_AFTER: '2025-01-01T00:00:00.000Z',
    FRONTEND_URL: 'https://portal.example.test',
    EMAIL_HOST: 'smtp.gmail.com',
    EMAIL_PORT: '587',
    EMAIL_SECURE: 'false',
    EMAIL_USER: 'noreply.ums@mygyanvihar.com',
    EMAIL_PASSWORD: 'offline-placeholder-not-a-credential',
    REDIS_HOST: 'redis.example.test',
    REDIS_PORT: '6379',
    REDIS_USERNAME: 'notification-app',
    REDIS_TLS: 'true',
    REDIS_PASSWORD: 'offline-placeholder-not-a-credential',
    DB_HOST: 'db.example.test',
    DB_PORT: '5432',
    DB_DATABASE: 'notification_fixture',
    DB_USERNAME: 'synthetic-app',
    DB_PASSWORD: 'offline-placeholder-not-a-credential',
    DB_SYNCHRONIZE: 'false',
    JWT_SECRET: 'offline-placeholder-not-a-signing-secret',
  };
  const check = (overrides: Record<string, unknown> = {}) =>
    notificationReleaseConfiguration(
      (key) => ({ ...valid, ...overrides })[key],
    );
  it('validates explicit configuration without claiming credentials, delivery or deployment', () => {
    expect(check()).toEqual({
      status: 'CONFIGURATION_VALID',
      invalidOrMissing: [],
      deliveryEnabled: false,
      runtimeVerified: false,
      credentialsVerified: false,
      stagingAcceptanceVerified: false,
      productionReady: false,
    });
    expect(
      check({ PORTAL_EMAIL_DELIVERY_ENABLED: 'true' }).productionReady,
    ).toBe(false);
  });
  it.each([
    ['NODE_ENV', 'development'],
    ['PORTAL_EMAIL_DELIVERY_ENABLED', 'yes'],
    ['PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED', 'true'],
    ['PORTAL_NOTIFICATION_SCHEDULED_ALERTS_ENABLED', undefined],
    ['PORTAL_NOTIFICATION_QUEUE_PREFIX', 'bull'],
    ['PORTAL_NOTIFICATION_ACTIVATED_AFTER', '2999-01-01T00:00:00.000Z'],
    ['FRONTEND_URL', 'http://localhost:3000'],
    ['FRONTEND_URL', 'https://localhost'],
    ['EMAIL_USER', 'personal@example.test'],
    ['EMAIL_HOST', 'other.example.test'],
    ['EMAIL_PASSWORD', ''],
    ['REDIS_HOST', undefined],
    ['REDIS_PORT', '0'],
    ['REDIS_PASSWORD', ''],
    ['REDIS_TLS', 'insecure'],
    ['REDIS_TLS', undefined],
    ['DB_HOST', undefined],
    ['DB_PORT', '70000'],
    ['DB_PASSWORD', ''],
    ['DB_SYNCHRONIZE', 'true'],
    ['JWT_SECRET', 'short'],
  ])('blocks unsafe or missing %s without exposing values', (key, value) => {
    expect(check({ [key]: value }).status).toBe('BLOCKED');
  });
  it('prints only field groups and booleans, never input values or secrets', () => {
    const secret = 'PRIVATE-value-not-to-return';
    const output = JSON.stringify(
      check({
        EMAIL_PASSWORD: secret,
        DB_PASSWORD: secret,
        REDIS_PASSWORD: secret,
        EMAIL_HOST: secret,
        DB_DATABASE: secret,
      }),
    );
    expect(output).not.toContain(secret);
    expect(output).not.toContain(valid.EMAIL_USER);
    expect(output).not.toContain(valid.FRONTEND_URL);
  });
});
