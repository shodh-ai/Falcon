import { Logger } from '@nestjs/common';
import { DelayedError, Job, UnrecoverableError } from 'bullmq';
import type { NotificationDeliveryJob } from '../../common/constants/notification-queue.constants';
import { NotificationDeliveryProcessor } from './notification-delivery.processor';
import { ConfigService } from '@nestjs/config';
import { falconEmailTransportOptions } from '../../common/email/falcon-email-sender';

describe('NotificationDeliveryProcessor', () => {
  const prefix = 'falcon-notification-unit-only';
  const cutoff = '2025-01-01T00:00:00.000Z';
  const cutoffTimestamp = Date.parse(cutoff);
  const data: NotificationDeliveryJob = {
    notificationId: 'notification-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    category: 'FINANCE',
    title: 'Fee reminder',
    message: 'Please review your due date.',
    channel: 'EMAIL',
    email: 'stored@example.test',
  };
  let channels: {
    isEmailDeliveryEnabled: jest.Mock;
    validateEmailDeliveryConfiguration: jest.Mock;
    sendEmail: jest.Mock;
    sendSms: jest.Mock;
  };
  let db: { query: jest.Mock };
  let policy: Record<string, unknown>;
  let processor: NotificationDeliveryProcessor;
  const job = (
    overrides: Partial<NotificationDeliveryJob> = {},
    metadata: Partial<
      Pick<Job<NotificationDeliveryJob>, 'timestamp' | 'queueQualifiedName'>
    > = {},
  ) =>
    ({
      data: { ...data, ...overrides },
      id: 'notification-a',
      timestamp: cutoffTimestamp,
      queueQualifiedName: `${prefix}:notification-delivery`,
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
      ...metadata,
    }) as unknown as Job<NotificationDeliveryJob>;

  beforeEach(() => {
    channels = {
      isEmailDeliveryEnabled: jest.fn().mockReturnValue(true),
      validateEmailDeliveryConfiguration: jest.fn(() =>
        falconEmailTransportOptions((key) => policy[key]),
      ),
      sendEmail: jest.fn().mockResolvedValue(true),
      sendSms: jest.fn(),
    };
    db = {
      query: jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('SELECT u.official_email')) {
          return Promise.resolve([
            { official_email: 'Stored@example.test', phone: 'synthetic-phone' },
          ]);
        }
        if (sql.includes('RETURNING title, message, action_link')) {
          return Promise.resolve([
            { title: data.title, message: data.message, action_link: null },
          ]);
        }
        if (sql.includes('RETURNING notification_id')) {
          return Promise.resolve([{ notification_id: 'notification-a' }]);
        }
        return Promise.resolve([]);
      }),
    };
    policy = {
      PORTAL_NOTIFICATION_QUEUE_PREFIX: prefix,
      PORTAL_NOTIFICATION_ACTIVATED_AFTER: cutoff,
      EMAIL_HOST: 'smtp.gmail.com',
      EMAIL_PORT: '587',
      EMAIL_SECURE: 'false',
      EMAIL_USER: 'noreply.ums@mygyanvihar.com',
      EMAIL_PASSWORD: 'mock-credential-not-valid',
      FRONTEND_URL: 'https://falcon.example.test',
      NODE_ENV: 'production',
    };
    processor = new NotificationDeliveryProcessor(
      channels as never,
      db as never,
      { get: (key: string) => policy[key] } as ConfigService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('registers a non-running worker so disabled startup cannot consume backlog', () => {
    expect(
      Reflect.getMetadata(
        'bullmq:worker_metadata',
        NotificationDeliveryProcessor,
      ),
    ).toEqual({ autorun: false, limiter: { max: 1, duration: 1000 } });
    channels.isEmailDeliveryEnabled.mockReturnValue(false);
    const worker = jest.spyOn(processor, 'worker', 'get');
    processor.onApplicationBootstrap();
    expect(worker).not.toHaveBeenCalled();
    worker.mockRestore();
  });

  it('starts the worker only after explicit enablement without blocking bootstrap', () => {
    const run = jest.fn().mockReturnValue(new Promise<void>(() => {}));
    const worker = jest
      .spyOn(processor, 'worker', 'get')
      .mockReturnValue({ run, isRunning: () => false } as never);
    expect(processor.onApplicationBootstrap()).toBeUndefined();
    expect(run).toHaveBeenCalledTimes(1);
    worker.mockRestore();
  });

  it('does not start a worker twice', () => {
    const run = jest.fn();
    const worker = jest
      .spyOn(processor, 'worker', 'get')
      .mockReturnValue({ run, isRunning: () => true } as never);
    processor.onApplicationBootstrap();
    expect(run).not.toHaveBeenCalled();
    worker.mockRestore();
  });

  it.each([
    { running: true, paused: false, closing: false, expected: true },
    { running: false, paused: false, closing: false, expected: false },
    { running: true, paused: true, closing: false, expected: false },
    { running: true, paused: false, closing: true, expected: false },
  ])(
    'reports delivery lifecycle readiness without touching a job (%#)',
    ({ running, paused, closing, expected }) => {
      const worker = jest.spyOn(processor, 'worker', 'get').mockReturnValue({
        isRunning: () => running,
        isPaused: () => paused,
        closing: closing ? Promise.resolve() : undefined,
      } as never);
      expect(processor.isDeliveryRunning()).toBe(expected);
      expect(db.query).not.toHaveBeenCalled();
      expect(channels.sendEmail).not.toHaveBeenCalled();
      worker.mockRestore();
    },
  );

  it('reports unavailable before a Bull worker has been registered', () => {
    expect(processor.isDeliveryRunning()).toBe(false);
  });

  it('stops admission before shutdown without database, SMTP or job mutations', async () => {
    const target = {
      pause: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
    };
    jest.spyOn(processor, 'worker', 'get').mockReturnValue(target as never);
    const pending = job();
    processor.onModuleDestroy();
    await expect(processor.process(pending)).rejects.toThrow('stopping');
    await processor.beforeApplicationShutdown();
    expect(target.close.mock.calls).toEqual([[true]]);
    expect(db.query).not.toHaveBeenCalled();
    expect(channels.sendEmail).not.toHaveBeenCalled();
    expect(
      (pending as unknown as { moveToDelayed: jest.Mock }).moveToDelayed,
    ).not.toHaveBeenCalled();
    expect(processor.isDeliveryRunning()).toBe(false);
  });

  it('can stop a runtime with no registered worker', async () => {
    processor.onModuleDestroy();
    await expect(
      processor.beforeApplicationShutdown(),
    ).resolves.toBeUndefined();
    expect(db.query).not.toHaveBeenCalled();
  });

  it('cannot begin SMTP if a database lookup completes after the shutdown budget', async () => {
    jest.useFakeTimers();
    try {
      let finish!: (value: unknown[]) => void;
      db.query.mockImplementationOnce(
        () =>
          new Promise<unknown[]>((resolve) => {
            finish = resolve;
          }),
      );
      const target = {
        pause: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        disconnect: jest.fn(),
      };
      jest.spyOn(processor, 'worker', 'get').mockReturnValue(target as never);
      const delivery = processor.process(job());
      const outcome = expect(delivery).rejects.toThrow('shutdown');
      processor.onModuleDestroy();
      const closing = processor.beforeApplicationShutdown();
      await jest.advanceTimersByTimeAsync(25_001);
      await closing;
      finish([{ official_email: 'stored@example.test', phone: null }]);
      await outcome;
      expect(db.query).toHaveBeenCalledTimes(1);
      expect(channels.sendEmail).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it.each([
    ['EMAIL_HOST', undefined],
    ['EMAIL_HOST', 'external.example.test'],
    ['EMAIL_PORT', '25'],
    ['EMAIL_PORT', '587unexpected'],
    ['EMAIL_SECURE', 'true'],
    ['EMAIL_USER', undefined],
    ['EMAIL_USER', 'personal@example.test'],
    ['EMAIL_PASSWORD', undefined],
    ['EMAIL_PASSWORD', ''],
    ['FRONTEND_URL', undefined],
    ['FRONTEND_URL', ''],
    ['FRONTEND_URL', 'https://falcon.example.test/'],
    ['FRONTEND_URL', 'https://falcon.example.test/path'],
    ['FRONTEND_URL', 'https://user:private@falcon.example.test'],
    ['FRONTEND_URL', 'http://falcon.example.test'],
    ['FRONTEND_URL', 'http://127.0.0.1:3001'],
  ])(
    'keeps delivery intents untouched when %s is unsafe (%#)',
    (key, value) => {
      policy[key] = value;
      const worker = jest.spyOn(processor, 'worker', 'get');
      const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
      processor.onApplicationBootstrap();
      expect(worker).not.toHaveBeenCalled();
      expect(db.query).not.toHaveBeenCalled();
      expect(channels.sendEmail).not.toHaveBeenCalled();
      expect(channels.sendSms).not.toHaveBeenCalled();
      expect(warn.mock.calls).toEqual([
        ['Portal notification worker disabled (DELIVERY_CONFIGURATION)'],
      ]);
    },
  );

  it('allows validated loopback links only in explicit development mode', () => {
    policy.NODE_ENV = 'development';
    policy.FRONTEND_URL = 'http://127.0.0.1:3001';
    const run = jest.fn().mockReturnValue(new Promise<void>(() => {}));
    jest.spyOn(processor, 'worker', 'get').mockReturnValue({
      run,
      isRunning: () => false,
    } as never);
    processor.onApplicationBootstrap();
    expect(run).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(channels.sendEmail).not.toHaveBeenCalled();
  });

  it.each([
    'PORTAL_NOTIFICATION_QUEUE_PREFIX',
    'PORTAL_NOTIFICATION_ACTIVATED_AFTER',
  ])('keeps the worker stopped when %s is missing', (key) => {
    delete policy[key];
    const worker = jest.spyOn(processor, 'worker', 'get');
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    processor.onApplicationBootstrap();
    expect(worker).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(
      'Portal notification worker disabled (ACTIVATION_REQUIRED)',
    );
  });

  it('sanitizes run failures without unhandled promise rejections', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const worker = jest.spyOn(processor, 'worker', 'get').mockReturnValue({
      run: jest.fn().mockRejectedValue(new Error('private provider details')),
      isRunning: () => false,
    } as never);
    processor.onApplicationBootstrap();
    await Promise.resolve();
    expect(warn).toHaveBeenCalledWith(
      'Portal notification worker stopped (QUEUE_FAILURE)',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private provider');
    warn.mockRestore();
    worker.mockRestore();
  });

  it('retains a locked job without sending or querying if delivery is disabled mid-run', async () => {
    channels.isEmailDeliveryEnabled.mockReturnValue(false);
    const pending = job();
    const reschedule = jest.spyOn(pending, 'moveToDelayed');
    await expect(
      processor.process(pending, 'synthetic-lock'),
    ).rejects.toBeInstanceOf(DelayedError);
    expect(reschedule).toHaveBeenCalledWith(
      expect.any(Number),
      'synthetic-lock',
    );
    expect(db.query).not.toHaveBeenCalled();
    expect(channels.sendEmail).not.toHaveBeenCalled();
  });

  it('revalidates tenant, active account and canonical recipient before delivery', async () => {
    await processor.process(job());
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/u\.tenant_id = \$2 AND u\.is_active = true/),
      ['user-a', 'tenant-a'],
    );
    const calls = db.query.mock.calls as unknown[][];
    expect(calls[0]?.[0]).toContain('t.is_active = true');
    expect(calls[0]?.[0]).toContain('u.deleted_at IS NULL');
    expect(channels.sendEmail).toHaveBeenCalledWith(
      'Stored@example.test',
      data.title,
      data.message,
    );
  });

  it.each([
    ['a historical timestamp', { timestamp: cutoffTimestamp - 1 }],
    ['a missing timestamp', { timestamp: undefined }],
    ['a non-finite timestamp', { timestamp: NaN }],
    ['the legacy queue', { queueQualifiedName: 'bull:notification-delivery' }],
    [
      'another prefix',
      { queueQualifiedName: 'falcon-notification-other:notification-delivery' },
    ],
    ['another queue', { queueQualifiedName: `${prefix}:other-queue` }],
    ['a missing queue identity', { queueQualifiedName: undefined }],
  ])(
    'retains a job with %s before any query or email',
    async (_label, metadata) => {
      const pending = job({}, metadata);
      const reschedule = jest.spyOn(pending, 'moveToDelayed');
      await expect(
        processor.process(pending, 'synthetic-lock'),
      ).rejects.toBeInstanceOf(DelayedError);
      expect(reschedule).toHaveBeenCalledWith(
        expect.any(Number),
        'synthetic-lock',
      );
      expect(db.query).not.toHaveBeenCalled();
      expect(channels.sendEmail).not.toHaveBeenCalled();
      expect(channels.sendSms).not.toHaveBeenCalled();
    },
  );

  it('skips recipients removed from the tenant or deactivated after queuing', async () => {
    db.query.mockResolvedValue([]);
    await processor.process(job());
    expect(channels.sendEmail).not.toHaveBeenCalled();
  });

  it('rejects a forged or stale queued email address', async () => {
    await processor.process(job({ email: 'other@example.test' }));
    expect(channels.sendEmail).not.toHaveBeenCalled();
  });

  it.each(['IN_APP', 'UNSUPPORTED'])(
    'preserves non-email channel policy for %s',
    async (channel) => {
      await processor.process(job({ channel }));
      expect(db.query).not.toHaveBeenCalled();
      expect(channels.sendEmail).not.toHaveBeenCalled();
    },
  );

  it('requires review without automatic retry after an uncertain SMTP failure', async () => {
    channels.sendEmail.mockRejectedValue(new Error('private SMTP details'));
    await expect(processor.process(job())).rejects.toThrow(
      new UnrecoverableError('Portal email delivery requires review'),
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('"review_required"'),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
    const calls = db.query.mock.calls as unknown[][];
    expect(calls.at(-1)?.[0]).toContain("->>'state' = 'sending'");
    expect(channels.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('requires review if delivery is disabled after the durable claim', async () => {
    channels.sendEmail.mockResolvedValue(false);
    const pending = job();
    const reschedule = jest.spyOn(pending, 'moveToDelayed');
    await expect(processor.process(pending)).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(reschedule).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('"review_required"'),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
  });

  it('will not send SMS to a phone number changed or forged in the job', async () => {
    await processor.process(job({ channel: 'SMS', phone: 'other-phone' }));
    expect(channels.sendSms).not.toHaveBeenCalled();
  });

  const persistedJob = () => {
    const pending = job({ notificationId: 'notification-a' });
    Object.assign(pending, { id: 'notification-a' });
    return pending;
  };

  it('uses the scoped saved notification body and records SMTP acceptance', async () => {
    db.query
      .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
      .mockResolvedValueOnce([
        { title: 'Saved title', message: 'Saved body', action_link: null },
      ])
      .mockResolvedValueOnce([{ notification_id: 'notification-a' }]);
    await processor.process(persistedJob());
    expect(channels.sendEmail).toHaveBeenCalledWith(
      'Stored@example.test',
      'Saved title',
      'Saved body',
    );
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("IN ('pending', 'queued')"),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
    expect(db.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('"accepted"'),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
  });

  it('does not resend accepted, reviewed, deleted or foreign saved notifications', async () => {
    db.query
      .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
      .mockResolvedValueOnce([]);
    await processor.process(persistedJob());
    expect(channels.sendEmail).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining(
        'notification_id = $1 AND tenant_id = $2 AND user_id = $3',
      ),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
  });

  it('rejects a queue job whose ID does not match its saved notification', async () => {
    const pending = persistedJob();
    Object.assign(pending, { id: 'forged-job' });
    await processor.process(pending);
    expect(channels.sendEmail).not.toHaveBeenCalled();
  });

  it('does not retry SMTP after successful acceptance if receipt persistence fails', async () => {
    db.query
      .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
      .mockResolvedValueOnce([
        { title: 'Saved', message: 'Saved', action_link: null },
      ])
      .mockRejectedValueOnce(new Error('private database failure'));
    await expect(processor.process(persistedJob())).rejects.toBeInstanceOf(
      UnrecoverableError,
    );
    expect(channels.sendEmail).toHaveBeenCalledTimes(1);
  });

  it('refuses unsafe saved email action URLs before contacting SMTP', async () => {
    policy.FRONTEND_URL = 'https://falcon.example.test';
    db.query
      .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
      .mockResolvedValueOnce([
        {
          title: 'Saved',
          message: 'Saved',
          action_link: '//foreign.example.test/path',
        },
      ]);
    await expect(processor.process(job())).rejects.toThrow(
      'Portal email delivery requires review',
    );
    expect(channels.sendEmail).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining('"review_required"'),
      ['notification-a', 'tenant-a', 'user-a', cutoff, prefix],
    );
  });

  it.each([undefined, '', null])(
    'does not allow legacy email jobs without persisted notification IDs: %p',
    async (notificationId) => {
      await processor.process(job({ notificationId: notificationId as never }));
      expect(db.query).not.toHaveBeenCalled();
      expect(channels.sendEmail).not.toHaveBeenCalled();
    },
  );

  it.each(['plain-rows', 'typeorm-postgres'])(
    'claims and acknowledges using %s UPDATE RETURNING results',
    async (shape) => {
      const wrap = (rows: Record<string, unknown>[]) =>
        shape === 'typeorm-postgres' ? [rows, rows.length] : rows;
      db.query
        .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
        .mockResolvedValueOnce(
          wrap([{ title: 'Saved', message: 'Saved body', action_link: null }]),
        )
        .mockResolvedValueOnce(wrap([{ notification_id: 'notification-a' }]));
      await processor.process(job());
      expect(channels.sendEmail).toHaveBeenCalledTimes(1);
      const calls = db.query.mock.calls as unknown[][];
      const claimSql = calls[1]?.[0] as string;
      expect(claimSql).toContain('UPDATE falcon_notifications');
      expect(claimSql).toContain('"sending"');
      expect(claimSql).toContain("->>'state' IN ('pending', 'queued')");
      expect(claimSql).toContain('RETURNING title, message, action_link');
      const acceptedSql = calls[2]?.[0] as string;
      expect(acceptedSql).toContain("->>'state' = 'sending'");
      expect(acceptedSql).toContain('RETURNING notification_id');
    },
  );

  it.each([{ emptyResult: [] }, { emptyResult: [[], 0] }])(
    'does not send when another worker already claimed the persisted notification: %p',
    async ({ emptyResult }) => {
      db.query
        .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
        .mockResolvedValueOnce(emptyResult);
      await processor.process(job());
      expect(channels.sendEmail).not.toHaveBeenCalled();
    },
  );

  it('makes concurrent processing send once through a single atomic database claim', async () => {
    let claimed = false;
    db.query.mockImplementation((sql: string) => {
      if (sql.includes('SELECT u.official_email')) {
        return Promise.resolve([{ official_email: 'Stored@example.test' }]);
      }
      if (sql.includes('RETURNING title, message, action_link')) {
        if (claimed) return Promise.resolve([[], 0]);
        claimed = true;
        return Promise.resolve([
          [{ title: 'Saved', message: 'Saved body', action_link: null }],
          1,
        ]);
      }
      return Promise.resolve([[{ notification_id: 'notification-a' }], 1]);
    });
    await Promise.all([processor.process(job()), processor.process(job())]);
    expect(channels.sendEmail).toHaveBeenCalledTimes(1);
  });

  it.each([
    { acknowledgement: [] },
    { acknowledgement: [[], 0] },
    { acknowledgement: [{ notification_id: 'wrong-id' }] },
  ])(
    'requires review for an unconfirmed accepted receipt without SMTP retry: %p',
    async ({ acknowledgement }) => {
      db.query
        .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
        .mockResolvedValueOnce([
          { title: 'Saved', message: 'Saved body', action_link: null },
        ])
        .mockResolvedValueOnce(acknowledgement);
      await expect(processor.process(job())).rejects.toThrow(
        new UnrecoverableError('Portal email receipt requires review'),
      );
      expect(channels.sendEmail).toHaveBeenCalledTimes(1);
    },
  );

  it('retains the durable claim when failure-review persistence also fails', async () => {
    channels.sendEmail.mockRejectedValue(new Error('private SMTP details'));
    db.query
      .mockResolvedValueOnce([{ official_email: 'Stored@example.test' }])
      .mockResolvedValueOnce([
        { title: 'Saved', message: 'Saved body', action_link: null },
      ])
      .mockRejectedValueOnce(new Error('private database details'));
    await expect(processor.process(job())).rejects.toThrow(
      new UnrecoverableError('Portal email delivery requires review'),
    );
    expect(channels.sendEmail).toHaveBeenCalledTimes(1);
  });
});
