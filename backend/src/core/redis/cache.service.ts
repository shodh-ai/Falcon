import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';

const DEFAULT_TTL_SEC = 3600;

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(private readonly redis: RedisService) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.client.get(key);
      if (!raw) return null;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return null;
      }
    } catch (err) {
      this.logger.warn(
        `Redis GET failed for ${key}; treating as cache miss: ${err instanceof Error ? err.message : err}`,
      );
      return null;
    }
  }

  async set(
    key: string,
    value: unknown,
    ttlSec = DEFAULT_TTL_SEC,
  ): Promise<void> {
    try {
      await this.redis.client.set(key, JSON.stringify(value), 'EX', ttlSec);
    } catch (err) {
      this.logger.warn(
        `Redis SET failed for ${key}; continuing without cache: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSec = DEFAULT_TTL_SEC,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const data = await factory();
    await this.set(key, data, ttlSec);
    return data;
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.client.del(key);
    } catch (err) {
      this.logger.warn(
        `Redis DEL failed for ${key}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async delByPrefix(prefix: string): Promise<void> {
    try {
      const stream = this.redis.client.scanStream({
        match: `${prefix}*`,
        count: 100,
      });
      const keys: string[] = [];
      for await (const batch of stream) {
        keys.push(...(batch as string[]));
      }
      if (keys.length) await this.redis.client.del(...keys);
    } catch (err) {
      this.logger.warn(
        `Redis DEL by prefix failed for ${prefix}*: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
