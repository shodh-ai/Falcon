import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BED_LOCK_GRACE_SEC, BED_LOCK_TTL_SEC } from '../../common/constants/hostel-tatkal.constants';
import { RedisService } from '../../core/redis/redis.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { FinanceService } from '../finance/finance.service';
import { ProposeEventDto } from './dto/propose-event.dto';
import { UpsertMasterCalendarDto } from './dto/master-calendar.dto';
import { EstateApproveDto } from './dto/estate-approve.dto';

const HELD_VENUE_STATUSES = ['PENDING_ESTATE', 'PENDING_FINANCE', 'LIVE'];

@Injectable()
export class CampusEventsService {
  private readonly logger = new Logger(CampusEventsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly redis: RedisService,
    private readonly finance: FinanceService,
    private readonly notify: NotificationEmitterService,
    private readonly events: EventEmitter2,
  ) {}

  private qrCode(registrationId: string) {
    return `FALCON-EVT-${registrationId.replace(/-/g, '').slice(0, 16).toUpperCase()}`;
  }

  private async assertDateNotBlocked(tenantId: string, eventDate: string) {
    const day = eventDate.slice(0, 10);
    const blocked = await this.dataSource.query(
      `SELECT title FROM campus_master_calendar
       WHERE tenant_id = $1 AND date = $2::date AND is_blocked_for_events = true
       LIMIT 1`,
      [tenantId, day],
    );
    if (blocked[0]) {
      throw new BadRequestException(
        `This date is blocked on the master calendar (${blocked[0].title}). Choose another date.`,
      );
    }
  }

  async listMasterCalendar(tenantId: string, academicYear?: string) {
    return this.dataSource.query(
      `SELECT * FROM campus_master_calendar
       WHERE tenant_id = $1 AND ($2::text IS NULL OR academic_year = $2)
       ORDER BY date ASC`,
      [tenantId, academicYear ?? null],
    );
  }

  async listBlockedDates(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT date::text AS date, title FROM campus_master_calendar
       WHERE tenant_id = $1 AND is_blocked_for_events = true
       ORDER BY date ASC`,
      [tenantId],
    );
    return rows;
  }

  async upsertMasterCalendarEntry(tenantId: string, dto: UpsertMasterCalendarDto) {
    const rows = await this.dataSource.query(
      `INSERT INTO campus_master_calendar (tenant_id, date, title, description, is_blocked_for_events, academic_year)
       VALUES ($1, $2::date, $3, $4, COALESCE($5, true), $6)
       ON CONFLICT (tenant_id, date) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         is_blocked_for_events = EXCLUDED.is_blocked_for_events,
         academic_year = COALESCE(EXCLUDED.academic_year, campus_master_calendar.academic_year)
       RETURNING *`,
      [
        tenantId,
        dto.date.slice(0, 10),
        dto.title,
        dto.description ?? null,
        dto.is_blocked_for_events ?? true,
        dto.academic_year ?? String(new Date().getFullYear()),
      ],
    );
    return rows[0];
  }

  async deleteMasterCalendarEntry(tenantId: string, calendarId: string) {
    const rows = await this.dataSource.query(
      `DELETE FROM campus_master_calendar WHERE calendar_id = $1 AND tenant_id = $2 RETURNING calendar_id`,
      [calendarId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Calendar entry not found');
    return { deleted: true };
  }

  async listVenues(tenantId: string) {
    return this.dataSource.query(
      `SELECT asset_id AS venue_id, name, assigned_room AS location_label, asset_tag
       FROM university_assets
       WHERE tenant_id = $1 AND asset_type = 'VENUE' AND status = 'AVAILABLE'
       ORDER BY name ASC`,
      [tenantId],
    );
  }

  async checkVenueClash(tenantId: string, venueId: string, eventDate: string, excludeEventId?: string) {
    const rows = await this.dataSource.query(
      `SELECT e.event_id, e.title, e.event_date, e.venue, a.name AS venue_name
       FROM campus_events e
       LEFT JOIN university_assets a ON a.asset_id = e.venue_id
       WHERE e.tenant_id = $1 AND e.venue_id = $2
         AND DATE(e.event_date) = DATE($3::timestamptz)
         AND e.status = ANY($4::text[])
         AND e.advisor_approval = 'APPROVED'
         AND e.estate_approval != 'REJECTED'
         AND ($5::uuid IS NULL OR e.event_id != $5::uuid)`,
      [tenantId, venueId, eventDate, HELD_VENUE_STATUSES, excludeEventId ?? null],
    );
    return { has_clash: rows.length > 0, conflicts: rows };
  }

  private async notifyRoleHolders(
    tenantId: string,
    roleNames: string[],
    payload: { title: string; message: string; actionLink: string; eventTitle: string; eventId: string },
  ) {
    const users = await this.dataSource.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = ANY($2::text[]) AND u.is_active = true`,
      [tenantId, roleNames],
    );
    for (const u of users) {
      this.notify.eventPendingEstate({
        tenantId,
        userId: u.user_id,
        eventId: payload.eventId,
        eventTitle: payload.eventTitle,
        title: payload.title,
        message: payload.message,
        actionLink: payload.actionLink,
      });
    }
  }

  private async notifyFinanceHolders(tenantId: string, eventTitle: string, eventId: string) {
    const users = await this.dataSource.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name IN ('Accountant', 'SuperAdmin') AND u.is_active = true`,
      [tenantId],
    );
    for (const u of users) {
      this.notify.eventPendingFinance({
        tenantId,
        userId: u.user_id,
        eventId,
        eventTitle,
        title: 'Paid club event — finance approval',
        message: `"${eventTitle}" is ready for ledger mapping before going live.`,
        actionLink: '/finance/events',
      });
    }
  }

  private async tryPublishLive(tenantId: string, eventId: string) {
    const rows = await this.dataSource.query(
      `SELECT * FROM campus_events WHERE event_id = $1 AND tenant_id = $2`,
      [eventId, tenantId],
    );
    const e = rows[0];
    if (!e) return null;
    const financeOk =
      !e.is_paid || e.finance_approval === 'APPROVED' || e.finance_approval === 'NOT_REQUIRED';
    if (
      e.advisor_approval === 'APPROVED' &&
      e.estate_approval === 'APPROVED' &&
      financeOk &&
      e.status !== 'LIVE'
    ) {
      const updated = await this.dataSource.query(
        `UPDATE campus_events SET status = 'LIVE', approved_at = COALESCE(approved_at, NOW())
         WHERE event_id = $1 RETURNING *`,
        [eventId],
      );
      return updated[0];
    }
    return e;
  }

  private async resolveAdvisorUserId(tenantId: string, clubId: string): Promise<string | null> {
    const clubRows = await this.dataSource.query(
      `SELECT faculty_advisor_id FROM campus_clubs WHERE club_id = $1 AND tenant_id = $2`,
      [clubId, tenantId],
    );
    if (clubRows[0]?.faculty_advisor_id) return clubRows[0].faculty_advisor_id;

    const deanRows = await this.dataSource.query(
      `SELECT u.user_id FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND r.role_name = 'Dean' AND u.is_active = true
       LIMIT 1`,
      [tenantId],
    );
    return deanRows[0]?.user_id ?? null;
  }

  private async assertCanModerateEvent(
    tenantId: string,
    userId: string,
    roles: string[],
    eventId: string,
  ) {
    if (roles.includes('SuperAdmin') || roles.includes('Dean')) return;

    const rows = await this.dataSource.query(
      `SELECT c.faculty_advisor_id
       FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.event_id = $1 AND e.tenant_id = $2`,
      [eventId, tenantId],
    );
    const event = rows[0];
    if (!event) throw new NotFoundException('Event not found');
    if (event.faculty_advisor_id !== userId) {
      throw new ForbiddenException('Only the club faculty advisor or Dean may approve this event');
    }
  }

  async isClubCoordinator(tenantId: string, studentId: string) {
    const rows = await this.dataSource.query(
      `SELECT 1 FROM campus_clubs WHERE tenant_id = $1 AND student_coordinator_id = $2 LIMIT 1`,
      [tenantId, studentId],
    );
    return { is_coordinator: rows.length > 0 };
  }

  async proposeEvent(tenantId: string, coordinatorId: string, dto: ProposeEventDto) {
    const clubRows = await this.dataSource.query(
      `SELECT club_id, name, faculty_advisor_id FROM campus_clubs
       WHERE club_id = $1 AND tenant_id = $2 AND student_coordinator_id = $3`,
      [dto.club_id, tenantId, coordinatorId],
    );
    const club = clubRows[0];
    if (!club) throw new ForbiddenException('You are not the coordinator for this club');

    await this.assertDateNotBlocked(tenantId, dto.event_date);

    const price = dto.is_paid ? Number(dto.ticket_price ?? 0) : 0;
    if (dto.is_paid && price <= 0) {
      throw new BadRequestException('Paid events require a ticket price greater than zero');
    }

    let venueLabel = dto.venue ?? null;
    if (dto.venue_id) {
      const venueRows = await this.dataSource.query(
        `SELECT name FROM university_assets WHERE asset_id = $1 AND tenant_id = $2`,
        [dto.venue_id, tenantId],
      );
      if (!venueRows[0]) throw new BadRequestException('Selected venue not found');
      venueLabel = venueRows[0].name;
      const clash = await this.checkVenueClash(tenantId, dto.venue_id, dto.event_date);
      if (clash.has_clash) {
        throw new ConflictException(
          `${venueLabel} may already be booked on this date. Estate will review availability.`,
        );
      }
    }

    const financeApproval = dto.is_paid ? 'PENDING' : 'NOT_REQUIRED';

    const inserted = await this.dataSource.query(
      `INSERT INTO campus_events (
        tenant_id, club_id, title, description, guest_speakers, venue, venue_id, event_date,
        total_slots, available_slots, is_paid, ticket_price, status,
        advisor_approval, estate_approval, finance_approval
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,$10,$11,'PENDING_ADVISOR','PENDING','PENDING',$12)
      RETURNING *`,
      [
        tenantId,
        dto.club_id,
        dto.title,
        dto.description ?? null,
        dto.guest_speakers ?? null,
        venueLabel,
        dto.venue_id ?? null,
        dto.event_date,
        dto.total_slots,
        dto.is_paid,
        price,
        financeApproval,
      ],
    );
    const event = inserted[0];
    const advisorUserId = await this.resolveAdvisorUserId(tenantId, dto.club_id);
    if (advisorUserId) {
      this.notify.eventProposed({
        tenantId,
        userId: advisorUserId,
        eventId: event.event_id,
        clubId: dto.club_id,
        eventTitle: dto.title,
        clubName: club.name,
        title: 'New club event proposal',
        message: `${club.name} proposed "${dto.title}" for faculty approval.`,
        actionLink: '/faculty/event-approvals',
      });
    }
    this.events.emit('event.proposed', {
      eventId: event.event_id,
      clubId: dto.club_id,
      advisorUserId,
      tenantId,
    });
    return event;
  }

  async listPendingApprovals(tenantId: string, advisorId: string, roles: string[]) {
    if (roles.includes('SuperAdmin') || roles.includes('Dean')) {
      return this.dataSource.query(
        `SELECT e.*, c.name AS club_name, a.name AS venue_asset_name
         FROM campus_events e
         LEFT JOIN campus_clubs c ON c.club_id = e.club_id
         LEFT JOIN university_assets a ON a.asset_id = e.venue_id
         WHERE e.tenant_id = $1 AND e.status = 'PENDING_ADVISOR' AND e.advisor_approval = 'PENDING'
         ORDER BY e.created_at ASC`,
        [tenantId],
      );
    }
    return this.dataSource.query(
      `SELECT e.*, c.name AS club_name, a.name AS venue_asset_name
       FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       LEFT JOIN university_assets a ON a.asset_id = e.venue_id
       WHERE e.tenant_id = $1 AND e.status = 'PENDING_ADVISOR' AND e.advisor_approval = 'PENDING'
         AND c.faculty_advisor_id = $2
       ORDER BY e.created_at ASC`,
      [tenantId, advisorId],
    );
  }

  async approveEvent(tenantId: string, userId: string, roles: string[], eventId: string) {
    await this.assertCanModerateEvent(tenantId, userId, roles, eventId);
    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET advisor_approval = 'APPROVED', status = 'PENDING_ESTATE',
           approved_by = $3, approved_at = NOW(), rejection_comment = NULL
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_ADVISOR' AND advisor_approval = 'PENDING'
       RETURNING *`,
      [eventId, tenantId, userId],
    );
    if (!rows[0]) throw new BadRequestException('Event not found or already processed');
    const event = rows[0];
    const clubRows = await this.dataSource.query(
      `SELECT name FROM campus_clubs WHERE club_id = $1`,
      [event.club_id],
    );
    await this.notifyRoleHolders(tenantId, ['Registrar', 'Dean', 'SuperAdmin'], {
      eventId,
      eventTitle: event.title,
      title: 'Venue & security approval needed',
      message: `${clubRows[0]?.name ?? 'Club'} — "${event.title}" awaits estate sign-off.`,
      actionLink: '/admin-ops/events',
    });
    return event;
  }

  async rejectEvent(
    tenantId: string,
    userId: string,
    roles: string[],
    eventId: string,
    comment: string,
  ) {
    await this.assertCanModerateEvent(tenantId, userId, roles, eventId);
    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET status = 'REJECTED', advisor_approval = 'REJECTED', rejection_comment = $3,
           approved_by = $4, approved_at = NOW()
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_ADVISOR'
       RETURNING *`,
      [eventId, tenantId, comment, userId],
    );
    if (!rows[0]) throw new BadRequestException('Event not found or already processed');
    return rows[0];
  }

  async listEstatePending(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT e.*, c.name AS club_name, a.name AS venue_asset_name
       FROM campus_events e
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       LEFT JOIN university_assets a ON a.asset_id = e.venue_id
       WHERE e.tenant_id = $1 AND e.status = 'PENDING_ESTATE' AND e.advisor_approval = 'APPROVED'
       ORDER BY e.event_date ASC`,
      [tenantId],
    );
    const enriched = await Promise.all(
      rows.map(async (e: { venue_id?: string; event_date: string; event_id: string }) => {
        if (!e.venue_id) return { ...e, venue_clash: { has_clash: false, conflicts: [] } };
        const clash = await this.checkVenueClash(tenantId, e.venue_id, e.event_date, e.event_id);
        return { ...e, venue_clash: clash };
      }),
    );
    return enriched;
  }

  async approveEstate(tenantId: string, userId: string, eventId: string, dto: EstateApproveDto) {
    const current = await this.dataSource.query(
      `SELECT * FROM campus_events WHERE event_id = $1 AND tenant_id = $2`,
      [eventId, tenantId],
    );
    if (!current[0] || current[0].status !== 'PENDING_ESTATE') {
      throw new BadRequestException('Event not awaiting estate approval');
    }

    let venueId = dto.venue_id ?? current[0].venue_id;
    let venueName = dto.venue ?? current[0].venue;
    if (dto.venue_id) {
      const v = await this.dataSource.query(
        `SELECT name FROM university_assets WHERE asset_id = $1 AND tenant_id = $2`,
        [dto.venue_id, tenantId],
      );
      if (!v[0]) throw new BadRequestException('Venue not found');
      venueName = v[0].name;
      venueId = dto.venue_id;
    }

    if (venueId) {
      const clash = await this.checkVenueClash(tenantId, venueId, current[0].event_date, eventId);
      if (clash.has_clash) {
        throw new ConflictException(
          `Venue clash: ${clash.conflicts[0]?.title ?? 'another event'} is already scheduled.`,
        );
      }
    }

    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET estate_approval = 'APPROVED', estate_notes = $3, venue_id = $4, venue = $5,
           status = $6, approved_by = $7
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_ESTATE'
       RETURNING *`,
      [
        eventId,
        tenantId,
        dto.estate_notes ?? null,
        venueId,
        venueName,
        current[0].is_paid ? 'PENDING_FINANCE' : 'PENDING_ESTATE',
        userId,
      ],
    );
    const event = rows[0];
    if (event.is_paid) {
      await this.dataSource.query(
        `UPDATE campus_events SET status = 'PENDING_FINANCE' WHERE event_id = $1`,
        [eventId],
      );
      event.status = 'PENDING_FINANCE';
      await this.notifyFinanceHolders(tenantId, event.title, eventId);
    } else {
      await this.tryPublishLive(tenantId, eventId);
    }
    return (await this.dataSource.query(`SELECT * FROM campus_events WHERE event_id = $1`, [eventId]))[0];
  }

  async rejectEstate(tenantId: string, userId: string, eventId: string, comment: string) {
    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET status = 'REJECTED', estate_approval = 'REJECTED', rejection_comment = $3, approved_by = $4
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_ESTATE'
       RETURNING *`,
      [eventId, tenantId, comment, userId],
    );
    if (!rows[0]) throw new BadRequestException('Event not found or already processed');
    return rows[0];
  }

  async listFinancePending(tenantId: string) {
    return this.dataSource.query(
      `SELECT e.*, c.name AS club_name, cl.name AS club_ledger
       FROM campus_events e
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.tenant_id = $1 AND e.status = 'PENDING_FINANCE' AND e.is_paid = true
         AND e.advisor_approval = 'APPROVED' AND e.estate_approval = 'APPROVED'
       ORDER BY e.created_at ASC`,
      [tenantId],
    );
  }

  async approveFinance(tenantId: string, userId: string, eventId: string, ledgerCode?: string) {
    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET finance_approval = 'APPROVED',
           finance_ledger_code = COALESCE($3, finance_ledger_code, 'EVENTS_CLUB'),
           approved_by = $4
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_FINANCE'
       RETURNING *`,
      [eventId, tenantId, ledgerCode ?? null, userId],
    );
    if (!rows[0]) throw new BadRequestException('Event not found or not awaiting finance');
    return this.tryPublishLive(tenantId, eventId);
  }

  async rejectFinance(tenantId: string, userId: string, eventId: string, comment: string) {
    const rows = await this.dataSource.query(
      `UPDATE campus_events
       SET status = 'REJECTED', finance_approval = 'REJECTED', rejection_comment = $3, approved_by = $4
       WHERE event_id = $1 AND tenant_id = $2 AND status = 'PENDING_FINANCE'
       RETURNING *`,
      [eventId, tenantId, comment, userId],
    );
    if (!rows[0]) throw new BadRequestException('Event not found or already processed');
    return rows[0];
  }

  async listApprovedEvents(tenantId: string) {
    return this.dataSource.query(
      `SELECT e.*, c.name AS club_name,
              (e.available_slots - e.pending_holds) AS bookable_slots,
              CASE WHEN e.total_slots > 0
                THEN ROUND((e.available_slots::numeric / e.total_slots) * 100, 1)
                ELSE 0 END AS capacity_percent
       FROM campus_events e
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.tenant_id = $1 AND e.status = 'LIVE' AND e.event_date >= NOW() - INTERVAL '1 day'
       ORDER BY e.event_date ASC`,
      [tenantId],
    );
  }

  async listGlobalCalendar(tenantId: string) {
    const live = await this.listApprovedEvents(tenantId);
    const blocked = await this.listBlockedDates(tenantId);
    return { live_events: live, blocked_dates: blocked };
  }

  async getEventDetail(tenantId: string, eventId: string) {
    const rows = await this.dataSource.query(
      `SELECT e.*, c.name AS club_name, c.description AS club_description,
              (e.available_slots - e.pending_holds) AS bookable_slots,
              (SELECT COUNT(*)::int FROM event_registrations r
               WHERE r.event_id = e.event_id AND r.status IN ('FREE', 'PAID', 'PENDING_PAYMENT')) AS registered_count
       FROM campus_events e
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.event_id = $1 AND e.tenant_id = $2`,
      [eventId, tenantId],
    );
    if (!rows[0]) throw new NotFoundException('Event not found');
    return rows[0];
  }

  async getMyTickets(tenantId: string, studentId: string) {
    return this.dataSource.query(
      `SELECT r.*, e.title, e.venue, e.event_date, e.is_paid, e.ticket_price, c.name AS club_name
       FROM event_registrations r
       JOIN campus_events e ON e.event_id = r.event_id
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE r.tenant_id = $1 AND r.student_user_id = $2 AND r.status IN ('FREE', 'PAID')
       ORDER BY e.event_date ASC`,
      [tenantId, studentId],
    );
  }

  async registerForEvent(tenantId: string, studentId: string, eventId: string) {
    const event = await this.getEventDetail(tenantId, eventId);
    if (event.status !== 'LIVE') {
      throw new BadRequestException('Event is not live for registration yet');
    }

    const existing = await this.dataSource.query(
      `SELECT registration_id, status FROM event_registrations
       WHERE event_id = $1 AND student_user_id = $2`,
      [eventId, studentId],
    );
    if (existing[0]?.status === 'PAID' || existing[0]?.status === 'FREE') {
      throw new BadRequestException('You are already registered for this event');
    }
    if (existing[0]?.status === 'PENDING_PAYMENT') {
      return this.getPendingRegistration(tenantId, studentId, existing[0].registration_id);
    }

    if (event.is_paid) {
      return this.startPaidRegistration(tenantId, studentId, event);
    }
    return this.registerFree(tenantId, studentId, event);
  }

  private async registerFree(tenantId: string, studentId: string, event: { event_id: string }) {
    await this.dataSource.query('BEGIN');
    try {
      const slotRows = await this.dataSource.query(
        `UPDATE campus_events SET available_slots = available_slots - 1
         WHERE event_id = $1 AND tenant_id = $2 AND available_slots > 0
         RETURNING event_id`,
        [event.event_id, tenantId],
      );
      if (!slotRows[0]) {
        throw new BadRequestException('Event is full.');
      }

      const regId = randomUUID();
      const qr = this.qrCode(regId);
      const inserted = await this.dataSource.query(
        `INSERT INTO event_registrations (
          registration_id, tenant_id, event_id, student_user_id,
          status, payment_status, qr_code
        ) VALUES ($1,$2,$3,$4,'FREE','FREE',$5)
        ON CONFLICT (event_id, student_user_id) DO UPDATE
          SET status = 'FREE', payment_status = 'FREE', qr_code = EXCLUDED.qr_code
        RETURNING *`,
        [regId, tenantId, event.event_id, studentId, qr],
      );
      await this.dataSource.query('COMMIT');
      return { registration: inserted[0], checkout_required: false };
    } catch (e) {
      await this.dataSource.query('ROLLBACK');
      throw e;
    }
  }

  private async startPaidRegistration(
    tenantId: string,
    studentId: string,
    event: {
      event_id: string;
      ticket_price: string | number;
      title: string;
      club_id: string;
      club_name?: string;
    },
  ) {
    const acquired = await this.redis.acquireEventPayLock(event.event_id, studentId, BED_LOCK_TTL_SEC);
    if (!acquired) {
      throw new ConflictException('You already have an active checkout for this event.');
    }

    const serverNow = new Date();
    const expiresAt = new Date(serverNow.getTime() + BED_LOCK_TTL_SEC * 1000);

    try {
      const holdRows = await this.dataSource.query(
        `UPDATE campus_events
         SET pending_holds = pending_holds + 1
         WHERE event_id = $1 AND tenant_id = $2
           AND status = 'LIVE'
           AND (available_slots - pending_holds) > 0
         RETURNING event_id, ticket_price, title, club_id`,
        [event.event_id, tenantId],
      );
      if (!holdRows[0]) {
        await this.redis.releaseEventPayLock(event.event_id, studentId);
        throw new BadRequestException('Event is full.');
      }

      const regId = randomUUID();
      const inserted = await this.dataSource.query(
        `INSERT INTO event_registrations (
          registration_id, tenant_id, event_id, student_user_id,
          status, payment_status, hold_expires_at
        ) VALUES ($1,$2,$3,$4,'PENDING_PAYMENT','PENDING',$5)
        ON CONFLICT (event_id, student_user_id) DO UPDATE
          SET status = 'PENDING_PAYMENT', payment_status = 'PENDING',
              hold_expires_at = EXCLUDED.hold_expires_at
        RETURNING *`,
        [regId, tenantId, event.event_id, studentId, expiresAt.toISOString()],
      );
      const registration = inserted[0];

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 3);
      const amount = Number(event.ticket_price);
      const clubRows = await this.dataSource.query(
        `SELECT name FROM campus_clubs WHERE club_id = $1`,
        [event.club_id],
      );
      const clubName = clubRows[0]?.name ?? event.club_name ?? 'Club';

      const demand = await this.finance.createDemand(
        {
          student_user_id: studentId,
          fee_head: 'EVENTS_CLUB',
          academic_year: String(new Date().getFullYear()),
          total_amount: amount,
          due_date: dueDate.toISOString().slice(0, 10),
          fee_breakup: {
            club_id: event.club_id,
            club_name: clubName,
            event_id: event.event_id,
            event_title: event.title,
            ledger: 'Events/Clubs',
            registration_id: registration.registration_id,
          },
        },
        tenantId,
      );

      const orderId = `evt_${registration.registration_id.replace(/-/g, '').slice(0, 12)}_${Date.now()}`;
      await this.dataSource.query(
        `UPDATE event_registrations SET gateway_order_id = $2 WHERE registration_id = $1`,
        [registration.registration_id, orderId],
      );

      return {
        registration: { ...registration, gateway_order_id: orderId },
        checkout_required: true,
        expires_at: expiresAt.toISOString(),
        server_now: serverNow.toISOString(),
        lock_ttl_seconds: BED_LOCK_TTL_SEC,
        order: {
          order_id: orderId,
          registration_id: registration.registration_id,
          amount_inr: amount,
          amount_paise: Math.round(amount * 100),
          currency: 'INR',
          fee_head: 'EVENTS_CLUB',
          razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
          mock: true,
          demand_id: demand.demand_id,
          notes: {
            demand_id: demand.demand_id,
            fee_head: 'EVENTS_CLUB',
            event_id: event.event_id,
            registration_id: registration.registration_id,
            student_user_id: studentId,
            tenant_id: tenantId,
          },
        },
      };
    } catch (e) {
      await this.redis.releaseEventPayLock(event.event_id, studentId);
      await this.dataSource.query(
        `UPDATE campus_events SET pending_holds = GREATEST(0, pending_holds - 1)
         WHERE event_id = $1`,
        [event.event_id],
      );
      throw e;
    }
  }

  async getPendingRegistration(tenantId: string, studentId: string, registrationId: string) {
    const rows = await this.dataSource.query(
      `SELECT r.*, e.title, e.venue, e.event_date, e.ticket_price, e.event_id, c.name AS club_name
       FROM event_registrations r
       JOIN campus_events e ON e.event_id = r.event_id
       LEFT JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE r.registration_id = $1 AND r.tenant_id = $2 AND r.student_user_id = $3`,
      [registrationId, tenantId, studentId],
    );
    const reg = rows[0];
    if (!reg) throw new NotFoundException('Registration not found');

    const expiresMs = reg.hold_expires_at ? new Date(reg.hold_expires_at).getTime() : 0;
    const remaining = reg.hold_expires_at
      ? Math.max(0, Math.floor((expiresMs - Date.now()) / 1000))
      : 0;

    const amount = Number(reg.ticket_price ?? 0);
    const order =
      reg.status === 'PENDING_PAYMENT' && reg.gateway_order_id
        ? {
            order_id: reg.gateway_order_id,
            registration_id: reg.registration_id,
            amount_inr: amount,
            amount_paise: Math.round(amount * 100),
            currency: 'INR',
            fee_head: 'EVENTS_CLUB',
            razorpay_key: process.env.RAZORPAY_KEY_ID ?? 'rzp_test_FALCON_CAMPUS',
            mock: true,
            notes: {
              fee_head: 'EVENTS_CLUB',
              event_id: reg.event_id,
              registration_id: reg.registration_id,
              student_user_id: studentId,
              tenant_id: tenantId,
            },
          }
        : undefined;

    return {
      registration: reg,
      checkout_required: reg.status === 'PENDING_PAYMENT',
      expires_at: reg.hold_expires_at,
      server_now: new Date().toISOString(),
      remaining_seconds: remaining,
      lock_ttl_seconds: BED_LOCK_TTL_SEC,
      order,
    };
  }

  async confirmPaidRegistration(
    tenantId: string,
    studentId: string,
    registrationId: string,
    paymentRef: string,
  ) {
    return this.finalizePaidRegistration(tenantId, studentId, registrationId, paymentRef);
  }

  async finalizePaidRegistration(
    tenantId: string,
    studentId: string,
    registrationId: string,
    paymentRef: string,
  ) {
    const rows = await this.dataSource.query(
      `SELECT r.*, e.event_id, e.ticket_price
       FROM event_registrations r
       JOIN campus_events e ON e.event_id = r.event_id
       WHERE r.registration_id = $1 AND r.student_user_id = $2 AND r.tenant_id = $3`,
      [registrationId, studentId, tenantId],
    );
    const reg = rows[0];
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status === 'PAID') {
      return { confirmed: true, registration: reg, duplicate: true };
    }
    if (reg.status !== 'PENDING_PAYMENT') {
      throw new BadRequestException('Registration is not awaiting payment');
    }

    const expiresMs = reg.hold_expires_at ? new Date(reg.hold_expires_at).getTime() : 0;
    const graceEnd = expiresMs + BED_LOCK_GRACE_SEC * 1000;
    if (Date.now() > graceEnd) {
      throw new ConflictException('Checkout session expired. Please register again.');
    }

    await this.dataSource.query('BEGIN');
    try {
      const slotRows = await this.dataSource.query(
        `UPDATE campus_events
         SET available_slots = available_slots - 1,
             pending_holds = GREATEST(0, pending_holds - 1)
         WHERE event_id = $1 AND tenant_id = $2
         RETURNING event_id`,
        [reg.event_id, tenantId],
      );
      if (!slotRows[0]) {
        throw new BadRequestException('Could not confirm slot — event may be full.');
      }

      const qr = this.qrCode(registrationId);
      const updated = await this.dataSource.query(
        `UPDATE event_registrations
         SET status = 'PAID', payment_status = 'PAID', transaction_id = $2, qr_code = $3
         WHERE registration_id = $1
         RETURNING *`,
        [registrationId, paymentRef, qr],
      );
      await this.dataSource.query('COMMIT');
      await this.redis.releaseEventPayLock(reg.event_id, studentId);
      return { confirmed: true, registration: updated[0] };
    } catch (e) {
      await this.dataSource.query('ROLLBACK');
      throw e;
    }
  }

  async finalizeFromWebhook(
    tenantId: string,
    studentUserId: string,
    registrationId: string,
    paymentId: string,
  ) {
    return this.finalizePaidRegistration(tenantId, studentUserId, registrationId, paymentId);
  }

  async getMyClubs(tenantId: string, studentId: string) {
    return this.dataSource.query(
      `SELECT * FROM campus_clubs WHERE tenant_id = $1 AND student_coordinator_id = $2`,
      [tenantId, studentId],
    );
  }

  async listClubEvents(tenantId: string, studentId: string) {
    return this.dataSource.query(
      `SELECT e.*,
              (SELECT COUNT(*)::int FROM event_registrations r
               WHERE r.event_id = e.event_id AND r.status IN ('FREE','PAID')) AS confirmed_registrations,
              (SELECT COUNT(*)::int FROM event_registrations r
               WHERE r.event_id = e.event_id AND r.status = 'PENDING_PAYMENT') AS pending_payments
       FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.tenant_id = $1 AND c.student_coordinator_id = $2
       ORDER BY e.created_at DESC`,
      [tenantId, studentId],
    );
  }

  async exportAttendeesCsv(tenantId: string, studentId: string, eventId: string) {
    const access = await this.dataSource.query(
      `SELECT e.event_id, e.title
       FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.event_id = $1 AND e.tenant_id = $2 AND c.student_coordinator_id = $3`,
      [eventId, tenantId, studentId],
    );
    if (!access[0]) throw new ForbiddenException('Not authorized for this event');

    const rows = await this.dataSource.query(
      `SELECT u.name, u.official_email AS email, r.status, r.qr_code, r.registered_at
       FROM event_registrations r
       JOIN users u ON u.user_id = r.student_user_id
       WHERE r.event_id = $1 AND r.status IN ('FREE','PAID')
       ORDER BY r.registered_at`,
      [eventId],
    );

    const header = 'name,email,status,qr_code,registered_at';
    const lines = rows.map(
      (r: { name: string; email: string; status: string; qr_code: string; registered_at: string }) =>
        `"${(r.name ?? '').replace(/"/g, '""')}","${r.email ?? ''}",${r.status},${r.qr_code ?? ''},${r.registered_at}`,
    );
    return `${header}\n${lines.join('\n')}`;
  }

  async scanAttendance(
    tenantId: string,
    coordinatorId: string,
    eventId: string,
    qrCode: string,
  ) {
    const access = await this.dataSource.query(
      `SELECT e.event_id, e.title, e.event_date, e.status
       FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.event_id = $1 AND e.tenant_id = $2 AND c.student_coordinator_id = $3`,
      [eventId, tenantId, coordinatorId],
    );
    if (!access[0]) throw new ForbiddenException('Not authorized to scan for this event');
    if (access[0].status !== 'LIVE') {
      throw new BadRequestException('Event must be live before scanning attendance');
    }

    const regRows = await this.dataSource.query(
      `SELECT r.*, u.name AS student_name
       FROM event_registrations r
       JOIN users u ON u.user_id = r.student_user_id
       WHERE r.event_id = $1 AND r.tenant_id = $2 AND r.qr_code = $3 AND r.status IN ('FREE','PAID')`,
      [eventId, tenantId, qrCode.trim()],
    );
    const reg = regRows[0];
    if (!reg) throw new NotFoundException('Invalid ticket QR for this event');
    if (reg.attended) {
      return { scanned: true, duplicate: true, student_name: reg.student_name, registration: reg };
    }

    const updated = await this.dataSource.query(
      `UPDATE event_registrations
       SET attended = true, attended_at = NOW(), scanned_by = $2
       WHERE registration_id = $1
       RETURNING *`,
      [reg.registration_id, coordinatorId],
    );

    await this.creditExtracurricularAttendance(
      tenantId,
      reg.student_user_id,
      access[0].title,
      eventId,
      access[0].event_date,
      coordinatorId,
    );

    return {
      scanned: true,
      student_name: reg.student_name,
      registration: updated[0],
      iqac_credited: true,
    };
  }

  private async creditExtracurricularAttendance(
    tenantId: string,
    studentUserId: string,
    eventTitle: string,
    eventId: string,
    eventDate: string,
    loggedBy: string,
  ) {
    const marker = `Falcon Event:${eventId}`;
    const exists = await this.dataSource.query(
      `SELECT 1 FROM student_extracurriculars
       WHERE tenant_id = $1 AND student_user_id = $2 AND details LIKE $3 LIMIT 1`,
      [tenantId, studentUserId, `%${eventId}%`],
    );
    if (exists.length) return;

    await this.dataSource.query(
      `INSERT INTO student_extracurriculars (
        tenant_id, student_user_id, activity_type, details, credits_awarded, event_date, logged_by
      ) VALUES ($1, $2, 'SODECA', $3, 1, $4::date, $5)`,
      [
        tenantId,
        studentUserId,
        `${marker} — Attended "${eventTitle}" (NAAC extracurricular credit)`,
        eventDate.slice(0, 10),
        loggedBy,
      ],
    );
  }

  async getScanStats(tenantId: string, coordinatorId: string, eventId: string) {
    const access = await this.dataSource.query(
      `SELECT 1 FROM campus_events e
       JOIN campus_clubs c ON c.club_id = e.club_id
       WHERE e.event_id = $1 AND e.tenant_id = $2 AND c.student_coordinator_id = $3`,
      [eventId, tenantId, coordinatorId],
    );
    if (!access[0]) throw new ForbiddenException('Not authorized');

    const stats = await this.dataSource.query(
      `SELECT
         COUNT(*) FILTER (WHERE status IN ('FREE','PAID'))::int AS registered,
         COUNT(*) FILTER (WHERE attended = true)::int AS attended
       FROM event_registrations WHERE event_id = $1`,
      [eventId],
    );
    return stats[0];
  }

  @Interval(30_000)
  async expireStalePaymentHolds() {

    let expired: Array<{
      registration_id: string;
      event_id: string;
      student_user_id: string;
      tenant_id: string;
    }>;
    try {
      const updateResult = await this.dataSource.query(
        `UPDATE event_registrations r
         SET status = 'EXPIRED', payment_status = 'EXPIRED'
         FROM campus_events e
         WHERE r.event_id = e.event_id
           AND r.status = 'PENDING_PAYMENT'
           AND r.hold_expires_at < NOW()
         RETURNING r.registration_id, r.event_id, r.student_user_id, e.tenant_id`,
      );
      expired = Array.isArray(updateResult?.[0]) ? updateResult[0] : updateResult;

    } catch (err: unknown) {

      throw err;
    }
    for (const row of expired) {
      await this.redis.releaseEventPayLock(row.event_id, row.student_user_id);
      await this.dataSource.query(
        `UPDATE campus_events SET pending_holds = GREATEST(0, pending_holds - 1)
         WHERE event_id = $1`,
        [row.event_id],
      );
    }
    if (expired.length) {
      this.logger.debug(`Expired ${expired.length} event payment hold(s)`);
    }
  }
}
