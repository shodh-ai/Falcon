import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AlumniEvent } from '../../entities/alumni-event.entity';

/** Resolve alumni row id across legacy (alumni_profile_id) and new (alumni_id) columns. */
const ALUMNI_ID = `COALESCE(p.alumni_id, p.alumni_profile_id)`;

@Injectable()
export class AlumniAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AlumniEvent) private readonly events: Repository<AlumniEvent>,
  ) {}

  private async safeQuery<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
    try {
      return (await this.dataSource.query(sql, params)) as T[];
    } catch {
      return [] as T[];
    }
  }

  allProfiles(tenantId: string) {
    return this.safeQuery(
      `SELECT ${ALUMNI_ID} AS alumni_id, p.name, p.email, p.batch_year,
              p.verification_status, p.current_organization, p.designation,
              p.enrollment_number, p.created_at
       FROM alumni_profiles p
       WHERE p.tenant_id = $1
       ORDER BY p.created_at DESC`,
      [tenantId],
    );
  }

  verificationQueue(tenantId: string) {
    return this.dataSource.query(
      `SELECT ${ALUMNI_ID} AS alumni_id, p.student_user_id, p.user_id, p.name, p.email,
              p.enrollment_number, p.batch_year,
              p.current_organization, p.designation, p.linkedin_url,
              p.verification_status, p.created_at,
              sp.enrollment_no AS student_enrollment
       FROM alumni_profiles p
       LEFT JOIN student_profiles sp ON sp.user_id = p.student_user_id
       WHERE p.tenant_id = $1 AND p.verification_status = 'PENDING'
       ORDER BY p.created_at ASC`,
      [tenantId],
    );
  }

  async verifyProfile(
    tenantId: string,
    alumniId: string,
    adminUserId: string,
    dto: { action: 'approve' | 'reject' },
  ) {
    const rows = await this.dataSource.query(
      `SELECT student_user_id, ${ALUMNI_ID} AS alumni_id
       FROM alumni_profiles p
       WHERE p.tenant_id = $1 AND (${ALUMNI_ID} = $2 OR p.alumni_profile_id = $2)`,
      [tenantId, alumniId],
    );
    if (!rows[0]) throw new NotFoundException('Alumni profile not found');

    const status = dto.action === 'approve' ? 'VERIFIED' : 'REJECTED';
    await this.dataSource.query(
      `UPDATE alumni_profiles p SET verification_status = $3, approved_at = NOW()
       WHERE p.tenant_id = $1 AND (${ALUMNI_ID} = $2 OR p.alumni_profile_id = $2)`,
      [tenantId, alumniId, status],
    );

    if (dto.action === 'approve' && rows[0].student_user_id) {
      const role = await this.dataSource.query(`SELECT role_id FROM roles WHERE role_name = 'Alumni' LIMIT 1`);
      if (role[0]?.role_id) {
        await this.dataSource.query(`UPDATE users SET role_id = $1 WHERE user_id = $2`, [
          role[0].role_id,
          rows[0].student_user_id,
        ]);
      }
    }
    return { alumni_id: rows[0].alumni_id, verification_status: status };
  }

  donationLedger(tenantId: string) {
    return this.safeQuery(
      `SELECT d.*, p.name AS alumni_name, p.batch_year
       FROM alumni_donations d
       LEFT JOIN alumni_profiles p ON ${ALUMNI_ID} = d.alumni_id
       WHERE d.tenant_id = $1
       ORDER BY COALESCE(d.donated_at, d.created_at) DESC`,
      [tenantId],
    );
  }

  async donationSummary(tenantId: string) {
    const fyStart = new Date(new Date().getFullYear(), 3, 1);
    if (new Date() < fyStart) fyStart.setFullYear(fyStart.getFullYear() - 1);

    const rows = await this.safeQuery<{ total_fy: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total_fy
       FROM alumni_donations
       WHERE tenant_id = $1 AND payment_status = 'SUCCESS' AND donated_at >= $2`,
      [tenantId, fyStart.toISOString()],
    );
    const allTime = await this.safeQuery<{ total_all: string }>(
      `SELECT COALESCE(SUM(amount), 0) AS total_all
       FROM alumni_donations WHERE tenant_id = $1 AND payment_status = 'SUCCESS'`,
      [tenantId],
    );
    return {
      financial_year_start: fyStart.toISOString().slice(0, 10),
      total_funds_raised_fy: Number(rows[0]?.total_fy ?? 0),
      total_funds_raised_all_time: Number(allTime[0]?.total_all ?? 0),
    };
  }

  async engagementAnalytics(tenantId: string) {
    const corporate = await this.safeQuery(
      `SELECT COALESCE(NULLIF(TRIM(current_organization), ''), 'Unknown') AS label,
              COUNT(*)::int AS value
       FROM alumni_profiles
       WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')
       GROUP BY 1 ORDER BY value DESC LIMIT 8`,
      [tenantId],
    );

    const higherEd = await this.safeQuery(
      `SELECT COALESCE(higher_education_details->>'degree', 'Not Pursuing') AS label,
              COUNT(*)::int AS value
       FROM alumni_profiles
       WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')
       GROUP BY 1 ORDER BY value DESC`,
      [tenantId],
    );

    const mentorship = await this.safeQuery<{ mentors_opted_in: number; mentorship_sessions_completed: number }>(
      `SELECT COUNT(*) FILTER (WHERE opt_in_mentorship = true)::int AS mentors_opted_in,
              0::int AS mentorship_sessions_completed
       FROM alumni_profiles WHERE tenant_id = $1`,
      [tenantId],
    );

    return {
      corporate_retention: corporate,
      higher_education: higherEd,
      mentorship: mentorship[0] ?? { mentors_opted_in: 0, mentorship_sessions_completed: 0 },
    };
  }

  listEventsAdmin(tenantId: string) {
    return this.safeQuery(
      `SELECT e.*,
              COUNT(r.registration_id) FILTER (WHERE r.status = 'REGISTERED')::int AS rsvp_count
       FROM alumni_events e
       LEFT JOIN alumni_event_registrations r ON r.event_id = e.event_id
       WHERE e.tenant_id = $1
       GROUP BY e.event_id
       ORDER BY e.event_date DESC`,
      [tenantId],
    );
  }

  createEvent(
    tenantId: string,
    dto: { title: string; event_date: string; venue?: string; description?: string; is_published?: boolean },
  ) {
    return this.events.save(
      this.events.create({
        tenant_id: tenantId,
        title: dto.title,
        event_date: new Date(dto.event_date),
        venue: dto.venue ?? null,
        description: dto.description ?? null,
        is_published: dto.is_published ?? true,
      }),
    );
  }

  async updateEvent(
    tenantId: string,
    eventId: string,
    dto: Partial<{ title: string; event_date: string; venue: string; description: string; is_published: boolean }>,
  ) {
    const event = await this.events.findOne({ where: { event_id: eventId, tenant_id: tenantId } });
    if (!event) throw new NotFoundException('Event not found');
    if (dto.title) event.title = dto.title;
    if (dto.event_date) event.event_date = new Date(dto.event_date);
    if (dto.venue !== undefined) event.venue = dto.venue;
    if (dto.description !== undefined) event.description = dto.description;
    if (dto.is_published !== undefined) event.is_published = dto.is_published;
    return this.events.save(event);
  }
}
