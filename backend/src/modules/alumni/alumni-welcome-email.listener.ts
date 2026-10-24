import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationEvents,
  type AlumniConversionApprovedPayload,
} from '../../core/notifications/notification.events';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';
import {
  FALCON_EMAIL_FROM,
  falconEmailTransportOptions,
} from '../../common/email/falcon-email-sender';

@Injectable()
export class AlumniWelcomeEmailListener {
  private readonly logger = new Logger(AlumniWelcomeEmailListener.name);

  constructor(private readonly config: ConfigService) {}

  @OnEvent(NotificationEvents.ALUMNI_CONVERSION_APPROVED)
  async onConversionApproved(payload: AlumniConversionApprovedPayload) {
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const firstName = payload.studentName.split(' ')[0] || payload.studentName;
    const html = wrapFalconEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#08234a;">Congratulations, ${firstName}!</h2>
        <p>Your student account has been successfully transitioned to the <strong>SGVU Falcon Alumni Network</strong>.</p>
        <p>Sign in with your same <strong>@mygyanvihar.com</strong> Google account — Falcon will route you to the exclusive Alumni portal automatically.</p>
        <p style="margin:24px 0;">
          <a href="${frontend}/login" style="display:inline-block;background:#08234a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Enter the Alumni Network
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;">Access transcripts, the donation gateway, mentorship, and the alumni directory from your new workspace.</p>
      `,
      frontend,
    );

    try {
      const transporter = nodemailer.createTransport(
        falconEmailTransportOptions((key) => this.config.get<unknown>(key)),
      );
      await transporter.sendMail({
        from: FALCON_EMAIL_FROM,
        to: payload.officialEmail,
        subject: `Congratulations ${firstName}! Welcome to the Falcon Alumni Network`,
        html,
      });
      this.logger.log('Alumni welcome email accepted by SMTP');
    } catch {
      this.logger.warn('Alumni welcome email failed (SMTP_FAILURE)');
    }
  }
}
