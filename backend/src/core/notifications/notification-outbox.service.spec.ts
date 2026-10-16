import { ConfigService } from '@nestjs/config';
import { NotificationOutboxService } from './notification-outbox.service';

describe('NotificationOutboxService new-alert reconciliation', () => {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  const prefix = 'falcon-notification-outbox-test';
  const row = {
    notification_id: 'synthetic-notification-id',
    tenant_id: 'tenant-a',
    user_id: 'user-a',
    category: 'OPERATIONS',
    title: 'Synthetic alert',
    message: 'Test only',
    action_link: '/faculty/notifications',
    action_label: 'View',
    official_email: 'canonical@example.test',
    delivery_state: 'pending',
  };
  let values: Record<string, string>;
  let queue: {
    name: string;
    opts: { prefix: string };
    getJob: jest.Mock;
    add: jest.Mock;
    close: jest.Mock;
    client: Promise<{ disconnect: jest.Mock }>;
  };
  let queueClient: { disconnect: jest.Mock };
  let db: { query: jest.Mock };
  let service: NotificationOutboxService;

  beforeEach(() => {
    values = {
      PORTAL_EMAIL_DELIVERY_ENABLED: 'true',
      PORTAL_NOTIFICATION_QUEUE_PREFIX: prefix,
      PORTAL_NOTIFICATION_ACTIVATED_AFTER: cutoff,
    };
    queueClient = { disconnect: jest.fn() };
    queue = {
      name: 'notification-delivery',
      opts: { prefix },
      getJob: jest.fn().mockResolvedValue(undefined),
      add: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      client: Promise.resolve(queueClient),
    };
    db = { query: jest.fn().mockResolvedValue([]) };
    service = new NotificationOutboxService(
      queue as never,
      db as never,
      new ConfigService(values),
    );
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    jest.useRealTimers();
  });

  it.each(['disabled', 'missing-cutoff', 'legacy-prefix', 'queue-mismatch'])(
    'does not scan data or register a timer for %s',
    async (scenario) => {
      const interval = jest.spyOn(global, 'setInterval');
      if (scenario === 'disabled')
        values.PORTAL_EMAIL_DELIVERY_ENABLED = 'false';
      if (scenario === 'missing-cutoff')
        delete values.PORTAL_NOTIFICATION_ACTIVATED_AFTER;
      if (scenario === 'legacy-prefix')
        delete values.PORTAL_NOTIFICATION_QUEUE_PREFIX;
      if (scenario === 'queue-mismatch') queue.opts.prefix = 'bull';
      service.onApplicationBootstrap();
      await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
      expect(db.query).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
      expect(interval).not.toHaveBeenCalled();
      interval.mockRestore();
    },
  );

  it('restricts reads to current pending, new, undeleted alerts and active same-tenant canonical users', async () => {
    await service.flush();
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('u.tenant_id = n.tenant_id AND u.is_active = true');
    expect(sql).toContain('u.deleted_at IS NULL');
    expect(sql).toContain(
      'INNER JOIN tenants t ON t.tenant_id = u.tenant_id AND t.is_active = true',
    );
    expect(sql).toContain('n.deleted_at IS NULL AND n.created_at >= $1');
    expect(sql).toContain("->>'state' IN ('pending', 'queued')");
    expect(sql).not.toContain("IN ('pending', 'queued', 'accepted'");
    expect(sql).not.toContain("IN ('pending', 'queued', 'review_required'");
    expect(sql).toContain(
      "ORDER BY CASE WHEN n.metadata->'emailDelivery'->>'state' = 'pending'",
    );
    expect(sql).toContain("->>'queuePrefix' = $2");
    expect(sql).toContain("->>'activatedAfter' = $1");
    expect(sql).toContain('LIMIT 100');
    expect(params).toEqual([cutoff, prefix]);
  });

  it('does not queue or update records when account or tenant eligibility excludes all recipients', async () => {
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('recovers queue failure from durable canonical intent with a stable deduplication ID', async () => {
    db.query.mockResolvedValueOnce([row]).mockResolvedValue([]);
    await expect(service.flush()).resolves.toEqual({ queued: 1, skipped: 0 });
    expect(queue.add).toHaveBeenCalledWith(
      'send-email-whatsapp',
      {
        notificationId: row.notification_id,
        tenantId: 'tenant-a',
        userId: 'user-a',
        category: 'OPERATIONS',
        title: 'Synthetic alert',
        message: 'Test only',
        actionLink: '/faculty/notifications',
        actionLabel: 'View',
        email: 'canonical@example.test',
        channel: 'EMAIL',
      },
      {
        jobId: row.notification_id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: { age: 604800, count: 10000 },
        removeOnFail: { age: 604800, count: 5000 },
      },
    );
    expect(db.query).toHaveBeenLastCalledWith(
      expect.stringContaining("->>'state' IN ('pending', 'queued')"),
      [row.notification_id, 'tenant-a', 'user-a', cutoff, prefix, 'queued'],
    );
  });

  it('recreates a missing queued job after Redis data loss without changing its deterministic ID', async () => {
    db.query.mockResolvedValueOnce([{ ...row, delivery_state: 'queued' }]);
    await expect(service.flush()).resolves.toEqual({ queued: 1, skipped: 0 });
    expect(queue.getJob).toHaveBeenCalledWith(row.notification_id);
    expect(queue.add).toHaveBeenCalledWith(
      'send-email-whatsapp',
      expect.objectContaining({ notificationId: row.notification_id }),
      expect.objectContaining({ jobId: row.notification_id }),
    );
    // Already queued: preserve metadata and avoid redundant database writes.
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('does not reinsert or rewrite an existing queued job', async () => {
    db.query.mockResolvedValueOnce([{ ...row, delivery_state: 'queued' }]);
    queue.getJob.mockResolvedValue({
      getState: jest.fn().mockResolvedValue('waiting'),
    });
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 1 });
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('leaves pending intent intact if the queue remains unavailable', async () => {
    db.query.mockResolvedValueOnce([row]);
    queue.add.mockRejectedValue(new Error('private Redis details'));
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it.each(['waiting', 'active', 'delayed', 'completed', 'failed'])(
    'never duplicates existing %s jobs or automatically retries failed jobs',
    async (state) => {
      db.query.mockResolvedValueOnce([row]).mockResolvedValue([]);
      queue.getJob.mockResolvedValue({
        getState: jest.fn().mockResolvedValue(state),
      });
      await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 1 });
      expect(queue.add).not.toHaveBeenCalled();
      expect(db.query).toHaveBeenLastCalledWith(expect.any(String), [
        row.notification_id,
        'tenant-a',
        'user-a',
        cutoff,
        prefix,
        ['completed', 'failed'].includes(state) ? 'review_required' : 'queued',
      ]);
    },
  );

  it('skips malformed canonical recipient addresses', async () => {
    db.query.mockResolvedValueOnce([
      { ...row, official_email: 'bad <address>' },
    ]);
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 1 });
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenLastCalledWith(expect.any(String), [
      row.notification_id,
      'tenant-a',
      'user-a',
      cutoff,
      prefix,
      'review_required',
    ]);
  });

  it('does not overlap reconciliation while a previous scan is pending', async () => {
    let finish: (rows: never[]) => void = () => undefined;
    db.query.mockReturnValueOnce(
      new Promise<never[]>((resolve) => {
        finish = resolve;
      }),
    );
    const first = service.flush();
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    expect(db.query).toHaveBeenCalledTimes(1);
    finish([]);
    await first;
  });

  it('releases the non-overlap guard after a database failure', async () => {
    db.query.mockRejectedValueOnce(new Error('private database details'));
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    expect(db.query).toHaveBeenCalledTimes(2);
  });

  it('registers only one unreferenced timer and clears it on shutdown', async () => {
    jest.useFakeTimers();
    const interval = jest.spyOn(global, 'setInterval');
    const clear = jest.spyOn(global, 'clearInterval');
    service.onApplicationBootstrap();
    service.onApplicationBootstrap();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 30_000);
    await service.beforeApplicationShutdown();
    expect(clear).toHaveBeenCalledTimes(1);
    interval.mockRestore();
    clear.mockRestore();
  });

  it('never starts another scan or timer after shutdown begins', async () => {
    const interval = jest.spyOn(global, 'setInterval');
    await service.beforeApplicationShutdown();
    service.onApplicationBootstrap();
    await expect(service.flush()).resolves.toEqual({ queued: 0, skipped: 0 });
    expect(db.query).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    interval.mockRestore();
  });

  it('reports reconciliation readiness only after registration and before shutdown with unchanged activation', async () => {
    jest.useFakeTimers();
    expect(service.isReconciliationReady()).toBe(false);
    service.onApplicationBootstrap();
    expect(service.isReconciliationReady()).toBe(true);
    values.PORTAL_EMAIL_DELIVERY_ENABLED = 'false';
    expect(service.isReconciliationReady()).toBe(false);
    values.PORTAL_EMAIL_DELIVERY_ENABLED = 'true';
    expect(service.isReconciliationReady()).toBe(true);
    await service.beforeApplicationShutdown();
    expect(service.isReconciliationReady()).toBe(false);
  });

  it('drains an in-flight database scan without queueing its results during shutdown', async () => {
    let finish: (rows: (typeof row)[]) => void = () => undefined;
    db.query.mockReturnValueOnce(
      new Promise<(typeof row)[]>((resolve) => {
        finish = resolve;
      }),
    );
    const scan = service.flush();
    let stopped = false;
    const shutdown = service.beforeApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish([row]);
    await Promise.all([scan, shutdown]);
    expect(stopped).toBe(true);
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('does not begin enqueueing after an in-flight Redis lookup returns during shutdown', async () => {
    db.query.mockResolvedValueOnce([row]);
    let finish: (job: undefined) => void = () => undefined;
    queue.getJob.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        finish = resolve;
      }),
    );
    const scan = service.flush();
    await Promise.resolve();
    expect(queue.getJob).toHaveBeenCalledTimes(1);
    const shutdown = service.beforeApplicationShutdown();
    finish(undefined);
    await Promise.all([scan, shutdown]);
    expect(queue.add).not.toHaveBeenCalled();
    expect(db.query).toHaveBeenCalledTimes(1);
  });

  it('finishes an already-started enqueue and its receipt before dependencies can close', async () => {
    db.query.mockResolvedValueOnce([
      row,
      { ...row, notification_id: 'next-synthetic-notification' },
    ]);
    let finish: () => void = () => undefined;
    queue.add.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const scan = service.flush();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.add).toHaveBeenCalledTimes(1);
    let stopped = false;
    const shutdown = service.beforeApplicationShutdown().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    finish();
    await Promise.all([scan, shutdown]);
    expect(stopped).toBe(true);
    expect(queue.getJob).toHaveBeenCalledTimes(1);
    expect(queue.add).toHaveBeenCalledTimes(1);
    expect(db.query).toHaveBeenLastCalledWith(expect.any(String), [
      row.notification_id,
      'tenant-a',
      'user-a',
      cutoff,
      prefix,
      'queued',
    ]);
  });

  it('stops readiness and its timer synchronously in module destruction and closes the healthy queue once', async () => {
    jest.useFakeTimers();
    service.onApplicationBootstrap();
    expect(service.isReconciliationReady()).toBe(true);
    const stopped = service.onModuleDestroy();
    expect(service.isReconciliationReady()).toBe(false);
    expect(jest.getTimerCount()).toBeLessThanOrEqual(1);
    await stopped;
    await service.beforeApplicationShutdown();
    await service.onApplicationShutdown();
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(queueClient.disconnect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('bounds a reconnecting queue QUIT and disconnects only its captured queue client', async () => {
    jest.useFakeTimers();
    let finishClose: () => void = () => undefined;
    queue.close.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishClose = resolve;
        }),
    );
    queueClient.disconnect.mockImplementation(() => finishClose());
    service.onApplicationBootstrap();
    await Promise.resolve();
    await Promise.resolve();
    const stopped = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(1_999);
    expect(queueClient.disconnect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await stopped;
    expect(queue.close).toHaveBeenCalledTimes(1);
    expect(queueClient.disconnect).toHaveBeenCalledTimes(1);
    // Bull reuses the now-settled close promise when Nest closes the provider.
    await queue.close.mock.results[0].value;
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('bounds an unresolved scan before queue closure without writing or enqueueing its late results', async () => {
    jest.useFakeTimers();
    let finish: (rows: (typeof row)[]) => void = () => undefined;
    db.query.mockReturnValueOnce(
      new Promise<(typeof row)[]>((resolve) => {
        finish = resolve;
      }),
    );
    service.onApplicationBootstrap();
    const stopped = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(4_999);
    expect(queue.close).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await stopped;
    expect(queue.close).toHaveBeenCalledTimes(1);
    finish([row]);
    await Promise.resolve();
    await Promise.resolve();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(queue.getJob).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
    expect(queueClient.disconnect).not.toHaveBeenCalled();
  });

  it('bounds an unresolved Redis lookup and preserves pending intent after its late result', async () => {
    jest.useFakeTimers();
    db.query.mockResolvedValueOnce([row]);
    let finish: (job: undefined) => void = () => undefined;
    queue.getJob.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        finish = resolve;
      }),
    );
    service.onApplicationBootstrap();
    await Promise.resolve();
    expect(queue.getJob).toHaveBeenCalledTimes(1);
    const stopped = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(5_000);
    await stopped;
    finish(undefined);
    await Promise.resolve();
    expect(db.query).toHaveBeenCalledTimes(1);
    expect(queue.add).not.toHaveBeenCalled();
    expect(queue.close).toHaveBeenCalledTimes(1);
  });

  it('disconnects a client that becomes available only after its bounded close timed out', async () => {
    jest.useFakeTimers();
    let finishClient: (client: typeof queueClient) => void = () => undefined;
    queue.client = new Promise((resolve) => {
      finishClient = resolve;
    });
    queue.close.mockReturnValue(new Promise<void>(() => undefined));
    service.onApplicationBootstrap();
    const stopped = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(2_000);
    await stopped;
    expect(queueClient.disconnect).not.toHaveBeenCalled();
    finishClient(queueClient);
    await Promise.resolve();
    expect(queueClient.disconnect).toHaveBeenCalledTimes(1);
  });

  it('captures the owned queue client for bounded cleanup even when portal delivery is disabled', async () => {
    jest.useFakeTimers();
    values.PORTAL_EMAIL_DELIVERY_ENABLED = 'false';
    queue.close.mockReturnValue(new Promise<void>(() => undefined));
    service.onApplicationBootstrap();
    await Promise.resolve();
    const stopped = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(2_000);
    await stopped;
    expect(queueClient.disconnect).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });
});
