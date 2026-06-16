import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BED_LOCK_GRACE_SEC, BED_LOCK_TTL_SEC } from '../../common/constants/hostel-tatkal.constants';
import { RedisService } from '../../core/redis/redis.service';
import { HostelTatkalGateway } from './hostel-tatkal.gateway';

const HOSTEL_BOOKING_FEE_INR = 5000;

@Injectable()
export class HostelTatkalService {
  private readonly logger = new Logger(HostelTatkalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly gateway: HostelTatkalGateway,
  ) {}

  private broadcastBed(tenantId: string, bedId: string, status: string) {
    this.gateway.broadcastBedEvent(tenantId, {
      bedId,
      bed_id: bedId,
      status,
      display_status: status,
    });
  }

  async getActiveSale(tenantId: string) {
    const settingsRows = await this.dataSource.query<Array<{ settings: Record<string, unknown> | null }>>(
      `SELECT settings FROM tenants WHERE tenant_id = $1`,
      [tenantId],
    );
    if (settingsRows[0]?.settings?.is_hostel_sale_active !== true) {
      return null;
    }

    const rows = await this.dataSource.query(
      `SELECT * FROM hostel_tatkal_sales
       WHERE tenant_id = $1 AND is_active = true AND starts_at <= NOW() AND ends_at >= NOW()
       ORDER BY starts_at DESC LIMIT 1`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async getBookingCatalog(tenantId: string) {
    const beds = await this.getSaleMap(tenantId);
    const tree: Record<
      string,
      {
        hostel_block: string;
        floors: Record<string, { floor: string; rooms: Record<string, { room_number: string; beds: typeof beds }> }>;
      }
    > = {};

    for (const bed of beds) {
      const block = bed.hostel_block ?? 'Hostel';
      const floor = bed.floor ?? 'Ground Floor';
      const room = bed.room_number ?? '—';
      if (!tree[block]) tree[block] = { hostel_block: block, floors: {} };
      if (!tree[block].floors[floor]) tree[block].floors[floor] = { floor, rooms: {} };
      if (!tree[block].floors[floor].rooms[room]) {
        tree[block].floors[floor].rooms[room] = { room_number: room, beds: [] };
      }
      tree[block].floors[floor].rooms[room].beds.push(bed);
    }

    return Object.values(tree).map((h) => ({
      hostel_block: h.hostel_block,
      floors: Object.values(h.floors).map((f) => ({
        floor: f.floor,
        rooms: Object.values(f.rooms),
      })),
    }));
  }

  async getSaleMap(tenantId: string) {
    const beds = await this.dataSource.query(
      `SELECT b.bed_id, b.bed_number, b.is_premium, b.status, r.room_id, r.hostel_block, r.room_number,
              COALESCE(r.floor, 'Ground Floor') AS floor, h.hostel_name
       FROM hostel_beds b
       JOIN operations_hostel_rooms r ON r.room_id = b.room_id
       LEFT JOIN operations_hostels h ON h.hostel_id = r.hostel_id
       WHERE b.tenant_id = $1
       ORDER BY r.hostel_block, r.floor, r.room_number, b.bed_number`,
      [tenantId],
    );

    const enriched = await Promise.all(
      beds.map(async (bed: { bed_id: string; status: string }) => {
        const lockOwner = await this.redis.getBedLock(bed.bed_id);
        let displayStatus = bed.status;
        if (lockOwner) displayStatus = 'IN_CART';
        else if (bed.status === 'BOOKED') displayStatus = 'BOOKED';
        else displayStatus = 'AVAILABLE';
        return { ...bed, display_status: displayStatus };
      }),
    );
    return enriched;
  }

  async lockBed(tenantId: string, studentUserId: string, bedId: string) {
    const activeBooking = await this.dataSource.query<Array<{ hold_id: string }>>(
      `SELECT hold_id FROM hostel_booking_holds
       WHERE student_user_id = $1 AND tenant_id = $2 AND status IN ('PENDING', 'CONFIRMED')
       LIMIT 1`,
      [studentUserId, tenantId],
    );
    if (activeBooking[0]) {
      throw new BadRequestException('You already booked a room!');
    }

    const activeAllocation = await this.dataSource.query<Array<{ allocation_id: string }>>(
      `SELECT allocation_id FROM hostel_allocations
       WHERE student_user_id = $1 AND status = 'ACTIVE' LIMIT 1`,
      [studentUserId],
    );
    if (activeAllocation[0]) {
      throw new BadRequestException('You already booked a room!');
    }

    const sale = await this.getActiveSale(tenantId);
    if (!sale) throw new BadRequestException('No active hostel sale window');

    const bedRows = await this.dataSource.query(
      `SELECT bed_id, status FROM hostel_beds WHERE bed_id = $1 AND tenant_id = $2`,
      [bedId, tenantId],
    );
    if (!bedRows[0] || bedRows[0].status === 'BOOKED') {
      throw new BadRequestException('Bed is not available');
    }

    const existingLock = await this.redis.getBedLock(bedId);
    if (existingLock && existingLock !== studentUserId) {
      throw new ConflictException('This bed is currently in checkout by another student.');
    }

    const serverNow = new Date();
    const expiresAt = new Date(serverNow.getTime() + BED_LOCK_TTL_SEC * 1000);

    const acquired = await this.redis.acquireBedLock(bedId, studentUserId, BED_LOCK_TTL_SEC);
    if (!acquired) {
      throw new ConflictException('This bed is currently in checkout by another student.');
    }

    let hold: { hold_id: string };
    try {
      const holdRows = await this.dataSource.query(
        `INSERT INTO hostel_booking_holds (tenant_id, sale_id, bed_id, student_user_id, status, expires_at)
         VALUES ($1, $2, $3, $4, 'PENDING', $5) RETURNING *`,
        [tenantId, sale.sale_id, bedId, studentUserId, expiresAt.toISOString()],
      );
      hold = holdRows[0];
    } catch (e) {
      await this.redis.releaseBedLock(bedId, studentUserId);
      throw e;
    }

    this.broadcastBed(tenantId, bedId, 'IN_CART');
    return {
      hold_id: hold.hold_id,
      bed_id: bedId,
      expires_at: expiresAt.toISOString(),
      server_now: serverNow.toISOString(),
      lock_ttl_seconds: BED_LOCK_TTL_SEC,
      payment_required: true,
    };
  }

  async getHold(tenantId: string, studentUserId: string, holdId: string) {
    const rows = await this.dataSource.query(
      `SELECT h.*, b.bed_number, b.is_premium, r.hostel_block, r.room_number, r.floor, oh.hostel_name
       FROM hostel_booking_holds h
       JOIN hostel_beds b ON b.bed_id = h.bed_id
       JOIN operations_hostel_rooms r ON r.room_id = b.room_id
       LEFT JOIN operations_hostels oh ON oh.hostel_id = r.hostel_id
       WHERE h.hold_id = $1 AND h.tenant_id = $2 AND h.student_user_id = $3`,
      [holdId, tenantId, studentUserId],
    );
    const hold = rows[0];
    if (!hold) throw new NotFoundException('Hold not found');

    const lockOwner = await this.redis.getBedLock(hold.bed_id);
    const expiresMs = new Date(hold.expires_at).getTime();
    const remaining = Math.max(0, Math.floor((expiresMs - Date.now()) / 1000));

    return {
      ...hold,
      lock_active: lockOwner === studentUserId,
      remaining_seconds: remaining,
      lock_ttl_seconds: BED_LOCK_TTL_SEC,
      server_now: new Date().toISOString(),
    };
  }

  async releaseHold(tenantId: string, studentUserId: string, holdId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM hostel_booking_holds
       WHERE hold_id = $1 AND tenant_id = $2 AND student_user_id = $3 AND status = 'PENDING'`,
      [holdId, tenantId, studentUserId],
    );
    const hold = rows[0];
    if (!hold) return { released: false, reason: 'not_found_or_not_pending' };

    await this.redis.releaseBedLock(hold.bed_id, studentUserId);
    await this.dataSource.query(
      `UPDATE hostel_booking_holds SET status = 'EXPIRED' WHERE hold_id = $1`,
      [holdId],
    );
    this.broadcastBed(tenantId, hold.bed_id, 'AVAILABLE');
    return { released: true, bed_id: hold.bed_id };
  }

  async createPaymentOrder(tenantId: string, studentUserId: string, holdId: string) {
    const hold = await this.getHold(tenantId, studentUserId, holdId);
    if (hold.status !== 'PENDING') {
      throw new BadRequestException('Hold is no longer active');
    }
    const expiresMs = new Date(hold.expires_at).getTime();
    const inWindow = Date.now() <= expiresMs + BED_LOCK_GRACE_SEC * 1000;
    if (!inWindow) {
      throw new ConflictException('Checkout session expired. Please select the bed again.');
    }

    const orderId = `hostel_${holdId.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
    await this.dataSource.query(
      `UPDATE hostel_booking_holds SET gateway_order_id = $2 WHERE hold_id = $1`,
      [holdId, orderId],
    );

    return {
      order_id: orderId,
      hold_id: holdId,
      amount_inr: HOSTEL_BOOKING_FEE_INR,
      amount_paise: HOSTEL_BOOKING_FEE_INR * 100,
      currency: 'INR',
      fee_head: 'HOSTEL_BOOKING',
      razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
      mock: true,
      notes: {
        hold_id: holdId,
        fee_head: 'HOSTEL_BOOKING',
        student_user_id: studentUserId,
        tenant_id: tenantId,
      },
    };
  }

  private async assertCanFinalize(
    hold: { bed_id: string; student_user_id: string; expires_at: string; status: string },
    studentUserId: string,
  ) {
    if (hold.status === 'CONFIRMED') return { alreadyConfirmed: true };
    if (hold.status !== 'PENDING') {
      throw new BadRequestException('Hold not found or expired');
    }

    const lockOwner = await this.redis.getBedLock(hold.bed_id);
    if (lockOwner === studentUserId) {
      return { alreadyConfirmed: false };
    }

    const expiresMs = new Date(hold.expires_at).getTime();
    const graceEnd = expiresMs + BED_LOCK_GRACE_SEC * 1000;
    if (Date.now() <= graceEnd) {
      return { alreadyConfirmed: false, grace: true };
    }

    throw new ConflictException('Bed lock expired — please select again');
  }

  async finalizeBooking(
    tenantId: string,
    studentUserId: string,
    holdId: string,
    paymentRef: string,
  ) {
    const holdRows = await this.dataSource.query(
      `SELECT * FROM hostel_booking_holds WHERE hold_id = $1 AND student_user_id = $2 AND tenant_id = $3`,
      [holdId, studentUserId, tenantId],
    );
    const hold = holdRows[0];
    if (!hold) throw new NotFoundException('Hold not found');

    const check = await this.assertCanFinalize(hold, studentUserId);
    if (check.alreadyConfirmed) {
      return { confirmed: true, hold_id: holdId, duplicate: true };
    }

    await this.dataSource.query('BEGIN');
    try {
      await this.dataSource.query(
        `UPDATE hostel_booking_holds SET status = 'CONFIRMED', payment_ref = $2, confirmed_at = NOW() WHERE hold_id = $1`,
        [holdId, paymentRef],
      );
      await this.dataSource.query(
        `UPDATE hostel_beds SET status = 'BOOKED' WHERE bed_id = $1`,
        [hold.bed_id],
      );
      const bedInfo = await this.dataSource.query(
        `SELECT room_id, bed_number FROM hostel_beds WHERE bed_id = $1`,
        [hold.bed_id],
      );
      await this.dataSource.query(
        `INSERT INTO hostel_allocations (student_user_id, room_id, bed_number, mess_plan, start_date, status)
         VALUES ($1, $2, $3, 'STANDARD', CURRENT_DATE, 'ACTIVE')
         ON CONFLICT (student_user_id) DO UPDATE SET room_id = EXCLUDED.room_id, bed_number = EXCLUDED.bed_number`,
        [studentUserId, bedInfo[0].room_id, bedInfo[0].bed_number],
      );
      await this.dataSource.query(
        `UPDATE operations_hostel_beds ob SET status = 'OCCUPIED'
         FROM operations_hostel_rooms r
         WHERE ob.room_id = r.room_id AND r.room_id = $1 AND ob.bed_label ILIKE '%' || $2 || '%'`,
        [bedInfo[0].room_id, bedInfo[0].bed_number],
      ).catch(() => undefined);
      await this.dataSource.query(
        `UPDATE operations_hostel_rooms SET occupied = LEAST(capacity, occupied + 1) WHERE room_id = $1`,
        [bedInfo[0].room_id],
      );
      await this.dataSource.query('COMMIT');
    } catch (e) {
      await this.dataSource.query('ROLLBACK');
      throw e;
    }

    await this.redis.releaseBedLock(hold.bed_id, studentUserId);
    this.broadcastBed(tenantId, hold.bed_id, 'BOOKED');
    return { confirmed: true, hold_id: holdId };
  }

  async confirmPayment(tenantId: string, studentUserId: string, holdId: string, paymentRef: string) {
    return this.finalizeBooking(tenantId, studentUserId, holdId, paymentRef);
  }

  /** Finalize from gateway webhook (notes carry hold_id / student_user_id). */
  async finalizeFromWebhook(
    tenantId: string,
    studentUserId: string,
    holdId: string,
    paymentId: string,
  ) {
    return this.finalizeBooking(tenantId, studentUserId, holdId, paymentId);
  }

  @Interval(30_000)
  async expireStaleHolds() {
    // #region agent log
    const dsOpts = this.dataSource.options as {
      host?: string;
      port?: number;
      database?: string;
      username?: string;
    };
    let tableExists = false;
    try {
      const check = await this.dataSource.query(
        `SELECT EXISTS (
           SELECT 1 FROM pg_tables
           WHERE schemaname = 'public' AND tablename = 'hostel_booking_holds'
         ) AS exists`,
      );
      tableExists = Boolean(check[0]?.exists);
    } catch {
      tableExists = false;
    }
    fetch('http://127.0.0.1:7347/ingest/49af9d07-dff1-41aa-8030-fc7e328235dc', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f13440' },
      body: JSON.stringify({
        sessionId: 'f13440',
        runId: 'pre-fix',
        hypothesisId: 'H1-H3',
        location: 'hostel-tatkal.service.ts:expireStaleHolds',
        message: 'scheduler db context',
        data: {
          host: dsOpts.host,
          port: dsOpts.port,
          database: dsOpts.database,
          username: dsOpts.username,
          tableExists,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    let expired: Array<{
      hold_id: string;
      bed_id: string;
      student_user_id: string;
      tenant_id: string;
    }>;
    try {
      const updateResult = await this.dataSource.query(
        `UPDATE hostel_booking_holds SET status = 'EXPIRED'
         WHERE status = 'PENDING' AND expires_at < NOW()
         RETURNING hold_id, bed_id, student_user_id, tenant_id`,
      );
      expired = Array.isArray(updateResult?.[0]) ? updateResult[0] : updateResult;
      // #region agent log
      fetch('http://127.0.0.1:7347/ingest/49af9d07-dff1-41aa-8030-fc7e328235dc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f13440' },
        body: JSON.stringify({
          sessionId: 'f13440',
          runId: 'post-fix',
          hypothesisId: 'H6',
          location: 'hostel-tatkal.service.ts:expireStaleHolds',
          message: 'update result normalized',
          data: {
            rawLength: Array.isArray(updateResult) ? updateResult.length : null,
            expiredCount: expired.length,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    } catch (err: unknown) {
      // #region agent log
      fetch('http://127.0.0.1:7347/ingest/49af9d07-dff1-41aa-8030-fc7e328235dc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'f13440' },
        body: JSON.stringify({
          sessionId: 'f13440',
          runId: 'pre-fix',
          hypothesisId: 'H1-H4',
          location: 'hostel-tatkal.service.ts:expireStaleHolds',
          message: 'scheduler query failed',
          data: {
            code: (err as { code?: string })?.code,
            message: err instanceof Error ? err.message : String(err),
            tableExists,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      throw err;
    }
    for (const row of expired) {
      await this.redis.releaseBedLock(row.bed_id, row.student_user_id);
      this.broadcastBed(row.tenant_id, row.bed_id, 'AVAILABLE');
    }
    if (expired.length) this.logger.debug(`Expired ${expired.length} hostel hold(s)`);
  }
}
