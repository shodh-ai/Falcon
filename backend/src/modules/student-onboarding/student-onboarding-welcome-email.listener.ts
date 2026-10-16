import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationEvents,
  type StudentOnboardingApprovedPayload,
} from '../../core/notifications/notification.events';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';
import {
  FALCON_EMAIL_FROM,
  falconEmailTransportOptions,
} from '../../common/email/falcon-email-sender';

@Injectable()
export class StudentOnboardingWelcomeEmailListener {
  private readonly logger = new Logger(
    StudentOnboardingWelcomeEmailListener.name,
  );

  constructor(private readonly config: ConfigService) {}

  @OnEvent(NotificationEvents.STUDENT_ONBOARDING_APPROVED)
  async onApproved(payload: StudentOnboardingApprovedPayload) {
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const firstName = payload.studentName.split(' ')[0] || payload.studentName;
    const dashboardPath = payload.dashboardPath ?? '/student/dashboard';
    const html = wrapFalconEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#08234a;">Welcome to Falcon, ${firstName}!</h2>
        <p>Your documents have been verified and your portal is now unlocked.</p>
        <p>Sign in with your official email to access your workspace.</p>
        <p style="margin:24px 0;">
          <a href="${frontend}${dashboardPath}" style="display:inline-block;background:#08234a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Open Portal
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;">Welcome to Falcom — we are glad to have you on campus.</p>
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
        subject: `Welcome to Falcon — Your portal is unlocked`,
        html,
      });
      this.logger.log('Student onboarding welcome email accepted by SMTP');
    } catch {
      this.logger.warn(
        'Student onboarding welcome email failed (SMTP_FAILURE)',
      );
    }
  }
}
