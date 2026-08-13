import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { randomUUID } from 'crypto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';
import { FinanceService } from '../finance/finance.service';
import { AlumniConversionService } from '../alumni/alumni-conversion.service';
import { ObjectStorageService } from '../../storage/object-storage.service';
import {
  CERTIFICATE_AUTOMATION_QUEUE,
  type CertificateGenerationJob,
} from '../../common/constants/certificate-automation-queue.constants';
import { DegreeCertificatePdfService } from './pdf/degree-certificate-pdf.service';
import { UpsertCertEventDto } from './dto/upsert-event.dto';

@Injectable()
export class CertificateAutomationService {
  private readonly logger = new Logger(CertificateAutomationService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @InjectQueue(CERTIFICATE_AUTOMATION_QUEUE)
    private readonly certQueue: Queue,
    private readonly finance: FinanceService,
    private readonly alumniConversion: AlumniConversionService,
    private readonly notify: NotificationEmitterService,
    private readonly pdf: DegreeCertificatePdfService,
    private readonly storage: ObjectStorageService,
    private readonly enterpriseAudit: EnterpriseAuditService,
  ) {}

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private async notifyStudent(
    tenantId: string,
    studentUserId: string,
    title: string,
    message: string,
  ) {
    this.notify.certificateStatusUpdated({
      tenantId,
      userId: studentUserId,
      title,
      message,
      actionLink: '/student/certificates',
    });
  }

  private async notifyEligibleStudents(
    tenantId: string,
    eventName: string,
    endDate: string,
  ) {
    const students = await this.db.query(
      `SELECT DISTINCT u.user_id
       FROM users u
       JOIN user_roles ur ON ur.user_id = u.user_id
       JOIN roles r ON r.role_id = ur.role_id
       JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.tenant_id = $1
         AND r.role_name = 'Student'
         AND u.is_active = true
         AND sp.deleted_at IS NULL
         AND COALESCE(sp.current_semester, 0) >= 8`,
      [tenantId],
    );
    for (const row of students as { user_id: string }[]) {
      this.notify.certificateStatusUpdated({
        tenantId,
        userId: row.user_id,
        title: `${eventName} — Apply Now`,
        message: `Degree / transcript applications are open until ${new Date(endDate).toLocaleDateString('en-IN')}.`,
        actionLink: '/student/certificates',
      });
    }
  }

  async getActiveEvent(tenantId?: string) {
    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db.query(
      `SELECT * FROM cert_events
       WHERE tenant_id = $1 AND is_active = true
         AND application_start_date <= $2::date
         AND application_end_date >= $2::date
       ORDER BY created_at DESC
       LIMIT 1`,
      [this.tenant(tenantId), today],
    );
    return rows[0] ?? null;
  }

  async listEvents(tenantId?: string) {
    return this.db.query(
      `SELECT e.*,
              (SELECT COUNT(*)::int FROM cert_applications ca WHERE ca.event_id = e.event_id) AS application_count,
              (SELECT COUNT(*)::int FROM cert_applications ca
               WHERE ca.event_id = e.event_id AND ca.verification_status = 'VERIFIED') AS verified_count
       FROM cert_events e
       WHERE e.tenant_id = $1
       ORDER BY e.created_at DESC`,
      [this.tenant(tenantId)],
    );
  }

  async upsertEvent(tenantId: string | undefined, dto: UpsertCertEventDto) {
    const tid = this.tenant(tenantId);
    if (dto.is_active !== false) {
      await this.db.query(
        `UPDATE cert_events SET is_active = false, updated_at = NOW() WHERE tenant_id = $1`,
        [tid],
      );
    }
    const rows = await this.db.query(
      `INSERT INTO cert_events (
         tenant_id, event_name, application_start_date, application_end_date, base_fee, is_active
       ) VALUES ($1, $2, $3::date, $4::date, $5, COALESCE($6, true))
       RETURNING *`,
      [
        tid,
        dto.event_name,
        dto.application_start_date,
        dto.application_end_date,
        dto.base_fee,
        dto.is_active ?? true,
      ],
    );
    if (dto.is_active !== false) {
      await this.notifyEligibleStudents(
        tid,
        dto.event_name,
        dto.application_end_date,
      );
    }
    return rows[0];
  }

  async listMyApplications(
    tenantId: string | undefined,
    studentUserId: string,
  ) {
    return this.db.query(
      `SELECT ca.*, ce.event_name, ce.base_fee,
              fd.status AS fee_status, fd.total_amount, fd.paid_amount
       FROM cert_applications ca
       JOIN cert_events ce ON ce.event_id = ca.event_id
       LEFT JOIN finance_fee_demands fd ON fd.demand_id = ca.finance_demand_id
       WHERE ca.tenant_id = $1 AND ca.student_user_id = $2
       ORDER BY ca.applied_at DESC`,
      [this.tenant(tenantId), studentUserId],
    );
  }

  /** Creates application + fee demand. Application stays PAYMENT_PENDING until webhook. */
  async initiateApplication(
    tenantId: string | undefined,
    studentUserId: string,
    eventId: string,
  ) {
    const tid = this.tenant(tenantId);
    const event = await this.db.query(
      `SELECT * FROM cert_events
       WHERE event_id = $1 AND tenant_id = $2 AND is_active = true`,
      [eventId, tid],
    );
    if (!event[0])
      throw new NotFoundException('Convocation event not found or inactive');

    const today = new Date().toISOString().slice(0, 10);
    const ev = event[0] as {
      application_start_date: string;
      application_end_date: string;
      base_fee: string | number;
      event_name: string;
    };
    if (today < String(ev.application_start_date).slice(0, 10)) {
      throw new BadRequestException('Applications have not opened yet');
    }
    if (today > String(ev.application_end_date).slice(0, 10)) {
      throw new BadRequestException('Application window has closed');
    }

    const existing = await this.db.query(
      `SELECT application_id, verification_status, finance_demand_id
       FROM cert_applications
       WHERE event_id = $1 AND student_user_id = $2`,
      [eventId, studentUserId],
    );
    if (existing[0]) {
      const row = existing[0] as {
        verification_status: string;
        finance_demand_id: string;
      };
      if (row.verification_status !== 'PAYMENT_PENDING') {
        throw new BadRequestException(
          'You have already applied for this event',
        );
      }
      return {
        application_id: existing[0].application_id,
        finance_demand_id: row.finance_demand_id,
        payment_required: true,
      };
    }

    const dueDate = ev.application_end_date;
    let demandId: string | null = null;
    try {
      const demand = await this.finance.createDemand(
        {
          student_user_id: studentUserId,
          fee_head: 'DEGREE_CERTIFICATE',
          academic_year: new Date().getFullYear().toString(),
          semester: 8,
          total_amount: Number(ev.base_fee),
          due_date: String(dueDate).slice(0, 10),
          fee_breakup: {
            event_id: eventId,
            event_name: ev.event_name,
            cert_type: 'DEGREE',
          },
        },
        tid,
      );
      demandId = demand.demand_id ?? null;
    } catch {
      // Still accept the degree application if fee demand creation fails.
      demandId = null;
    }

    const verificationStatus = demandId
      ? 'PAYMENT_PENDING'
      : 'PENDING_VERIFICATION';

    const rows = await this.db.query(
      `INSERT INTO cert_applications (
         tenant_id, event_id, student_user_id, finance_demand_id, verification_status
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [tid, eventId, studentUserId, demandId, verificationStatus],
    );

    await this.notifyStudent(
      tid,
      studentUserId,
      'Degree Application Submitted',
      demandId
        ? 'Your degree application is recorded. Complete the fee payment to send it for registrar verification.'
        : 'Your degree application is recorded and pending registrar verification.',
    );

    return {
      ...rows[0],
      finance_demand_id: demandId,
      payment_required: Boolean(demandId),
    };
  }

  /** Called by finance webhook listener after Razorpay SUCCESS */
  async onFeePaid(demandId: string) {
    const txnRows = await this.db.query(
      `SELECT transaction_id FROM finance_transactions
       WHERE demand_id = $1 AND status = 'SUCCESS'
       ORDER BY created_at DESC LIMIT 1`,
      [demandId],
    );
    const transactionId =
      (txnRows[0]?.transaction_id as string | undefined) ?? null;

    const rows = await this.db.query(
      `UPDATE cert_applications ca
       SET verification_status = 'PENDING_VERIFICATION',
           fee_transaction_id = COALESCE($2, ca.fee_transaction_id),
           updated_at = NOW()
       FROM users u
       WHERE ca.finance_demand_id = $1
         AND ca.verification_status = 'PAYMENT_PENDING'
         AND u.user_id = ca.student_user_id
       RETURNING ca.*, u.tenant_id, u.name AS student_name`,
      [demandId, transactionId],
    );
    const row = rows[0] as
      | {
          application_id: string;
          student_user_id: string;
          tenant_id: string;
        }
      | undefined;
    if (row) {
      await this.notifyStudent(
        row.tenant_id,
        row.student_user_id,
        'Degree Application — Payment Received',
        'Your fee payment was successful. Your application is pending registrar verification.',
      );
    }
    return row ?? null;
  }

  async listPendingVerification(tenantId?: string) {
    return this.db.query(
      `SELECT ca.*, u.name AS student_name, u.official_email, sp.enrollment_no,
              ce.event_name
       FROM cert_applications ca
       JOIN users u ON u.user_id = ca.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
       JOIN cert_events ce ON ce.event_id = ca.event_id
       WHERE ca.tenant_id = $1 AND ca.verification_status = 'PENDING_VERIFICATION'
       ORDER BY ca.applied_at ASC`,
      [this.tenant(tenantId)],
    );
  }

  async listEventApplications(tenantId: string | undefined, eventId: string) {
    return this.db.query(
      `SELECT ca.*, u.name AS student_name, sp.enrollment_no
       FROM cert_applications ca
       JOIN users u ON u.user_id = ca.student_user_id
       LEFT JOIN student_profiles sp ON sp.user_id = ca.student_user_id
       WHERE ca.tenant_id = $1 AND ca.event_id = $2
       ORDER BY ca.applied_at ASC`,
      [this.tenant(tenantId), eventId],
    );
  }

  async verifyApplication(
    tenantId: string | undefined,
    applicationId: string,
    adminUserId: string,
    action: 'approve' | 'reject',
    actorMeta?: { role?: string; ip?: string; sessionId?: string },
  ) {
    const tid = this.tenant(tenantId);
    const app = await this.db.query(
      `SELECT ca.*, u.name AS student_name
       FROM cert_applications ca
       JOIN users u ON u.user_id = ca.student_user_id
       WHERE ca.application_id = $1 AND ca.tenant_id = $2`,
      [applicationId, tid],
    );
    if (!app[0]) throw new NotFoundException('Application not found');
    const row = app[0] as {
      student_user_id: string;
      verification_status: string;
      student_name: string;
    };

    if (row.verification_status !== 'PENDING_VERIFICATION') {
      throw new BadRequestException('Application is not pending verification');
    }

    if (action === 'approve') {
      const clearance = await this.alumniConversion.getClearanceStatus(
        tid,
        row.student_user_id,
      );
      if (!clearance.all_cleared) {
        throw new BadRequestException(
          'Cannot verify: student has pending no-dues (Finance, Library, Hostel, or Department).',
        );
      }
    }

    const newStatus = action === 'approve' ? 'VERIFIED' : 'REJECTED';
    const updated = await this.db.query(
      `UPDATE cert_applications
       SET verification_status = $3,
           president_ratification_status = CASE WHEN $3 = 'VERIFIED' THEN 'PENDING' ELSE president_ratification_status END,
           updated_at = NOW()
       WHERE application_id = $1 AND tenant_id = $2 AND verification_status = 'PENDING_VERIFICATION'
       RETURNING *`,
      [applicationId, tid, newStatus],
    );

    await this.notifyStudent(
      tid,
      row.student_user_id,
      action === 'approve'
        ? 'Degree Application Verified'
        : 'Degree Application Rejected',
      action === 'approve'
        ? 'Your no-dues clearance is confirmed. Your degree certificate will be generated shortly.'
        : 'Your degree application was rejected during verification. Contact the Registrar office.',
    );

    await this.enterpriseAudit.log({
      tenantId: tid,
      userId: adminUserId,
      role: actorMeta?.role,
      module: 'cert_applications',
      action:
        action === 'approve' ? 'DEGREE_VERIFY_APPROVE' : 'DEGREE_VERIFY_REJECT',
      recordId: applicationId,
      oldValue: { verification_status: row.verification_status },
      newValue: { verification_status: newStatus },
      ip: actorMeta?.ip,
      sessionId: actorMeta?.sessionId,
    });

    return updated[0];
  }

  async enqueueCertificateGeneration(
    tenantId: string | undefined,
    eventId: string,
    requestedBy: string,
  ) {
    const tid = this.tenant(tenantId);
    const verified = await this.db.query(
      `SELECT application_id FROM cert_applications
       WHERE tenant_id = $1 AND event_id = $2
         AND verification_status = 'VERIFIED'
         AND president_ratification_status IN ('RATIFIED', 'NOT_REQUIRED')
         AND certificate_generated = false`,
      [tid, eventId],
    );
    if (!verified.length) {
      throw new BadRequestException(
        'No verified applications pending certificate generation',
      );
    }

    const jobId = randomUUID();
    await this.certQueue.add('generate-batch', {
      jobId,
      tenantId: tid,
      eventId,
      requestedBy,
    } satisfies CertificateGenerationJob);

    return {
      job_id: jobId,
      queued_count: verified.length,
      status: 'QUEUED',
    };
  }

  async runBatchGeneration(job: CertificateGenerationJob) {
    const apps = await this.db.query(
      `SELECT application_id, student_user_id
       FROM cert_applications
       WHERE tenant_id = $1 AND event_id = $2
         AND verification_status = 'VERIFIED'
         AND president_ratification_status IN ('RATIFIED', 'NOT_REQUIRED')
         AND certificate_generated = false`,
      [job.tenantId, job.eventId],
    );

    let generated = 0;
    for (const app of apps as {
      application_id: string;
      student_user_id: string;
    }[]) {
      const ok = await this.generateOneCertificate(
        job.tenantId,
        app.application_id,
        app.student_user_id,
        job.requestedBy,
        job.eventId,
      );
      if (ok) generated += 1;
    }

    this.notify.certificateStatusUpdated({
      tenantId: job.tenantId,
      userId: job.requestedBy,
      title: 'Certificate Batch Complete',
      message: `Generated ${generated} degree certificate(s) for the event.`,
      actionLink: '/admin-ops/convocation',
    });

    return { generated, total: apps.length };
  }

  async releaseCertificateAfterRatification(
    tenantId: string | undefined,
    applicationId: string,
    requestedBy: string,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT application_id, student_user_id, event_id, verification_status, president_ratification_status
       FROM cert_applications
       WHERE tenant_id = $1 AND application_id = $2`,
      [tid, applicationId],
    );
    if (!rows[0]) throw new NotFoundException('Application not found');
    const app = rows[0] as {
      student_user_id: string;
      event_id: string;
      verification_status: string;
      president_ratification_status: string;
    };
    if (app.verification_status !== 'VERIFIED') {
      throw new BadRequestException(
        'Application must be verified before certificate release',
      );
    }
    if (
      !['RATIFIED', 'NOT_REQUIRED'].includes(app.president_ratification_status)
    ) {
      throw new BadRequestException(
        'President ratification required before certificate release',
      );
    }

    const generated = await this.generateOneCertificate(
      tid,
      applicationId,
      app.student_user_id,
      requestedBy,
      app.event_id,
    );
    return { generated: generated ? 1 : 0, application_id: applicationId };
  }

  private async generateOneCertificate(
    tenantId: string,
    applicationId: string,
    studentUserId: string,
    requestedBy: string,
    eventId: string,
  ): Promise<boolean> {
    try {
      const { buffer, verificationCode } = await this.pdf.generate(
        tenantId,
        applicationId,
      );
      const key = this.storage.buildKey(
        tenantId,
        `certificates/${applicationId}.pdf`,
      );
      const stored = await this.storage.upload(
        tenantId,
        key,
        buffer,
        'application/pdf',
      );
      const url = stored.url;

      await this.db.query(
        `UPDATE cert_applications
         SET certificate_generated = true,
             certificate_url = $3,
             digilocker_pushed_at = NOW(),
             updated_at = NOW()
         WHERE application_id = $1 AND tenant_id = $2`,
        [applicationId, tenantId, url],
      );

      await this.pushToDigilockerNad(applicationId, verificationCode, url);

      await this.notifyStudent(
        tenantId,
        studentUserId,
        'Degree Certificate Ready',
        'Your official degree certificate has been generated and is available for download.',
      );

      await this.alumniConversion
        .enqueueConversion({
          tenantId,
          studentUserId,
          autoVerify: true,
        })
        .catch((err) =>
          this.logger.warn(
            `Alumni conversion queue failed for ${studentUserId}: ${err instanceof Error ? err.message : err}`,
          ),
        );

      await this.enterpriseAudit.log({
        tenantId,
        userId: requestedBy,
        module: 'cert_applications',
        action: 'CERTIFICATE_GENERATED',
        recordId: applicationId,
        newValue: {
          certificate_url: url,
          verification_code: verificationCode,
          event_id: eventId,
        },
      });

      return true;
    } catch (err) {
      this.logger.error(
        `Certificate generation failed for ${applicationId}: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }

  /** Stub for DigiLocker / NAD integration — records push timestamp. */
  private async pushToDigilockerNad(
    applicationId: string,
    verificationCode: string,
    certificateUrl: string,
  ) {
    this.logger.log(
      `DigiLocker/NAD push queued: application=${applicationId} code=${verificationCode} url=${certificateUrl}`,
    );
  }
}
