import {
  notificationActivation,
  notificationQueuePrefix,
} from './notification-activation';

describe('notification activation policy', () => {
  const now = Date.UTC(2026, 9, 15, 12);
  const cutoff = '2026-10-15T10:00:00.000Z';
  const approved: Record<string, unknown> = {
    PORTAL_NOTIFICATION_QUEUE_PREFIX: 'falcon-notification-synthetic-cutover',
    PORTAL_NOTIFICATION_ACTIVATED_AFTER: cutoff,
  };

  it('requires an explicit dedicated prefix and canonical UTC cutover', () => {
    expect(notificationActivation((key) => approved[key], now)).toEqual({
      prefix: 'falcon-notification-synthetic-cutover',
      timestamp: Date.parse(cutoff),
    });
  });

  it('keeps the configured cutoff stable across restarts', () => {
    expect(notificationActivation((key) => approved[key], now)).toEqual(
      notificationActivation((key) => approved[key], now + 86_400_000),
    );
    expect(approved.PORTAL_NOTIFICATION_ACTIVATED_AFTER).toBe(cutoff);
  });

  it('retains the legacy prefix for unconfigured producers but never activates its worker', () => {
    expect(notificationQueuePrefix(() => undefined)).toBe('bull');
    expect(() => notificationActivation(() => undefined, now)).toThrow();
  });

  it.each([
    undefined,
    '',
    'bull',
    'existing-production-queue',
    'falcon-notification-',
    'falcon-notification-UPPERCASE',
    'falcon-notification-unsafe:namespace',
    'falcon-notification-unsafe/namespace',
    `falcon-notification-${'x'.repeat(81)}`,
    false,
  ])('rejects the unsafe or missing activation prefix %p', (value) => {
    const config = { ...approved, PORTAL_NOTIFICATION_QUEUE_PREFIX: value };
    expect(() => notificationActivation((key) => config[key], now)).toThrow();
  });

  it.each([
    undefined,
    '',
    null,
    Date.parse(cutoff),
    'not-a-date',
    '2026-10-15T13:00:00.000Z',
    '2019-12-31T23:59:59.999Z',
    '2026-10-15T10:00:00Z',
    '2026-10-15T15:30:00.000+05:30',
    '2026-10-15T10:00:00.000',
    '2026-10-15',
    '2026-02-30T10:00:00.000Z',
  ])(
    'rejects missing, future, malformed, or noncanonical UTC cutoff %p',
    (value) => {
      const config = {
        ...approved,
        PORTAL_NOTIFICATION_ACTIVATED_AFTER: value,
      };
      expect(() => notificationActivation((key) => config[key], now)).toThrow(
        'Explicit fresh notification queue and UTC cutover required',
      );
    },
  );
});
