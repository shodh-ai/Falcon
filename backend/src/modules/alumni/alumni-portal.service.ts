import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { AlumniProfile } from '../../entities/alumni-profile.entity';
import { AlumniDonation } from '../../entities/alumni-donation.entity';
import { AlumniEvent } from '../../entities/alumni-event.entity';
import { AlumniServiceRequest } from '../../entities/alumni-service-request.entity';

const DONATION_FUNDS = [
  { code: 'SCHOLARSHIP', label: 'Scholarship Fund' },
  { code: 'LIBRARY', label: 'Library Expansion Fund' },
  { code: 'LAB', label: 'Lab Infrastructure Fund' },
  { code: 'ENDOWMENT', label: 'General Endowment' },
];

@Injectable()
export class AlumniPortalService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AlumniProfile) private readonly profiles: Repository<AlumniProfile>,
    @InjectRepository(AlumniDonation) private readonly donations: Repository<AlumniDonation>,
    @InjectRepository(AlumniEvent) private readonly events: Repository<AlumniEvent>,
    @InjectRepository(AlumniServiceRequest) private readonly serviceRequests: Repository<AlumniServiceRequest>,
  ) {}

  async getMyProfile(tenantId: string, userId: string) {
    const profile = await this.ensureProfile(tenantId, userId);
    const dueAt = profile.career_update_due_at ?? this.nextCareerDueDate(profile.profile_updated_at);
    const needsUpdate =
      !profile.profile_updated_at ||
      new Date(dueAt).getTime() <= Date.now();

    return {
      ...this.serializeProfile(profile),
      career_update_due_at: dueAt,
      needs_career_update: needsUpdate,
    };
  }

  async updateMyProfile(
    tenantId: string,
    userId: string,
    dto: {
      current_organization?: string;
      designation?: string;
      linkedin_url?: string;
      higher_education_details?: Record<string, unknown>;
      opt_in_mentorship?: boolean;
    },
  ) {
    const profile = await this.ensureProfile(tenantId, userId);
    if (dto.current_organization !== undefined) {
      profile.current_organization = dto.current_organization;
    }
    if (dto.designation !== undefined) profile.designation = dto.designation;
    if (dto.linkedin_url !== undefined) profile.linkedin_url = dto.linkedin_url;
    if (dto.higher_education_details !== undefined) {
      profile.higher_education_details = dto.higher_education_details;
    }
    if (dto.opt_in_mentorship !== undefined) {
      profile.opt_in_mentorship = dto.opt_in_mentorship;
    }
    profile.profile_updated_at = new Date();
    profile.career_update_due_at = new Date(this.nextCareerDueDate(profile.profile_updated_at));
    await this.profiles.save(profile);
    return this.getMyProfile(tenantId, userId);
  }

  async directory(
    tenantId: string,
    filters: { batch_year?: number; organization?: string; q?: string },
  ) {
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT alumni_id, name, batch_year, program_name, current_organization, designation,
             linkedin_url, opt_in_mentorship, verification_status
      FROM alumni_profiles
      WHERE tenant_id = $1 AND verification_status IN ('VERIFIED', 'APPROVED')
    `;
    if (filters.batch_year) {
      params.push(filters.batch_year);
      sql += ` AND batch_year = $${params.length}`;
    }
    if (filters.organization?.trim()) {
      params.push(`%${filters.organization.trim()}%`);
      sql += ` AND current_organization ILIKE $${params.length}`;
    }
    if (filters.q?.trim()) {
      params.push(`%${filters.q.trim()}%`);
      sql += ` AND (name ILIKE $${params.length} OR current_organization ILIKE $${params.length})`;
    }
    sql += ' ORDER BY batch_year DESC, name ASC LIMIT 200';
    return this.dataSource.query(sql, params);
  }

  listDonationFunds() {
    return DONATION_FUNDS;
  }

  async initiateDonation(
    tenantId: string,
    userId: string,
    dto: { amount: number; purpose?: string; fund_code?: string },
  ) {
    const profile = await this.ensureProfile(tenantId, userId);
    const amount = Number(dto.amount);
    if (!amount || amount < 1) throw new BadRequestException('Invalid donation amount');

    const transactionId = `ALM-${randomUUID().slice(0, 12).toUpperCase()}`;
    const donation = this.donations.create({
      donation_id: randomUUID(),
      tenant_id: tenantId,
      alumni_id: profile.alumni_id,
      alumni_user_id: userId,
      amount,
      purpose: dto.purpose || DONATION_FUNDS.find((f) => f.code === dto.fund_code)?.label || 'Endowment',
      transaction_id: transactionId,
      payment_status: 'PENDING',
      gateway: 'RAZORPAY',
      gateway_reference: transactionId,
      ledger_account: dto.fund_code ?? 'ENDOWMENT',
      donated_at: new Date(),
    });
    await this.donations.save(donation);

    return {
      donation_id: donation.donation_id,
      transaction_id: transactionId,
      amount,
      currency: 'INR',
      gateway: 'RAZORPAY',
      ledger_account: donation.ledger_account,
      checkout_note:
        'Complete payment via the Finance gateway (Razorpay). On success, your 80G receipt will be available for download.',
      mock_checkout_url: `/student/fees?intent=alumni-donation&txn=${transactionId}`,
    };
  }

  async confirmDonationMock(tenantId: string, userId: string, donationId: string) {
    const donation = await this.donations.findOne({
      where: { donation_id: donationId, tenant_id: tenantId, alumni_user_id: userId },
    });
    if (!donation) throw new NotFoundException('Donation not found');
    donation.payment_status = 'SUCCESS';
    donation.tax_receipt_number = `80G-${new Date().getFullYear()}-${donation.transaction_id}`;
    await this.donations.save(donation);
    return donation;
  }

  async getDonationReceipt(tenantId: string, userId: string, donationId: string) {
    const donation = await this.donations.findOne({
      where: { donation_id: donationId, tenant_id: tenantId, alumni_user_id: userId },
    });
    if (!donation || donation.payment_status !== 'SUCCESS') {
      throw new NotFoundException('Receipt available only for successful donations');
    }
    const profile = await this.ensureProfile(tenantId, userId);
    return {
      receipt_number: donation.tax_receipt_number,
      donor_name: profile.name,
      amount: Number(donation.amount),
      purpose: donation.purpose,
      donated_at: donation.donated_at,
      ledger_account: donation.ledger_account,
      exemption_note: 'Eligible for tax deduction under Section 80G (demo receipt).',
    };
  }

  listMyDonations(tenantId: string, userId: string) {
    return this.donations.find({
      where: { tenant_id: tenantId, alumni_user_id: userId },
      order: { donated_at: 'DESC' },
    });
  }

  async listEvents(tenantId: string, userId: string) {
    const profile = await this.ensureProfile(tenantId, userId);
    const events = await this.events.find({
      where: { tenant_id: tenantId, is_published: true },
      order: { event_date: 'ASC' },
    });
    const registrations = await this.dataSource.query(
      `SELECT event_id, status FROM alumni_event_registrations
       WHERE tenant_id = $1 AND alumni_id = $2`,
      [tenantId, profile.alumni_id],
    );
    const regMap = new Map(registrations.map((r: { event_id: string; status: string }) => [r.event_id, r.status]));
    return events.map((e) => ({
      ...e,
      rsvp_status: regMap.get(e.event_id) ?? null,
    }));
  }

  async rsvpEvent(tenantId: string, userId: string, eventId: string) {
    const profile = await this.ensureProfile(tenantId, userId);
    await this.dataSource.query(
      `INSERT INTO alumni_event_registrations (tenant_id, event_id, alumni_id, status)
       VALUES ($1, $2, $3, 'REGISTERED')
       ON CONFLICT (event_id, alumni_id) DO UPDATE SET status = 'REGISTERED', registered_at = NOW()`,
      [tenantId, eventId, profile.alumni_id],
    );
    return { success: true, event_id: eventId, status: 'REGISTERED' };
  }

  listServiceRequests(userId: string) {
    return this.serviceRequests.find({
      where: { alumni_user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  createServiceRequest(
    userId: string,
    dto: { service_type: string; remarks?: string; dispatch_details?: Record<string, unknown> },
  ) {
    return this.serviceRequests.save(
      this.serviceRequests.create({
        alumni_user_id: userId,
        service_type: dto.service_type as never,
        status: 'SUBMITTED',
        remarks: dto.remarks ?? undefined,
        dispatch_details: dto.dispatch_details ?? null,
      }),
    );
  }

  listMentorsForStudents(tenantId: string) {
    return this.dataSource.query(
      `SELECT alumni_id, name, batch_year, current_organization, designation, linkedin_url
       FROM alumni_profiles
       WHERE tenant_id = $1 AND opt_in_mentorship = true
         AND verification_status IN ('VERIFIED', 'APPROVED')
       ORDER BY name ASC`,
      [tenantId],
    );
  }

  private async ensureProfile(tenantId: string, userId: string) {
    let profile = await this.profiles.findOne({
      where: { tenant_id: tenantId, student_user_id: userId },
    });
    if (!profile) {
      profile = await this.profiles.findOne({
        where: { tenant_id: tenantId, user_id: userId },
      });
    }
    if (!profile) {
      throw new NotFoundException('Alumni profile not found. Complete graduation clearance first.');
    }
    return profile;
  }

  private serializeProfile(profile: AlumniProfile) {
    return {
      alumni_id: profile.alumni_id,
      name: profile.name,
      email: profile.email,
      enrollment_number: profile.enrollment_number,
      batch_year: profile.batch_year,
      program_name: profile.program_name,
      current_organization: profile.current_organization,
      designation: profile.designation,
      linkedin_url: profile.linkedin_url,
      higher_education_details: profile.higher_education_details ?? {},
      verification_status: profile.verification_status,
      opt_in_mentorship: profile.opt_in_mentorship,
      profile_updated_at: profile.profile_updated_at,
    };
  }

  private nextCareerDueDate(from?: Date | null) {
    const base = from ? new Date(from) : new Date();
    const due = new Date(base);
    due.setMonth(due.getMonth() + 6);
    return due.toISOString();
  }
}
