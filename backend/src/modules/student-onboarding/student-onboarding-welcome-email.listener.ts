import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  NotificationEvents,
  type StudentOnboardingApprovedPayload,
} from '../../core/notifications/notification.events';
import { wrapFalconEmailHtml } from '../../common/email/falcon-email.template';

@Injectable()
export class StudentOnboardingWelcomeEmailListener {
  private readonly logger = new Logger(StudentOnboardingWelcomeEmailListener.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get('EMAIL_HOST'),
      port: parseInt(this.config.get('EMAIL_PORT') || '587', 10),
      secure: false,
      auth: {
        user: this.config.get('EMAIL_USER'),
        pass: this.config.get('EMAIL_PASSWORD'),
      },
    });
  }

  @OnEvent(NotificationEvents.STUDENT_ONBOARDING_APPROVED)
  async onApproved(payload: StudentOnboardingApprovedPayload) {
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:3000');
    const firstName = payload.studentName.split(' ')[0] || payload.studentName;
    const html = wrapFalconEmailHtml(
      `
        <h2 style="margin:0 0 12px;color:#08234a;">Welcome to Falcon, ${firstName}!</h2>
        <p>Your documents have been verified and your student portal is now unlocked.</p>
        <p>Sign in with your official email to access attendance, marks, fees, helpdesk, and the full campus experience.</p>
        <p style="margin:24px 0;">
          <a href="${frontend}/student/dashboard" style="display:inline-block;background:#08234a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Open Student Portal
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;">Welcome to Falcom — we are glad to have you on campus.</p>
      `,
      frontend,
    );

    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM', 'Falcon Campus OS <noreply@falcon.local>'),
        to: payload.officialEmail,
        subject: `Welcome to Falcon — Your portal is unlocked`,
        html,
      });
      this.logger.log(`Student onboarding welcome email sent to ${payload.officialEmail}`);
    } catch (err) {
      this.logger.warn(`Student onboarding welcome email failed for ${payload.officialEmail}: ${err}`);
    }
  }
}
