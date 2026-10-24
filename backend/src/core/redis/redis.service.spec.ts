import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';

jest.mock('ioredis', () => ({ __esModule: true, default: jest.fn() }));

describe('RedisService shared connection wiring (offline)', () => {
  let quit: jest.Mock;
  let disconnect: jest.Mock;
  beforeEach(() => {
    jest.clearAllMocks();
    quit = jest.fn().mockResolvedValue('OK');
    disconnect = jest.fn();
    jest
      .mocked(Redis)
      .mockImplementation(
        () => ({ status: 'ready', quit, disconnect }) as unknown as Redis,
      );
  });
  afterEach(() => jest.useRealTimers());

  it('preserves local connection defaults and existing bounded cache retries', () => {
    new RedisService(new ConfigService({}));
    expect(Redis).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 6379,
      password: undefined,
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });
  });

  it('uses the same ACL/TLS configuration while retaining bounded cache retries', () => {
    new RedisService(
      new ConfigService({
        REDIS_HOST: 'redis.staging.example.invalid',
        REDIS_PORT: '6380',
        REDIS_USERNAME: 'notification-app',
        REDIS_PASSWORD: 'synthetic-only-not-used',
        REDIS_TLS: 'true',
      }),
    );
    expect(Redis).toHaveBeenCalledWith({
      host: 'redis.staging.example.invalid',
      port: 6380,
      username: 'notification-app',
      password: 'synthetic-only-not-used',
      tls: {
        rejectUnauthorized: true,
        minVersion: 'TLSv1.2',
        servername: 'redis.staging.example.invalid',
      },
      maxRetriesPerRequest: 2,
      connectTimeout: 3000,
    });
  });

  it('fails before creating a client for invalid hosted configuration', () => {
    expect(
      () => new RedisService(new ConfigService({ REDIS_TLS: 'unsafe' })),
    ).toThrow('Redis connection configuration is invalid');
    expect(Redis).not.toHaveBeenCalled();
  });

  it('retains the existing graceful client shutdown', async () => {
    const service = new RedisService(new ConfigService({}));
    await service.onModuleDestroy();
    expect(quit).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
  });

  it.each(['wait', 'connect', 'connecting', 'close', 'reconnecting', 'end'])(
    'does not enqueue QUIT or wait for network recovery while status=%s',
    async (status) => {
      const service = new RedisService(new ConfigService({}));
      service.client.status = status as Redis['status'];
      await service.onModuleDestroy();
      expect(quit).not.toHaveBeenCalled();
      expect(disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('shares one shutdown operation across repeated lifecycle calls', async () => {
    const service = new RedisService(new ConfigService({}));
    const first = service.onModuleDestroy();
    const second = service.onModuleDestroy();
    expect(first).toBe(second);
    await Promise.all([first, second]);
    expect(quit).toHaveBeenCalledTimes(1);
  });

  it.each(['synchronous', 'asynchronous'])(
    'disconnects after a %s QUIT failure without exposing or propagating details',
    async (scenario) => {
      if (scenario === 'synchronous')
        quit.mockImplementation(() => {
          throw new Error('private connector detail');
        });
      else quit.mockRejectedValue(new Error('private connector detail'));
      const service = new RedisService(new ConfigService({}));
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
      expect(disconnect).toHaveBeenCalledTimes(1);
    },
  );

  it('bounds an already-started QUIT to three seconds and handles late rejection', async () => {
    jest.useFakeTimers();
    let rejectQuit: (error: Error) => void = () => undefined;
    quit.mockReturnValue(
      new Promise<never>((_resolve, reject) => {
        rejectQuit = reject;
      }),
    );
    const service = new RedisService(new ConfigService({}));
    const closing = service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(2_999);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(disconnect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    await expect(closing).resolves.toBeUndefined();
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
    rejectQuit(new Error('private late connector failure'));
    await jest.advanceTimersByTimeAsync(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
