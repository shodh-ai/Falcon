import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectDataSource } from '@nestjs/typeorm';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import {
  ALUMNI_CONVERSION_QUEUE,
  AlumniConversionJob,
} from '../../common/constants/alumni-queue.constants';

@Injectable()
export class AlumniConversionService {
  private readonly logger = new Logger(AlumniConversionService.name);

  constructor(
    @InjectQueue(ALUMNI_CONVERSION_QUEUE) private readonly queue: Queue<AlumniConversionJob>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async enqueueConversion(job: AlumniConversionJob) {
    if (!job.tenantId?.trim()) {
      throw new InternalServerErrorException(
        'Tenant context missing on your session. Sign out and sign in again, then retry.',
      );
    }

    try {
      await this.queue.add('convert', job, {
        jobId: `conv:${job.tenantId}:${job.studentUserId}:${Date.now()}`,
        removeOnComplete: true,
        attempts: 3,
      });
      this.logger.log(`Queued alumni conversion for student ${job.studentUserId}`);
      return { queued: true };
    } catch (err) {
      this.logger.warn(
        `Alumni queue unavailable for ${job.studentUserId}, running inline: ${err instanceof Error ? err.message : err}`,
      );
      const result = await this.runConversion(job);
      if (result.skipped) {
        throw new InternalServerErrorException(
          `Alumni registration could not complete (${result.reason ?? 'unknown'}).`,
        );
      }
      return { queued: false, ...result };
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async nightlyGraduateConversionScan() {
    const tenants = await this.dataSource.query(`SELECT tenant_id FROM tenants`);
    for (const t of tenants) {
      await this.scanGraduatesForConversion(t.tenant_id);
    }
  }

  async scanGraduatesForConversion(tenantId: string) {
    const rows = await this.dataSource.query(
      `SELECT c.student_user_id
       FROM student_exit_clearances c
       JOIN student_profiles sp ON sp.user_id = c.student_user_id
       WHERE c.tenant_id = $1
         AND c.library_cleared = true AND c.finance_cleared = true
         AND c.hostel_cleared = true AND c.dept_cleared = true
         AND COALESCE(sp.final_result, '') ILIKE '%pass%'
         AND COALESCE(c.alumni_converted, false) = false`,
      [tenantId],
    );
    for (const row of rows) {
      await this.enqueueConversion({
        tenantId,
        studentUserId: row.student_user_id,
        autoVerify: true,
      });
    }
    return { scanned: rows.length };
  }

  async runConversion(job: AlumniConversionJob) {
    const users = await this.dataSource.query(
      `SELECT u.user_id, u.name, u.official_email, u.tenant_id,
              sp.enrollment_no, sp.graduation_year, sp.program_name
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1 AND u.tenant_id = $2`,
      [job.studentUserId, job.tenantId],
    );
    const user = users[0];
    if (!user) return { skipped: true, reason: 'user_not_found' };

    const batchYear = user.graduation_year ?? new Date().getFullYear();
    const status = job.autoVerify ? 'VERIFIED' : 'PENDING';

    const existing = await this.dataSource.query(
      `SELECT alumni_id FROM alumni_profiles WHERE tenant_id = $1 AND student_user_id = $2`,
      [job.tenantId, job.studentUserId],
    );

    if (existing[0]) {
      await this.dataSource.query(
        `UPDATE alumni_profiles
         SET verification_status = $3,
             linkedin_url = COALESCE($4, linkedin_url),
             current_organization = COALESCE($5, current_organization),
             user_id = $2,
             profile_updated_at = NOW()
         WHERE alumni_id = $1`,
        [
          existing[0].alumni_id,
          job.studentUserId,
          status,
          job.linkedinUrl ?? null,
          job.placementOrganization ?? null,
        ],
      );
    } else {
      try {
        await this.dataSource.query(
          `INSERT INTO alumni_profiles (
             tenant_id, alumni_id, student_user_id, user_id, name, email,
             enrollment_number, batch_year, graduation_year, program_name,
             current_organization, linkedin_url, verification_status, profile_updated_at
           ) VALUES ($1, gen_random_uuid(), $2, $2, $3, $4, $5, $6, $6, $7, $8, $9, $10, NOW())`,
          [
            job.tenantId,
            job.studentUserId,
            user.name,
            user.official_email,
            user.enrollment_no,
            batchYear,
            user.program_name,
            job.placementOrganization ?? null,
            job.linkedinUrl ?? null,
            status,
          ],
        );
      } catch (insertErr) {
        this.logger.error(`alumni_profiles insert failed: ${insertErr}`);
        throw insertErr;
      }
    }

    await this.dataSource.query(
      `UPDATE student_exit_clearances SET alumni_converted = true, updated_at = NOW()
       WHERE tenant_id = $1 AND student_user_id = $2`,
      [job.tenantId, job.studentUserId],
    );
    try {
      await this.dataSource.query(
        `UPDATE student_profiles SET alumni_conversion_flag = true WHERE user_id = $1`,
        [job.studentUserId],
      );
    } catch (flagErr) {
      this.logger.warn(`alumni_conversion_flag update skipped: ${flagErr}`);
    }

    if (job.autoVerify) {
      const role = await this.dataSource.query(
        `SELECT role_id FROM roles WHERE role_name = 'Alumni' LIMIT 1`,
      );
      if (role[0]?.role_id) {
        await this.dataSource.query(
          `UPDATE users SET role_id = $1 WHERE user_id = $2`,
          [role[0].role_id, job.studentUserId],
        );
      }
    }

    return {
      success: true,
      student_user_id: job.studentUserId,
      verification_status: status,
      welcome_email: user.official_email,
    };
  }
}
