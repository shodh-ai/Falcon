import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { RedisService } from '../../core/redis/redis.service';
import { FinanceService } from '../finance/finance.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { TransportGateway } from './transport.gateway';

type StopRow = {
  stop_id: string;
  route_id: string;
  route_name: string;
  stop_name: string;
  latitude: string;
  longitude: string;
  pickup_time: string;
  fee_amount: string;
  stop_order: number;
  total_seats: number;
  allocated_count: string;
};

@Injectable()
export class TransportService {
  private readonly logger = new Logger(TransportService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly finance: FinanceService,
    private readonly notify: NotificationEmitterService,
    private readonly gateway: TransportGateway,
  ) {}

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async listRoutesWithStops(tenantId: string) {
    const routes = await this.dataSource.query(
      `SELECT r.*, v.registration_no,
              (SELECT COUNT(*)::int FROM transport_allocations a
               WHERE a.route_id = r.route_id AND a.payment_status = 'PAID') AS paid_count
       FROM transport_routes r
       LEFT JOIN fleet_vehicles v ON v.vehicle_id = r.vehicle_id
       WHERE r.tenant_id = $1 AND r.is_active = true
       ORDER BY r.route_name`,
      [tenantId],
    );
    const stops = await this.dataSource.query(
      `SELECT s.*, r.route_name
       FROM transport_stops s
       JOIN transport_routes r ON r.route_id = s.route_id
       WHERE s.tenant_id = $1
       ORDER BY s.route_id, s.stop_order`,
      [tenantId],
    );
    return { routes, stops };
  }

  async findNearestStops(tenantId: string, lat: number, lng: number, limit = 8) {
    const stops = await this.dataSource.query<StopRow[]>(
      `SELECT s.stop_id, s.route_id, r.route_name, s.stop_name,
              s.latitude, s.longitude, s.pickup_time, s.fee_amount, s.stop_order,
              r.total_seats,
              (SELECT COUNT(*) FROM transport_allocations a
               WHERE a.route_id = r.route_id AND a.payment_status = 'PAID')::text AS allocated_count
       FROM transport_stops s
       JOIN transport_routes r ON r.route_id = s.route_id
       WHERE s.tenant_id = $1 AND r.is_active = true
         AND s.latitude IS NOT NULL AND s.longitude IS NOT NULL`,
      [tenantId],
    );
    return stops
      .map((s) => ({
        ...s,
        distance_km: this.haversineKm(lat, lng, Number(s.latitude), Number(s.longitude)),
        fee_amount: Number(s.fee_amount),
        seats_available: Math.max(0, s.total_seats - Number(s.allocated_count)),
      }))
      .sort((a, b) => a.distance_km - b.distance_km)
      .slice(0, limit);
  }

  async getMyAllocation(tenantId: string, studentUserId: string) {
    const rows = await this.dataSource.query(
      `SELECT a.*, s.stop_name, s.latitude, s.longitude, s.pickup_time, s.fee_amount,
              r.route_name, r.route_id, v.registration_no AS bus_number
       FROM transport_allocations a
       JOIN transport_stops s ON s.stop_id = a.stop_id
       JOIN transport_routes r ON r.route_id = a.route_id
       LEFT JOIN fleet_vehicles v ON v.vehicle_id = r.vehicle_id
       WHERE a.tenant_id = $1 AND a.student_user_id = $2`,
      [tenantId, studentUserId],
    );
    return rows[0] ?? null;
  }

  async optIn(tenantId: string, studentUserId: string, stopId: string) {
    const existing = await this.getMyAllocation(tenantId, studentUserId);
    if (existing?.payment_status === 'PAID') {
      throw new BadRequestException('You already have an active transport allocation.');
    }
    if (existing?.payment_status === 'PENDING') {
      throw new BadRequestException('Complete payment for your pending transport opt-in first.');
    }

    const stopRows = await this.dataSource.query(
      `SELECT s.*, r.route_name, r.total_seats, r.route_id
       FROM transport_stops s
       JOIN transport_routes r ON r.route_id = s.route_id
       WHERE s.stop_id = $1 AND s.tenant_id = $2 AND r.is_active = true`,
      [stopId, tenantId],
    );
    const stop = stopRows[0];
    if (!stop) throw new NotFoundException('Stop not found');

    const countRows = await this.dataSource.query(
      `SELECT COUNT(*)::int AS c FROM transport_allocations
       WHERE route_id = $1 AND payment_status = 'PAID'`,
      [stop.route_id],
    );
    if (Number(countRows[0]?.c ?? 0) >= Number(stop.total_seats)) {
      throw new BadRequestException('This route is fully booked. Contact transport office.');
    }

    const academicYear = '2026-27';
    const dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString().slice(0, 10);
    const feeAmount = Number(stop.fee_amount);

    const demand = await this.finance.createDemand(
      {
        student_user_id: studentUserId,
        fee_head: 'TRANSPORT_FEE',
        academic_year: academicYear,
        total_amount: feeAmount,
        due_date: dueDate,
        fee_breakup: {
          route_name: stop.route_name,
          stop_name: stop.stop_name,
          period: 'semester',
        },
      },
      tenantId,
    );

    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 6);

    const allocRows = await this.dataSource.query(
      `INSERT INTO transport_allocations (
         tenant_id, student_user_id, route_id, stop_id, fee_demand_id,
         academic_year, payment_status, pass_status, valid_until
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', 'INACTIVE', $7)
       ON CONFLICT (student_user_id) DO UPDATE SET
         route_id = EXCLUDED.route_id,
         stop_id = EXCLUDED.stop_id,
         fee_demand_id = EXCLUDED.fee_demand_id,
         academic_year = EXCLUDED.academic_year,
         payment_status = 'PENDING',
         pass_status = 'INACTIVE',
         valid_until = EXCLUDED.valid_until
       RETURNING *`,
      [
        tenantId,
        studentUserId,
        stop.route_id,
        stopId,
        demand.demand_id,
        academicYear,
        validUntil.toISOString().slice(0, 10),
      ],
    );

    return {
      allocation: allocRows[0],
      demand,
      checkout: {
        provider: 'razorpay',
        amount: feeAmount,
        currency: 'INR',
        demand_id: demand.demand_id,
        notes: { student_user_id: studentUserId, demand_id: demand.demand_id, fee_head: 'TRANSPORT_FEE' },
        mock_checkout_url: `/student/transport?pay=${demand.demand_id}`,
      },
      route: { route_name: stop.route_name, stop_name: stop.stop_name, fee_amount: feeAmount },
    };
  }

  async confirmPayment(tenantId: string, studentUserId: string, allocationId: string, paymentRef: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM transport_allocations
       WHERE allocation_id = $1 AND tenant_id = $2 AND student_user_id = $3`,
      [allocationId, tenantId, studentUserId],
    );
    const alloc = rows[0];
    if (!alloc) throw new NotFoundException('Allocation not found');
    if (alloc.payment_status === 'PAID') return { allocation: alloc, already_paid: true };

    if (alloc.fee_demand_id) {
      await this.dataSource.query(
        `UPDATE finance_fee_demands
         SET paid_amount = total_amount, status = 'PAID'
         WHERE demand_id = $1`,
        [alloc.fee_demand_id],
      );
    }

    const updated = await this.activateAllocation(alloc.allocation_id, paymentRef);
    return { allocation: updated, payment_ref: paymentRef };
  }

  async activateAllocationByDemand(demandId: string) {
    const rows = await this.dataSource.query(
      `SELECT allocation_id FROM transport_allocations WHERE fee_demand_id = $1`,
      [demandId],
    );
    if (!rows[0]) return null;
    return this.activateAllocation(rows[0].allocation_id);
  }

  private async activateAllocation(allocationId: string, paymentRef?: string) {
    const updated = await this.dataSource.query(
      `UPDATE transport_allocations
       SET payment_status = 'PAID', pass_status = 'ACTIVE'
       WHERE allocation_id = $1
       RETURNING *`,
      [allocationId],
    );
    this.logger.log(`Transport pass activated ${allocationId}${paymentRef ? ` ref=${paymentRef}` : ''}`);
    return updated[0];
  }

  @OnEvent('finance.demand_paid')
  async onFinanceDemandPaid(payload: { demandId: string; feeHead?: string }) {
    if (payload.feeHead && payload.feeHead !== 'TRANSPORT_FEE') return;
    await this.activateAllocationByDemand(payload.demandId);
  }

  async generateBusPassToken(tenantId: string, studentUserId: string) {
    const alloc = await this.getMyAllocation(tenantId, studentUserId);
    if (!alloc || alloc.pass_status !== 'ACTIVE') {
      throw new BadRequestException('No active transport pass');
    }

    const nonce = randomBytes(16).toString('hex');
    const tokenHash = createHash('sha256')
      .update(`${studentUserId}:${alloc.route_id}:${nonce}:${Date.now()}`)
      .digest('hex');
    const expiresAt = new Date(Date.now() + 30_000);

    await this.dataSource.query(
      `INSERT INTO transport_pass_tokens (tenant_id, student_user_id, allocation_id, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, studentUserId, alloc.allocation_id, tokenHash, expiresAt.toISOString()],
    );

    return {
      qr_payload: `transport:${studentUserId}:${tokenHash}:${alloc.route_id}`,
      expires_at: expiresAt,
      refresh_in_seconds: 30,
      route_name: alloc.route_name,
      stop_name: alloc.stop_name,
    };
  }

  async scanBusPass(tenantId: string, qrPayload: string, expectedRouteId?: string) {
    const parts = qrPayload.replace(/^transport:/, '').split(':');
    const [studentUserId, tokenHash, routeId] = parts;
    if (!studentUserId || !tokenHash) throw new BadRequestException('Invalid QR');

    const tokenRows = await this.dataSource.query(
      `SELECT * FROM transport_pass_tokens
       WHERE tenant_id = $1 AND student_user_id = $2 AND token_hash = $3 AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, studentUserId, tokenHash],
    );
    if (!tokenRows[0]) throw new BadRequestException('QR expired or invalid');

    const alloc = await this.getMyAllocation(tenantId, studentUserId);
    if (!alloc || alloc.pass_status !== 'ACTIVE') {
      throw new BadRequestException('Transport pass inactive');
    }

    const routeMatch = !expectedRouteId || expectedRouteId === routeId || expectedRouteId === alloc.route_id;
    const studentRows = await this.dataSource.query(`SELECT name FROM users WHERE user_id = $1`, [studentUserId]);

    return {
      valid: routeMatch,
      status: routeMatch ? 'GREEN' : 'RED',
      student_name: studentRows[0]?.name ?? 'Student',
      route_name: alloc.route_name,
      stop_name: alloc.stop_name,
      message: routeMatch ? 'Valid pass — board approved' : 'Wrong bus — route mismatch',
    };
  }

  async getLiveLocationForStudent(tenantId: string, studentUserId: string) {
    const alloc = await this.getMyAllocation(tenantId, studentUserId);
    if (!alloc) throw new BadRequestException('No transport allocation');

    const location = await this.redis.getBusLocation(alloc.route_id);
    let eta_minutes: number | null = null;
    if (location && alloc.latitude && alloc.longitude) {
      const distKm = this.haversineKm(
        location.lat,
        location.lng,
        Number(alloc.latitude),
        Number(alloc.longitude),
      );
      const speedKmh = location.speed && location.speed > 5 ? location.speed : 25;
      eta_minutes = Math.max(1, Math.round((distKm / speedKmh) * 60));
    }

    return {
      route_id: alloc.route_id,
      route_name: alloc.route_name,
      stop_name: alloc.stop_name,
      stop_lat: alloc.latitude ? Number(alloc.latitude) : null,
      stop_lng: alloc.longitude ? Number(alloc.longitude) : null,
      location,
      eta_minutes,
    };
  }

  async ingestGpsPing(
    tenantId: string,
    routeId: string,
    lat: number,
    lng: number,
    speed?: number,
  ) {
    const routeRows = await this.dataSource.query(
      `SELECT route_id FROM transport_routes WHERE route_id = $1 AND tenant_id = $2`,
      [routeId, tenantId],
    );
    if (!routeRows[0]) throw new NotFoundException('Route not found');

    const timestamp = new Date().toISOString();
    await this.redis.setBusLocation(routeId, { lat, lng, speed, timestamp });

    const payload = { route_id: routeId, lat, lng, speed, timestamp };
    this.gateway.broadcastGpsUpdate(routeId, payload);

    await this.checkGeofenceAlerts(tenantId, routeId, lat, lng);
    return payload;
  }

  private async checkGeofenceAlerts(tenantId: string, routeId: string, lat: number, lng: number) {
    const students = await this.dataSource.query<
      Array<{ allocation_id: string; student_user_id: string; stop_name: string; latitude: string; longitude: string }>
    >(
      `SELECT a.allocation_id, a.student_user_id, s.stop_name, s.latitude, s.longitude
       FROM transport_allocations a
       JOIN transport_stops s ON s.stop_id = a.stop_id
       WHERE a.route_id = $1 AND a.tenant_id = $2 AND a.pass_status = 'ACTIVE'`,
      [routeId, tenantId],
    );

    for (const row of students) {
      const dist = this.haversineKm(lat, lng, Number(row.latitude), Number(row.longitude));
      if (dist > 2) continue;

      const shouldAlert = await this.redis.markGeofenceAlert(row.allocation_id);
      if (!shouldAlert) continue;

      const eta = Math.max(3, Math.round((dist / 25) * 60));
      this.notify.busApproaching({
        tenantId,
        userId: row.student_user_id,
        stopName: row.stop_name,
        etaMinutes: eta,
      });
    }
  }

  async getFleetMap(tenantId: string) {
    const routes = await this.dataSource.query(
      `SELECT r.route_id, r.route_name, r.total_seats, v.registration_no,
              (SELECT COUNT(*)::int FROM transport_allocations a
               WHERE a.route_id = r.route_id AND a.payment_status = 'PAID') AS occupancy
       FROM transport_routes r
       LEFT JOIN fleet_vehicles v ON v.vehicle_id = r.vehicle_id
       WHERE r.tenant_id = $1 AND r.is_active = true`,
      [tenantId],
    );

    const locations = await Promise.all(
      routes.map(async (r: { route_id: string }) => ({
        route_id: r.route_id,
        location: await this.redis.getBusLocation(r.route_id),
      })),
    );

    return { routes, locations };
  }

  async getOccupancyDashboard(tenantId: string) {
    const routes = await this.dataSource.query(
      `SELECT r.route_id, r.route_name, r.total_seats, v.registration_no,
              COUNT(a.allocation_id) FILTER (WHERE a.payment_status = 'PAID')::int AS paid_count,
              COUNT(a.allocation_id) FILTER (WHERE a.payment_status = 'PENDING')::int AS pending_count
       FROM transport_routes r
       LEFT JOIN fleet_vehicles v ON v.vehicle_id = r.vehicle_id
       LEFT JOIN transport_allocations a ON a.route_id = r.route_id
       WHERE r.tenant_id = $1
       GROUP BY r.route_id, r.route_name, r.total_seats, v.registration_no
       ORDER BY paid_count DESC`,
      [tenantId],
    );

    const unpaid = await this.dataSource.query(
      `SELECT u.name, u.official_email, s.stop_name, r.route_name, a.payment_status
       FROM transport_allocations a
       JOIN users u ON u.user_id = a.student_user_id
       JOIN transport_stops s ON s.stop_id = a.stop_id
       JOIN transport_routes r ON r.route_id = a.route_id
       WHERE a.tenant_id = $1 AND a.payment_status != 'PAID'
       ORDER BY a.created_at DESC
       LIMIT 50`,
      [tenantId],
    );

    return { routes, unpaid_students: unpaid };
  }

  async createRoute(
    tenantId: string,
    dto: { route_name: string; vehicle_id?: string; driver_user_id?: string; total_seats?: number },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO transport_routes (tenant_id, route_name, vehicle_id, driver_user_id, total_seats)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        tenantId,
        dto.route_name,
        dto.vehicle_id ?? null,
        dto.driver_user_id ?? null,
        dto.total_seats ?? 40,
      ],
    );
    return rows[0];
  }

  async addStop(
    tenantId: string,
    routeId: string,
    dto: {
      stop_name: string;
      latitude: number;
      longitude: number;
      pickup_time: string;
      fee_amount: number;
      stop_order?: number;
    },
  ) {
    const rows = await this.dataSource.query(
      `INSERT INTO transport_stops (
         tenant_id, route_id, stop_name, latitude, longitude, pickup_time, fee_amount, stop_order
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        tenantId,
        routeId,
        dto.stop_name,
        dto.latitude,
        dto.longitude,
        dto.pickup_time,
        dto.fee_amount,
        dto.stop_order ?? 0,
      ],
    );
    return rows[0];
  }

  /** Driver demo: simulate bus movement along route stops */
  async simulateGpsAlongRoute(tenantId: string, routeId: string) {
    const stops = await this.dataSource.query(
      `SELECT latitude, longitude FROM transport_stops
       WHERE route_id = $1 AND tenant_id = $2 AND latitude IS NOT NULL
       ORDER BY stop_order`,
      [routeId, tenantId],
    );
    if (!stops.length) throw new BadRequestException('No stops with coordinates');

    const idx = Math.floor(Date.now() / 5000) % stops.length;
    const stop = stops[idx];
    return this.ingestGpsPing(tenantId, routeId, Number(stop.latitude), Number(stop.longitude), 28);
  }
}
