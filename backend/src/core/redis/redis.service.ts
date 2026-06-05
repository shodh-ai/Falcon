import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { BED_LOCK_TTL_SEC } from '../../common/constants/hostel-tatkal.constants';

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
    return `bed_lock:${bedId}`;
  }

  /** SET NX EX — value is student_user_id only. Returns true if lock acquired. */
  async acquireBedLock(bedId: string, studentUserId: string, ttlSec = BED_LOCK_TTL_SEC) {
    const result = await this.client.set(this.bedLockKey(bedId), studentUserId, 'EX', ttlSec, 'NX');
    return result === 'OK';
  }

  async getBedLock(bedId: string) {
    return this.client.get(this.bedLockKey(bedId));
  }

  /** Release only if the lock is owned by this student. */
  async releaseBedLock(bedId: string, studentUserId: string) {
    const key = this.bedLockKey(bedId);
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    return this.client.eval(script, 1, key, studentUserId);
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

  async markGeofenceAlert(allocationId: string, ttlSec = 1800) {
    const result = await this.client.set(this.geofenceAlertKey(allocationId), '1', 'EX', ttlSec, 'NX');
    return result === 'OK';
  }

  eventPayLockKey(eventId: string, studentUserId: string) {
    return `event_pay_lock:${eventId}:${studentUserId}`;
  }

  async acquireEventPayLock(eventId: string, studentUserId: string, ttlSec = BED_LOCK_TTL_SEC) {
    const result = await this.client.set(
      this.eventPayLockKey(eventId, studentUserId),
      '1',
      'EX',
      ttlSec,
      'NX',
    );
    return result === 'OK';
  }

  async releaseEventPayLock(eventId: string, studentUserId: string) {
    await this.client.del(this.eventPayLockKey(eventId, studentUserId));
  }
}
