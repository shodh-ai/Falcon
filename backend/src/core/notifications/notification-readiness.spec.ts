import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationReadinessController } from './notification-readiness.controller';
import { NotificationReadinessService } from './notification-readiness.service';

describe('notification dependency readiness (offline)', () => {
  let db: { query: jest.Mock };
  let ping: jest.Mock;
  let queue: {
    name: string;
    opts: { prefix: string };
    client: Promise<{ ping: jest.Mock }>;
    isPaused: jest.Mock;
    closing?: Promise<void>;
  };
  let channels: {
    isEmailDeliveryEnabled: jest.Mock;
    validateEmailDeliveryConfiguration: jest.Mock;
  };
  let worker: { isDeliveryRunning: jest.Mock };
  let outbox: { isReconciliationReady: jest.Mock };
  let values: Record<string, unknown>;
  let service: NotificationReadinessService;
  beforeEach(() => {
    values = {
      NODE_ENV: 'production',
      FRONTEND_URL: 'https://staging.example.invalid',
      PORTAL_NOTIFICATION_QUEUE_PREFIX: 'falcon-notification-readiness-unit',
      PORTAL_NOTIFICATION_ACTIVATED_AFTER: '2025-01-01T00:00:00.000Z',
    };
    db = { query: jest.fn().mockResolvedValue([{ notification_ready: 1 }]) };
    ping = jest.fn().mockResolvedValue('PONG');
    queue = {
      name: 'notification-delivery',
      opts: { prefix: 'falcon-notification-readiness-unit' },
      client: Promise.resolve({ ping }),
      isPaused: jest.fn().mockResolvedValue(false),
    };
    channels = {
      isEmailDeliveryEnabled: jest.fn().mockReturnValue(true),
      validateEmailDeliveryConfiguration: jest.fn(),
    };
    worker = { isDeliveryRunning: jest.fn().mockReturnValue(true) };
    outbox = { isReconciliationReady: jest.fn().mockReturnValue(true) };
    service = new NotificationReadinessService(
      db as never,
      queue as never,
      new ConfigService(values),
      channels as never,
      worker as never,
      outbox as never,
    );
  });
  afterEach(() => jest.useRealTimers());

  it('returns only generic readiness after pure configuration/worker/outbox checks and SELECT1/PING/paused reads', async () => {
    await expect(service.check()).resolves.toEqual({ status: 'ok' });
    expect(db.query).toHaveBeenCalledWith('SELECT 1 AS notification_ready');
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(queue.isPaused).toHaveBeenCalledTimes(1);
    expect(channels.validateEmailDeliveryConfiguration).toHaveBeenCalledTimes(
      2,
    );
    expect(Object.keys(channels)).toEqual([
      'isEmailDeliveryEnabled',
      'validateEmailDeliveryConfiguration',
    ]);
  });

  it.each([
    'disabled',
    'invalid-transport',
    'stopped-worker',
    'unregistered-outbox',
    'wrong-queue',
    'wrong-prefix',
    'closing-queue',
    'legacy-prefix',
    'missing-cutoff',
    'unsafe-frontend',
  ])('fails closed before probing for %s', async (scenario) => {
    if (scenario === 'disabled')
      channels.isEmailDeliveryEnabled.mockReturnValue(false);
    if (scenario === 'invalid-transport')
      channels.validateEmailDeliveryConfiguration.mockImplementation(() => {
        throw Error('private SMTP setting');
      });
    if (scenario === 'stopped-worker')
      worker.isDeliveryRunning.mockReturnValue(false);
    if (scenario === 'unregistered-outbox')
      outbox.isReconciliationReady.mockReturnValue(false);
    if (scenario === 'wrong-queue') queue.name = 'legacy';
    if (scenario === 'wrong-prefix') queue.opts.prefix = 'bull';
    if (scenario === 'closing-queue') queue.closing = Promise.resolve();
    if (scenario === 'legacy-prefix')
      delete values.PORTAL_NOTIFICATION_QUEUE_PREFIX;
    if (scenario === 'missing-cutoff')
      delete values.PORTAL_NOTIFICATION_ACTIVATED_AFTER;
    if (scenario === 'unsafe-frontend')
      values.FRONTEND_URL = 'http://staging.example.invalid';
    await expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(ping).not.toHaveBeenCalled();
    expect(queue.isPaused).not.toHaveBeenCalled();
  });

  it.each([
    'database',
    'redis',
    'queue-paused',
    'queue-read-failure',
    'unexpected-database-result',
    'unexpected-ping',
  ])('does not return ready for %s', async (scenario) => {
    if (scenario === 'database')
      db.query.mockRejectedValue(Error('private database URL'));
    if (scenario === 'redis')
      ping.mockRejectedValue(Error('private Redis detail'));
    if (scenario === 'queue-paused') queue.isPaused.mockResolvedValue(true);
    if (scenario === 'queue-read-failure')
      queue.isPaused.mockRejectedValue(Error('private queue detail'));
    if (scenario === 'unexpected-database-result')
      db.query.mockResolvedValue([]);
    if (scenario === 'unexpected-ping') ping.mockResolvedValue('unexpected');
    try {
      await service.check();
      throw new Error('unexpected success');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect((error as ServiceUnavailableException).getResponse()).toEqual({
        statusCode: 503,
        error: 'Service Unavailable',
        message: 'Notification delivery unavailable',
      });
    }
  });

  it('shares one pending dependency probe across concurrent health checks', async () => {
    let finish: (rows: { notification_ready: number }[]) => void = () =>
      undefined;
    db.query.mockReturnValueOnce(
      new Promise<{ notification_ready: number }[]>((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.check();
    const second = service.check();
    await Promise.resolve();
    await Promise.resolve();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
    finish([{ notification_ready: 1 }]);
    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: 'ok' },
      { status: 'ok' },
    ]);
  });

  it('refuses a queue adapter that cannot perform the Redis PING probe', async () => {
    Object.defineProperty(queue, 'client', { value: Promise.resolve({}) });
    await expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
  });

  it('sanitizes synchronous dependency failures as unavailable', async () => {
    db.query.mockImplementation(() => {
      throw new Error('private PostgreSQL connector detail');
    });
    await expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
  });

  it('bounds response time and never piles up outstanding probes even if another dependency already failed', async () => {
    jest.useFakeTimers();
    let finish: (rows: { notification_ready: number }[]) => void = () =>
      undefined;
    db.query.mockReturnValueOnce(
      new Promise<{ notification_ready: number }[]>((resolve) => {
        finish = resolve;
      }),
    );
    ping.mockRejectedValueOnce(new Error('private Redis failure'));
    const first = expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
    await jest.advanceTimersByTimeAsync(1500);
    await first;
    await expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
    await expect(service.check()).rejects.toThrow(
      'Notification delivery unavailable',
    );
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
    finish([{ notification_ready: 1 }]);
    await jest.advanceTimersByTimeAsync(0);
    await expect(service.check()).resolves.toEqual({ status: 'ok' });
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('rechecks local lifecycle state after dependencies respond', async () => {
    let finish: (rows: { notification_ready: number }[]) => void = () =>
      undefined;
    db.query.mockReturnValueOnce(
      new Promise<{ notification_ready: number }[]>((resolve) => {
        finish = resolve;
      }),
    );
    const pending = service.check();
    await Promise.resolve();
    worker.isDeliveryRunning.mockReturnValue(false);
    finish([{ notification_ready: 1 }]);
    await expect(pending).rejects.toThrow('Notification delivery unavailable');
  });

  it('the public controller delegates readiness without adding a mail or job action', async () => {
    const controller = new NotificationReadinessController(service);
    await expect(controller.health()).resolves.toEqual({ status: 'ok' });
    expect(Reflect.getMetadata('path', NotificationReadinessController)).toBe(
      'health/notifications',
    );
    const handler: unknown = Object.getOwnPropertyDescriptor(
      NotificationReadinessController.prototype,
      'health',
    )?.value;
    if (typeof handler !== 'function')
      throw new Error('Missing health handler');
    expect(Reflect.getMetadata('isPublic', handler)).toBe(true);
  });
});
