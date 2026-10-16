import { NotificationDispatchService } from './notification-dispatch.service';
import { ConfigService } from '@nestjs/config';

describe('NotificationDispatchService recipient isolation', () => {
  const notification = { notification_id: 'notification-1' };
  const input = {
    tenantId: 'tenant-a',
    userId: 'user-a',
    category: 'FINANCE' as const,
    title: 'Fee reminder',
    message: 'Please review your due date.',
    severity: 'info' as const,
    intent: 'info' as const,
  };
  let inbox: { create: jest.Mock };
  let queue: { add: jest.Mock; name: string; opts: { prefix: string } };
  let db: { query: jest.Mock };
  let config: Record<string, string>;
  let service: NotificationDispatchService;

  beforeEach(() => {
    inbox = { create: jest.fn().mockResolvedValue(notification) };
    config = {
      PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
      PORTAL_NOTIFICATION_QUEUE_PREFIX: 'falcon-notification-test',
      PORTAL_NOTIFICATION_ACTIVATED_AFTER: new Date(
        Date.now() - 60_000,
      ).toISOString(),
    };
    queue = {
      add: jest.fn().mockResolvedValue(undefined),
      name: 'notification-delivery',
      opts: { prefix: config.PORTAL_NOTIFICATION_QUEUE_PREFIX },
    };
    db = {
      query: jest
        .fn()
        .mockResolvedValue([
          { official_email: 'Stored.Email@example.test', phone: null },
        ]),
    };
    service = new NotificationDispatchService(
      inbox as never,
      queue as never,
      db as never,
      new ConfigService(config),
    );
  });

  it('uses canonical stored email and tenant/active eligibility before persisting or queuing', async () => {
    await expect(service.dispatch(input)).resolves.toEqual(notification);
    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/u\.tenant_id = \$2 AND u\.is_active = true/),
      ['user-a', 'tenant-a'],
    );
    const [lookupSql] = db.query.mock.calls[0] as [string];
    expect(lookupSql).toContain('u.deleted_at IS NULL');
    expect(lookupSql).toContain(
      'INNER JOIN tenants t ON t.tenant_id = u.tenant_id AND t.is_active = true',
    );
    expect(queue.add).toHaveBeenCalledWith(
      'send-email-whatsapp',
      expect.objectContaining({
        tenantId: 'tenant-a',
        userId: 'user-a',
        email: 'Stored.Email@example.test',
      }),
      {
        jobId: notification.notification_id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 604800, count: 10000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
  });

  it('rejects cross-tenant, unknown, inactive, soft-deleted, or inactive-tenant recipients without inbox or queue writes', async () => {
    db.query.mockResolvedValue([]);
    await expect(service.dispatch(input)).rejects.toThrow(
      'Notification recipient unavailable',
    );
    expect(inbox.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('preserves deliberate in-app-only notifications', async () => {
    await service.dispatch({ ...input, queueDelivery: false });
    expect(inbox.create).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledWith(
      expect.not.stringContaining('student_profiles'),
      ['user-a', 'tenant-a'],
    );
  });

  it('does not enqueue an invalid stored address as an email recipient', async () => {
    db.query.mockResolvedValue([
      { official_email: 'Bad <recipient@example.test>', phone: null },
    ]);
    await service.dispatch(input);
    expect(queue.add).not.toHaveBeenCalled();
    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: undefined }),
    );
  });

  it('persists delivery intent before queue insertion and retains unrelated metadata', async () => {
    await service.dispatch({
      ...input,
      actionLink: '/faculty/notifications',
      actionLabel: 'View alert',
      metadata: { purpose: 'local-test', emailDelivery: { state: 'accepted' } },
    });
    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          purpose: 'local-test',
          emailDelivery: {
            state: 'pending',
            queuePrefix: config.PORTAL_NOTIFICATION_QUEUE_PREFIX,
            activatedAfter: config.PORTAL_NOTIFICATION_ACTIVATED_AFTER,
          },
        },
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        notificationId: notification.notification_id,
        actionLink: '/faculty/notifications',
        actionLabel: 'View alert',
      }),
      expect.any(Object),
    );
    expect(inbox.create.mock.invocationCallOrder[0]).toBeLessThan(
      queue.add.mock.invocationCallOrder[0],
    );
  });

  it('leaves durable intent and returns the saved inbox alert on queue failure', async () => {
    queue.add.mockRejectedValue(new Error('private provider details'));
    await expect(service.dispatch(input)).resolves.toEqual(notification);
    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          emailDelivery: {
            state: 'pending',
            queuePrefix: config.PORTAL_NOTIFICATION_QUEUE_PREFIX,
            activatedAfter: config.PORTAL_NOTIFICATION_ACTIVATED_AFTER,
          },
        },
      }),
    );
  });

  it('never inserts into a mismatched queue namespace', async () => {
    queue.opts.prefix = 'bull';
    await expect(service.dispatch(input)).resolves.toEqual(notification);
    expect(queue.add).not.toHaveBeenCalled();
    expect(inbox.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          emailDelivery: {
            state: 'pending',
            queuePrefix: config.PORTAL_NOTIFICATION_QUEUE_PREFIX,
            activatedAfter: config.PORTAL_NOTIFICATION_ACTIVATED_AFTER,
          },
        },
      }),
    );
  });

  it.each(['disabled', 'missing-cutoff', 'missing-prefix'])(
    'does not create dormant email backlog when activation is %s',
    async (scenario) => {
      if (scenario === 'disabled')
        config.PORTAL_EMAIL_DELIVERY_ENABLED = 'false';
      if (scenario === 'missing-cutoff')
        delete config.PORTAL_NOTIFICATION_ACTIVATED_AFTER;
      if (scenario === 'missing-prefix')
        delete config.PORTAL_NOTIFICATION_QUEUE_PREFIX;
      await service.dispatch({
        ...input,
        metadata: { other: 'preserved', emailDelivery: { state: 'pending' } },
      });
      expect(queue.add).not.toHaveBeenCalled();
      expect(inbox.create).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { other: 'preserved' } }),
      );
    },
  );

  it('does not persist inbox or queue writes when canonical eligibility lookup fails', async () => {
    db.query.mockRejectedValue(new Error('database unavailable'));
    await expect(service.dispatch(input)).rejects.toThrow(
      'database unavailable',
    );
    expect(inbox.create).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
