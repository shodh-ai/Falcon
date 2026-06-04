import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis({
      host: config.get('REDIS_HOST', '127.0.0.1'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      maxRetriesPerRequest: null,
    });
  }

  async onModuleDestroy() {
    await this.client.quit();
  }

  bedLockKey(bedId: string) {
    return `hostel:tatkal:bed:${bedId}`;
  }

  /** SET NX EX 300 — returns true if lock acquired */
  async acquireBedLock(bedId: string, studentUserId: string, holdId: string, ttlSec = 300) {
    const value = `${studentUserId}:${holdId}`;
    const result = await this.client.set(this.bedLockKey(bedId), value, 'EX', ttlSec, 'NX');
    return result === 'OK';
  }

  async getBedLock(bedId: string) {
    return this.client.get(this.bedLockKey(bedId));
  }

  /** Release only if owner matches (Lua) */
  async releaseBedLock(bedId: string, studentUserId: string, holdId: string) {
    const key = this.bedLockKey(bedId);
    const expected = `${studentUserId}:${holdId}`;
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    return this.client.eval(script, 1, key, expected);
  }

  busLocationKey(routeId: string) {
    return `bus_location:${routeId}`;
  }

  async setBusLocation(
    routeId: string,
    payload: { lat: number; lng: number; speed?: number; timestamp: string },
    ttlSec = 120,
  ) {
    await this.client.set(this.busLocationKey(routeId), JSON.stringify(payload), 'EX', ttlSec);
  }

  async getBusLocation(routeId: string) {
    const raw = await this.client.get(this.busLocationKey(routeId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { lat: number; lng: number; speed?: number; timestamp: string };
    } catch {
      return null;
    }
  }

  geofenceAlertKey(allocationId: string) {
    return `transport:geofence:${allocationId}`;
  }

  /** Returns true if alert was newly set (not recently sent). */
  async markGeofenceAlert(allocationId: string, ttlSec = 1800) {
    const result = await this.client.set(this.geofenceAlertKey(allocationId), '1', 'EX', ttlSec, 'NX');
    return result === 'OK';
  }
}
