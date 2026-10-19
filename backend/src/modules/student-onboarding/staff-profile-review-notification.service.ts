import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource, QueryRunner } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';
import { getDashboardPathForRoleName } from './onboarding-portal.util';

type Correction = { reason: string; fields: string[]; documents: string[] };
type PendingEmail = {
  notification_id: string;
  recipient_email: string;
  action_path: string;
  payload: Correction;
  attempts: number;
};

function label(value: string) {
  return value.replaceAll('_', ' ').toLowerCase();
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[character]!,
  );
}

@Injectable()
export class StaffProfileReviewNotificationService {
  private readonly logger = new Logger(
    StaffProfileReviewNotificationService.name,
  );
  private running = false;

  constructor(
    private readonly db: DataSource,
    private readonly config: ConfigService,
  ) {}

  async enqueueCorrection(
    qr: QueryRunner,
    review: {
      tenant_id: string;
      user_id: string;
      review_id: string;
      revision: number;
    },
    correction: Correction,
  ) {
    const [person] = await qr.query(
      `SELECT u.official_email, r.role_name FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.tenant_id = $1 AND u.user_id = $2 AND u.deleted_at IS NULL`,
      [review.tenant_id, review.user_id],
    );
    if (!person?.official_email)
      throw new Error('Staff email is required for correction notification');
    const actionPath = getDashboardPathForRoleName(person.role_name);
    const message = `HR has requested corrections to your staff profile. ${correction.reason}`;
    const [email] = await qr.query(
      `INSERT INTO staff_profile_review_email_outbox
       (tenant_id, review_id, user_id, revision, recipient_email, action_path, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
       RETURNING notification_id`,
      [
        review.tenant_id,
        review.review_id,
        review.user_id,
        review.revision,
        person.official_email,
        actionPath,
        JSON.stringify(correction),
      ],
    );
    await qr.query(
      `INSERT INTO falcon_notifications
       (tenant_id, user_id, category, title, message, action_link, severity,
        intent, action_label, metadata, is_read)
       VALUES ($1, $2, 'HR', 'Staff profile corrections requested', $3, $4,
        'warning', 'action_required', 'Review corrections', $5::jsonb, false)`,
      [
        review.tenant_id,
        review.user_id,
        message,
        actionPath,
        JSON.stringify({
          type: 'STAFF_PROFILE_CORRECTION',
          review_id: review.review_id,
          revision: review.revision,
          email_notification_id: email.notification_id,
        }),
      ],
    );
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async deliverPending() {
    if (this.running) return;
    this.running = true;
    try {
      for (let count = 0; count < 10; count++) {
        // End with SELECT: TypeORM's PostgreSQL driver returns [rows, count]
        // for UPDATE, even with RETURNING. Delivery requires the actual row.
        const [email] = (await this.db.query(
          `WITH next_email AS (
             SELECT notification_id FROM staff_profile_review_email_outbox
             WHERE status <> 'SENT' AND next_attempt_at <= NOW()
             ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
           ), claimed AS (
             UPDATE staff_profile_review_email_outbox e
             SET status = 'SENDING', attempts = attempts + 1,
                 next_attempt_at = NOW() + INTERVAL '5 minutes'
             FROM next_email n WHERE e.notification_id = n.notification_id
             RETURNING e.*
           )
           SELECT * FROM claimed`,
        )) as PendingEmail[];
        if (!email) break;
        await this.deliver(email);
      }
    } catch {
      this.logger.error(
        'Staff correction email worker could not complete its batch',
      );
    } finally {
      this.running = false;
    }
  }

  private async deliver(email: PendingEmail) {
    try {
      const host = this.config.get<string>('EMAIL_HOST');
      if (!host) throw new Error('EMAIL_NOT_CONFIGURED');
      const port = Number(this.config.get('EMAIL_PORT') || 587);
      const user = this.config.get<string>('EMAIL_USER');
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: user
          ? { user, pass: this.config.get('EMAIL_PASSWORD') }
          : undefined,
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
      });
      const frontend =
        this.config.get<string>('FRONTEND_URL') || 'https://falcon.jataka.io';
      const url = new URL(email.action_path, frontend).toString();
      const targets = [
        ...email.payload.fields.map(label),
        ...email.payload.documents.map(
          (document) => `${label(document)} document`,
        ),
      ];
      const text = `HR has reviewed your staff profile and requested the following corrections.\n\n${email.payload.reason}\n\nPlease correct: ${targets.join(', ')}.\n\nSign in to Falcon, update the requested information and resubmit it to HR: ${url}`;
      const info = await transporter.sendMail({
        from: this.config.get('EMAIL_FROM') || user,
        to: email.recipient_email,
        subject: 'Falcon — HR requested corrections to your staff profile',
        messageId: `<staff-review-${email.notification_id}@falcon.jataka.io>`,
        text,
        html: wrapFalconEmailHtml(
          `<h2>HR requested profile corrections</h2>
          <p>Please review the following feedback from HR:</p>
          <p style="white-space:pre-wrap">${escapeHtml(email.payload.reason)}</p>
          <p><strong>Please correct:</strong> ${escapeHtml(targets.join(', '))}.</p>
          <p><a href="${escapeHtml(url)}">Open Falcon to correct and resubmit your profile</a></p>`,
          frontend,
        ),
      });
      if (!info.accepted?.length || info.rejected?.length)
        throw new Error('SMTP_REJECTED');
      await this.db.query(
        `UPDATE staff_profile_review_email_outbox SET status = 'SENT', sent_at = NOW(),
         last_error = NULL WHERE notification_id = $1`,
        [email.notification_id],
      );
    } catch (error) {
      const code =
        error instanceof Error && error.message === 'EMAIL_NOT_CONFIGURED'
          ? 'EMAIL_NOT_CONFIGURED'
          : 'EMAIL_DELIVERY_FAILED';
      await this.db.query(
        `UPDATE staff_profile_review_email_outbox SET status = 'RETRY', last_error = $2,
         next_attempt_at = NOW() + ($3 * INTERVAL '1 minute') WHERE notification_id = $1`,
        [
          email.notification_id,
          code,
          Math.min(60, 2 ** Math.min(email.attempts, 6)),
        ],
      );
      this.logger.warn(
        `Staff correction email ${email.notification_id} will retry (${code})`,
      );
    }
  }
}
