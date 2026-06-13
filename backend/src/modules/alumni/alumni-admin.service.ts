import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AlumniEvent } from '../../entities/alumni-event.entity';
import { AlumniConversionService } from './alumni-conversion.service';

/** Resolve alumni row id across legacy (alumni_profile_id) and new (alumni_id) columns. */
const ALUMNI_ID = `COALESCE(p.alumni_id, p.alumni_profile_id)`;

@Injectable()
export class AlumniAdminService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AlumniEvent) private readonly events: Repository<AlumniEvent>,
    private readonly conversion: AlumniConversionService,
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
    return this.listConversionVerifications(tenantId);
  }

  async listConversionVerifications(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT ${ALUMNI_ID} AS alumni_id, p.student_user_id, p.user_id, p.name,
              COALESCE(p.personal_email, c.personal_email) AS personal_email,
              p.enrollment_number, p.batch_year, p.program_name,
              p.current_organization, p.linkedin_url, p.higher_education_details,
              p.verification_status, p.created_at, c.conversion_requested_at,
              sp.enrollment_no AS student_enrollment,
              c.library_cleared, c.hostel_cleared, c.dept_cleared, c.finance_cleared
       FROM alumni_profiles p
       LEFT JOIN student_exit_clearances c
         ON c.tenant_id = p.tenant_id AND c.student_user_id = p.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = p.student_user_id
       WHERE p.tenant_id = $1 AND p.verification_status = 'PENDING'
       ORDER BY COALESCE(c.conversion_requested_at, p.created_at) ASC`,
      [tenantId],
    );

    return rows.map((row: Record<string, unknown>) => {
      const library = Boolean(row.library_cleared);
      const hostel = Boolean(row.hostel_cleared);
      const dept = Boolean(row.dept_cleared);
      const finance = Boolean(row.finance_cleared);
      return {
        ...row,
        clearance: {
          library,
          hostel,
          dept,
          finance,
          all_cleared: library && hostel && dept && finance,
        },
      };
    });
  }

  async approveConversion(tenantId: string, alumniId: string, adminUserId: string) {
    return this.conversion.approveAndConvert(tenantId, alumniId, adminUserId);
  }

  async verifyProfile(
    tenantId: string,
    alumniId: string,
    adminUserId: string,
    dto: { action: 'approve' | 'reject' },
  ) {
    if (dto.action === 'approve') {
      return this.approveConversion(tenantId, alumniId, adminUserId);
    }

    const rows = await this.dataSource.query(
      `SELECT student_user_id, ${ALUMNI_ID} AS alumni_id
       FROM alumni_profiles p
       WHERE p.tenant_id = $1 AND (${ALUMNI_ID} = $2 OR p.alumni_profile_id = $2)`,
      [tenantId, alumniId],
    );
    if (!rows[0]) throw new NotFoundException('Alumni profile not found');

    await this.dataSource.query(
      `UPDATE alumni_profiles p SET verification_status = 'REJECTED', approved_at = NOW()
       WHERE p.tenant_id = $1 AND (${ALUMNI_ID} = $2 OR p.alumni_profile_id = $2)`,
      [tenantId, alumniId],
    );
    return { alumni_id: rows[0].alumni_id, verification_status: 'REJECTED' };
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
