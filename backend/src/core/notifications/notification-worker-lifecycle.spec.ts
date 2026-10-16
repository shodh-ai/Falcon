import { NotificationWorkerLifecycle } from './notification-worker-lifecycle';

describe('notification worker shutdown (offline)', () => {
  const worker = () => ({
    pause: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
  });
  afterEach(() => jest.useRealTimers());

  it('rejects new callbacks and pauses immediately without executing delivery', async () => {
    const lifecycle = new NotificationWorkerLifecycle();
    const target = worker();
    const deliver = jest.fn();
    lifecycle.stopAccepting(target);
    expect(target.pause).toHaveBeenCalledWith(true);
    await expect(lifecycle.run(deliver)).rejects.toThrow('stopping');
    expect(deliver).not.toHaveBeenCalled();
  });

  it('drains active callbacks before the first force-close, without waiting for the fetch loop', async () => {
    const lifecycle = new NotificationWorkerLifecycle();
    const target = worker();
    let finish!: () => void;
    const work = lifecycle.run(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const closing = lifecycle.close(target);
    await Promise.resolve();
    expect(target.close).not.toHaveBeenCalled();
    finish();
    await work;
    await expect(closing).resolves.toEqual({ drained: true, closed: true });
    expect(target.close.mock.calls).toEqual([[true]]);
    expect(lifecycle.close(target)).toBe(closing);
  });

  it('retains delivery errors while allowing teardown after they settle', async () => {
    const lifecycle = new NotificationWorkerLifecycle();
    const target = worker();
    await expect(
      lifecycle.run(() =>
        Promise.reject(new Error('delivery requires review')),
      ),
    ).rejects.toThrow('review');
    await expect(lifecycle.close(target)).resolves.toEqual({
      drained: true,
      closed: true,
    });
  });

  it('ends the drain budget without mutating or retrying a delivery', async () => {
    jest.useFakeTimers();
    const lifecycle = new NotificationWorkerLifecycle();
    const target = worker();
    const delivery = jest.fn(() => new Promise<void>(() => undefined));
    void lifecycle.run(delivery);
    const closing = lifecycle.close(target);
    await jest.advanceTimersByTimeAsync(25_001);
    await expect(closing).resolves.toEqual({ drained: false, closed: true });
    expect(lifecycle.mayStartDelivery()).toBe(false);
    expect(target.close.mock.calls).toEqual([[true]]);
    expect(delivery).toHaveBeenCalledTimes(1);
  });

  it('bounds a broken close and disconnects without switching to close(false)', async () => {
    jest.useFakeTimers();
    const lifecycle = new NotificationWorkerLifecycle();
    const target = worker();
    target.close.mockReturnValue(new Promise(() => undefined));
    const closing = lifecycle.close(target);
    await jest.advanceTimersByTimeAsync(2_001);
    await expect(closing).resolves.toEqual({ drained: true, closed: false });
    expect(target.disconnect).toHaveBeenCalledTimes(1);
    expect(target.close.mock.calls).toEqual([[true]]);
  });
});
