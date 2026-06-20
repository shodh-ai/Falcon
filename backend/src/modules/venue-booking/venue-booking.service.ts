import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { DataSource } from 'typeorm';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { CreateVenueBookingDto } from './dto/create-venue-booking.dto';

const ACTIVE_STATUSES = ['PENDING_APPROVAL', 'APPROVED'] as const;
const MAX_ACTIVE_BOOKINGS_PER_STUDENT = 2;

const APPROVER_ROLE_MAP: Record<string, string> = {
  LIBRARIAN: 'Librarian',
  ESTATE_OFFICER: 'Registrar',
  HOD_CSE: 'HOD',
  HOD_MECH: 'HOD',
  HOD: 'HOD',
};

@Injectable()
export class VenueBookingService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  private mapApproverRole(approverRole: string): string {
    return APPROVER_ROLE_MAP[approverRole] ?? approverRole;
  }

  private approverActionLink(approverRole: string): string {
    if (approverRole === 'LIBRARIAN') return '/library/venue-requests';
    if (approverRole.startsWith('HOD_') || approverRole === 'HOD') return '/hod/venue-requests';
    return '/admin-ops/venue-requests';
  }

  async listVenues(tenantId: string, tag?: string) {
    const params: unknown[] = [tenantId];
    let tagClause = '';
    if (tag?.trim()) {
      params.push(tag.trim());
      tagClause = ` AND amenities @> to_jsonb(ARRAY[$2::text])`;
    }
    return this.db.query(
      `SELECT venue_id, name, capacity, amenities, approver_role, max_duration_mins
       FROM campus_venues
       WHERE tenant_id = $1 AND is_bookable_by_students = true${tagClause}
       ORDER BY name`,
      params,
    );
  }

  async listAmenityTags(tenantId: string) {
    const rows = (await this.db.query(
      `SELECT DISTINCT jsonb_array_elements_text(amenities) AS tag
       FROM campus_venues
       WHERE tenant_id = $1 AND is_bookable_by_students = true
       ORDER BY tag`,
      [tenantId],
    )) as Array<{ tag: string }>;
    return rows.map((r) => r.tag);
  }

  async getVenueAvailability(tenantId: string, venueId: string, date: string) {
    const venueRows = await this.db.query(
      `SELECT venue_id, name, max_duration_mins FROM campus_venues
       WHERE tenant_id = $1 AND venue_id = $2 AND is_bookable_by_students = true`,
      [tenantId, venueId],
    );
    if (!venueRows[0]) throw new NotFoundException('Venue not found');

    const bookings = await this.db.query(
      `SELECT booking_id, start_time, end_time, status, purpose,
              u.name AS student_name
       FROM venue_bookings b
       JOIN users u ON u.user_id = b.student_user_id
       WHERE b.tenant_id = $1 AND b.venue_id = $2
         AND b.status IN ('PENDING_APPROVAL', 'APPROVED')
         AND DATE(b.start_time AT TIME ZONE 'Asia/Kolkata') = DATE($3::timestamptz)
       ORDER BY b.start_time`,
      [tenantId, venueId, date],
    );

    return { venue: venueRows[0], bookings };
  }

  async listMyBookings(tenantId: string, studentUserId: string) {
    return this.db.query(
      `SELECT b.booking_id, b.venue_id, v.name AS venue_name, b.start_time, b.end_time,
              b.purpose, b.status, b.approver_remarks, b.qr_token, b.created_at
       FROM venue_bookings b
       JOIN campus_venues v ON v.venue_id = b.venue_id
       WHERE b.tenant_id = $1 AND b.student_user_id = $2
       ORDER BY b.start_time DESC`,
      [tenantId, studentUserId],
    );
  }

  async getBookingPass(tenantId: string, studentUserId: string, bookingId: string) {
    const rows = await this.db.query(
      `SELECT b.booking_id, b.qr_token, b.start_time, b.end_time, b.status,
              v.name AS venue_name, u.name AS student_name
       FROM venue_bookings b
       JOIN campus_venues v ON v.venue_id = b.venue_id
       JOIN users u ON u.user_id = b.student_user_id
       WHERE b.tenant_id = $1 AND b.booking_id = $2 AND b.student_user_id = $3`,
      [tenantId, bookingId, studentUserId],
    );
    if (!rows[0]) throw new NotFoundException('Booking not found');
    if (rows[0].status !== 'APPROVED') {
      throw new BadRequestException('Room pass is available only for approved bookings');
    }
    if (!rows[0].qr_token) {
      throw new BadRequestException('QR pass not yet generated');
    }
    return {
      booking_id: rows[0].booking_id,
      venue_name: rows[0].venue_name,
      student_name: rows[0].student_name,
      start_time: rows[0].start_time,
      end_time: rows[0].end_time,
      qr_payload: `VENUE:${rows[0].booking_id}:${rows[0].qr_token}`,
    };
  }

  private async assertNoOverlap(
    tenantId: string,
    venueId: string,
    startTime: string,
    endTime: string,
    excludeBookingId?: string,
  ) {
    const rows = await this.db.query(
      `SELECT booking_id FROM venue_bookings
       WHERE tenant_id = $1 AND venue_id = $2
         AND status IN ('PENDING_APPROVAL', 'APPROVED')
         AND (start_time, end_time) OVERLAPS ($3::timestamptz, $4::timestamptz)
         AND ($5::uuid IS NULL OR booking_id != $5::uuid)
       LIMIT 1`,
      [tenantId, venueId, startTime, endTime, excludeBookingId ?? null],
    );
    if (rows.length) {
      throw new ConflictException('Slot no longer available');
    }
  }

  private async assertRateLimit(tenantId: string, studentUserId: string) {
    const rows = (await this.db.query(
      `SELECT COUNT(*)::int AS c FROM venue_bookings
       WHERE tenant_id = $1 AND student_user_id = $2
         AND status IN ('PENDING_APPROVAL', 'APPROVED')
         AND end_time > NOW()`,
      [tenantId, studentUserId],
    )) as Array<{ c: number }>;
    if ((rows[0]?.c ?? 0) >= MAX_ACTIVE_BOOKINGS_PER_STUDENT) {
      throw new BadRequestException(
        `You can have at most ${MAX_ACTIVE_BOOKINGS_PER_STUDENT} active or pending bookings at a time`,
      );
    }
  }

  async createBooking(tenantId: string, studentUserId: string, dto: CreateVenueBookingDto) {
    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      throw new BadRequestException('Invalid time range');
    }
    if (start < new Date()) {
      throw new BadRequestException('Cannot book a slot in the past');
    }

    const venueRows = await this.db.query(
      `SELECT venue_id, name, max_duration_mins, approver_role
       FROM campus_venues
       WHERE tenant_id = $1 AND venue_id = $2 AND is_bookable_by_students = true`,
      [tenantId, dto.venue_id],
    );
    if (!venueRows[0]) throw new NotFoundException('Venue not found');

    const durationMins = (end.getTime() - start.getTime()) / 60_000;
    if (durationMins > Number(venueRows[0].max_duration_mins)) {
      throw new BadRequestException(
        `Booking exceeds maximum duration of ${venueRows[0].max_duration_mins} minutes`,
      );
    }

    await this.assertRateLimit(tenantId, studentUserId);
    await this.assertNoOverlap(tenantId, dto.venue_id, dto.start_time, dto.end_time);

    const studentRows = await this.db.query(
      `SELECT u.name, sp.semester
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [studentUserId],
    );
    const studentName = studentRows[0]?.name ?? 'Student';
    const semester = studentRows[0]?.semester ?? null;

    const inserted = await this.db.query(
      `INSERT INTO venue_bookings
         (tenant_id, venue_id, student_user_id, start_time, end_time, purpose, status)
       VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, 'PENDING_APPROVAL')
       RETURNING *`,
      [tenantId, dto.venue_id, studentUserId, dto.start_time, dto.end_time, dto.purpose],
    );
    const booking = inserted[0];

    await this.notifyApproversForVenue(tenantId, venueRows[0].approver_role, {
      bookingId: booking.booking_id,
      venueName: venueRows[0].name,
      studentName,
      semester,
      purpose: dto.purpose,
      startTime: dto.start_time,
      endTime: dto.end_time,
    });

    return booking;
  }

  private async notifyApproversForVenue(
    tenantId: string,
    approverRole: string,
    payload: {
      bookingId: string;
      venueName: string;
      studentName: string;
      semester: number | null;
      purpose: string;
      startTime: string;
      endTime: string;
    },
  ) {
    const dbRole = this.mapApproverRole(approverRole);
    const users = (await this.db.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = $2 AND u.is_active = true`,
      [tenantId, dbRole],
    )) as Array<{ user_id: string }>;

    const startLabel = new Date(payload.startTime).toLocaleString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
    const endLabel = new Date(payload.endTime).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });
    const semLabel = payload.semester ? ` (Sem ${payload.semester})` : '';

    for (const u of users) {
      this.notify.venueBookingPendingApproval({
        tenantId,
        userId: u.user_id,
        bookingId: payload.bookingId,
        venueName: payload.venueName,
        studentName: payload.studentName,
        purpose: payload.purpose,
        title: 'Venue booking request',
        message: `${payload.studentName}${semLabel} requested ${payload.venueName} for "${payload.purpose}". ${startLabel} – ${endLabel}.`,
        actionLink: this.approverActionLink(approverRole),
      });
    }
  }

  async listPendingForApprover(tenantId: string, approverRoleKeys: string[]) {
    return this.db.query(
      `SELECT b.booking_id, b.start_time, b.end_time, b.purpose, b.status, b.created_at,
              v.name AS venue_name, v.approver_role,
              u.name AS student_name, sp.semester
       FROM venue_bookings b
       JOIN campus_venues v ON v.venue_id = b.venue_id
       JOIN users u ON u.user_id = b.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE b.tenant_id = $1
         AND b.status = 'PENDING_APPROVAL'
         AND v.approver_role = ANY($2::text[])
         AND b.start_time > NOW()
       ORDER BY b.start_time ASC`,
      [tenantId, approverRoleKeys],
    );
  }

  private async getBookingForApproval(tenantId: string, bookingId: string) {
    const rows = await this.db.query(
      `SELECT b.*, v.name AS venue_name, v.approver_role,
              u.name AS student_name, u.user_id AS student_id
       FROM venue_bookings b
       JOIN campus_venues v ON v.venue_id = b.venue_id
       JOIN users u ON u.user_id = b.student_user_id
       WHERE b.tenant_id = $1 AND b.booking_id = $2`,
      [tenantId, bookingId],
    );
    if (!rows[0]) throw new NotFoundException('Booking not found');
    return rows[0];
  }

  private assertApproverCanAct(approverRoleKeys: string[], venueApproverRole: string) {
    if (!approverRoleKeys.includes(venueApproverRole)) {
      throw new ForbiddenException('You are not authorized to act on this venue booking');
    }
  }

  async approveBooking(
    tenantId: string,
    approverUserId: string,
    bookingId: string,
    remarks?: string,
    approverRoleKeys: string[] = [],
  ) {
    const booking = await this.getBookingForApproval(tenantId, bookingId);
    if (booking.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only pending bookings can be approved');
    }
    if (new Date(booking.start_time) <= new Date()) {
      throw new BadRequestException('Cannot approve a booking whose start time has passed');
    }
    this.assertApproverCanAct(approverRoleKeys, booking.approver_role);

    await this.assertNoOverlap(
      tenantId,
      booking.venue_id,
      booking.start_time,
      booking.end_time,
      bookingId,
    );

    const qrToken = randomBytes(20).toString('hex');
    const updated = await this.db.query(
      `UPDATE venue_bookings
       SET status = 'APPROVED',
           approved_by_user_id = $3,
           approver_remarks = $4,
           qr_token = $5,
           updated_at = NOW()
       WHERE tenant_id = $1 AND booking_id = $2
       RETURNING *`,
      [tenantId, bookingId, approverUserId, remarks ?? null, qrToken],
    );

    this.notify.venueBookingApproved({
      tenantId,
      userId: booking.student_id,
      bookingId,
      venueName: booking.venue_name,
      startTime: booking.start_time,
      endTime: booking.end_time,
      title: 'Venue booking approved',
      message: `Your booking for ${booking.venue_name} is confirmed. Show your digital room pass at the venue.`,
      actionLink: '/student/venues',
    });

    return updated[0];
  }

  async rejectBooking(
    tenantId: string,
    approverUserId: string,
    bookingId: string,
    remarks?: string,
    approverRoleKeys: string[] = [],
  ) {
    const booking = await this.getBookingForApproval(tenantId, bookingId);
    if (booking.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only pending bookings can be rejected');
    }
    this.assertApproverCanAct(approverRoleKeys, booking.approver_role);

    const updated = await this.db.query(
      `UPDATE venue_bookings
       SET status = 'REJECTED',
           approved_by_user_id = $3,
           approver_remarks = $4,
           updated_at = NOW()
       WHERE tenant_id = $1 AND booking_id = $2
       RETURNING *`,
      [tenantId, bookingId, approverUserId, remarks ?? null],
    );

    this.notify.venueBookingRejected({
      tenantId,
      userId: booking.student_id,
      bookingId,
      venueName: booking.venue_name,
      remarks: remarks ?? 'No remarks provided',
      title: 'Venue booking rejected',
      message: remarks
        ? `Your request for ${booking.venue_name} was rejected: ${remarks}`
        : `Your request for ${booking.venue_name} was rejected.`,
      actionLink: '/student/venues',
    });

    return updated[0];
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  async expireStalePendingBookings() {
    try {
      const tableExists = await this.db.query(
        `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venue_bookings') AS exists`
      );
      if (!tableExists[0]?.exists) return;

      const expired = await this.db.query(
        `UPDATE venue_bookings
         SET status = 'EXPIRED', updated_at = NOW()
         WHERE status = 'PENDING_APPROVAL' AND start_time < NOW()
         RETURNING booking_id, tenant_id, student_user_id, venue_id`,
      );
      if (!expired.length) return;

      for (const row of expired) {
        const meta = await this.db.query(
          `SELECT v.name AS venue_name FROM campus_venues v WHERE v.venue_id = $1`,
          [row.venue_id],
        );
        this.notify.venueBookingRejected({
          tenantId: row.tenant_id,
          userId: row.student_user_id,
          bookingId: row.booking_id,
          venueName: meta[0]?.venue_name ?? 'Venue',
          remarks: 'Request expired — start time passed before approval',
          title: 'Venue booking expired',
          message: `Your booking request for ${meta[0]?.venue_name ?? 'a venue'} expired because it was not approved in time.`,
          actionLink: '/student/venues',
        });
      }
    } catch (error) {
      // Ignore if table missing or other scheduled task error
    }
  }
}
