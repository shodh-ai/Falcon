import type { Worker } from 'bullmq';

async function settlesWithin(work: Promise<unknown>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work.then(
        () => true,
        () => false,
      ),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Drain actual delivery callbacks, not BullMQ's reconnecting fetch loop. */
export class NotificationWorkerLifecycle {
  private stopping = false;
  private abandoned = false;
  private readonly active = new Set<Promise<unknown>>();
  private shutdown?: Promise<{ drained: boolean; closed: boolean }>;

  isStopping() {
    return this.stopping;
  }

  mayStartDelivery() {
    return !this.abandoned;
  }

  stopAccepting(worker?: Pick<Worker, 'pause'>) {
    this.stopping = true;
    // Pause synchronously at module teardown, before other dependency hooks.
    if (worker) void worker.pause(true).catch(() => undefined);
  }

  run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.stopping) {
      // No SQL/SMTP or job-state mutation after shutdown has begun. BullMQ may
      // retry an unclaimed job later; the persisted claim prevents repeat email.
      return Promise.reject(new Error('Portal notification worker stopping'));
    }
    let work: Promise<T>;
    try {
      work = operation();
    } catch (error) {
      return Promise.reject(
        error instanceof Error
          ? error
          : new Error('Portal notification delivery failed'),
      );
    }
    this.active.add(work);
    return work.finally(() => this.active.delete(work));
  }

  close(worker: Pick<Worker, 'pause' | 'close' | 'disconnect'>) {
    this.stopAccepting();
    this.shutdown ??= this.drainAndClose(worker);
    return this.shutdown;
  }

  private async drainAndClose(
    worker: Pick<Worker, 'pause' | 'close' | 'disconnect'>,
  ) {
    await settlesWithin(worker.pause(true), 1_000);
    // This is a shutdown budget, not a guarantee of SMTP's total duration.
    // On expiry an existing sending claim remains for operator review.
    const drained = await settlesWithin(
      Promise.allSettled([...this.active]),
      25_000,
    );
    if (!drained) this.abandoned = true;
    // close(false) waits for BullMQ's entire fetch/reconnect loop and caches
    // that promise forever. Drain callbacks ourselves, then FIRST close(true).
    // Never clear delivery claims or replay a possibly accepted SMTP message.
    const closed = await settlesWithin(worker.close(true), 2_000);
    if (!closed) await settlesWithin(worker.disconnect(), 1_000);
    return { drained, closed };
  }
}
