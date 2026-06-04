import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../core/redis/redis.service';
import { HostelTatkalGateway } from './hostel-tatkal.gateway';

@Injectable()
export class HostelTatkalService {
  private readonly logger = new Logger(HostelTatkalService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly gateway: HostelTatkalGateway,
  ) {}

  async getActiveSale(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM hostel_tatkal_sales
       WHERE tenant_id = $1 AND is_active = true AND starts_at <= NOW() AND ends_at >= NOW()
       ORDER BY starts_at DESC LIMIT 1`,
      [tenantId],
    );
    return rows[0] ?? null;
  }

  async getSaleMap(tenantId: string) {
    const beds = await this.dataSource.query(
      `SELECT b.bed_id, b.bed_number, b.is_premium, b.status, r.room_id, r.hostel_block, r.room_number
       FROM hostel_beds b
       JOIN operations_hostel_rooms r ON r.room_id = b.room_id
       WHERE b.tenant_id = $1
       ORDER BY r.hostel_block, r.room_number, b.bed_number`,
      [tenantId],
    );

    const enriched = await Promise.all(
      beds.map(async (bed: { bed_id: string; status: string }) => {
        const lock = await this.redis.getBedLock(bed.bed_id);
        let displayStatus = bed.status;
        if (lock) displayStatus = 'IN_CART';
        else if (bed.status === 'BOOKED') displayStatus = 'BOOKED';
        else displayStatus = 'AVAILABLE';
        return { ...bed, display_status: displayStatus };
      }),
    );
    return enriched;
  }

  async lockBed(tenantId: string, studentUserId: string, bedId: string) {
    const sale = await this.getActiveSale(tenantId);
    if (!sale) throw new BadRequestException('No active hostel sale window');

    const bedRows = await this.dataSource.query(
      `SELECT bed_id, status FROM hostel_beds WHERE bed_id = $1 AND tenant_id = $2`,
      [bedId, tenantId],
    );
    if (!bedRows[0] || bedRows[0].status === 'BOOKED') {
      throw new BadRequestException('Bed is not available');
    }

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);
    const holdRows = await this.dataSource.query(
      `INSERT INTO hostel_booking_holds (tenant_id, sale_id, bed_id, student_user_id, status, expires_at)
       VALUES ($1, $2, $3, $4, 'PENDING', $5) RETURNING *`,
      [tenantId, sale.sale_id, bedId, studentUserId, expiresAt.toISOString()],
    );
    const hold = holdRows[0];

    const acquired = await this.redis.acquireBedLock(bedId, studentUserId, hold.hold_id, 300);
    if (!acquired) {
      await this.dataSource.query(`DELETE FROM hostel_booking_holds WHERE hold_id = $1`, [hold.hold_id]);
      throw new BadRequestException('Bed was just selected by another student');
    }

    this.gateway.broadcastBedEvent(tenantId, { type: 'bed.locked', bed_id: bedId, display_status: 'IN_CART' });
    return {
      hold_id: hold.hold_id,
      bed_id: bedId,
      expires_at: expiresAt,
      payment_required: true,
    };
  }

  async confirmPayment(tenantId: string, studentUserId: string, holdId: string, paymentRef: string) {
    const holdRows = await this.dataSource.query(
      `SELECT * FROM hostel_booking_holds WHERE hold_id = $1 AND student_user_id = $2 AND tenant_id = $3`,
      [holdId, studentUserId, tenantId],
    );
    const hold = holdRows[0];
    if (!hold || hold.status !== 'PENDING') throw new BadRequestException('Hold not found or expired');

    const lock = await this.redis.getBedLock(hold.bed_id);
    const expected = `${studentUserId}:${holdId}`;
    if (lock !== expected) throw new BadRequestException('Bed lock expired — please select again');

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
      await this.dataSource.query('COMMIT');
    } catch (e) {
      await this.dataSource.query('ROLLBACK');
      throw e;
    }

    await this.redis.releaseBedLock(hold.bed_id, studentUserId, holdId);
    this.gateway.broadcastBedEvent(tenantId, { type: 'bed.booked', bed_id: hold.bed_id, display_status: 'BOOKED' });
    return { confirmed: true, hold_id: holdId };
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleHolds() {
    const expired = await this.dataSource.query(
      `UPDATE hostel_booking_holds SET status = 'EXPIRED'
       WHERE status = 'PENDING' AND expires_at < NOW()
       RETURNING hold_id, bed_id, student_user_id, tenant_id`,
    );
    for (const row of expired) {
      await this.redis.releaseBedLock(row.bed_id, row.student_user_id, row.hold_id);
      this.gateway.broadcastBedEvent(row.tenant_id, {
        type: 'bed.released',
        bed_id: row.bed_id,
        display_status: 'AVAILABLE',
      });
    }
    if (expired.length) this.logger.debug(`Expired ${expired.length} hostel hold(s)`);
  }
}
