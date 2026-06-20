import { Injectable, Logger } from '@nestjs/common';

/**
 * Centralised notification fan-out for the whole ERP.
 * Modules MUST call this service instead of importing nodemailer / SMS SDKs
 * directly so that channels (email, SMS, push, in-app) can be swapped or
 * silenced from a single place.
 *
 * Wire concrete providers (SMTP, MSG91, Firebase, etc.) inside the private
 * dispatch methods – the public API stays stable for callers.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async sendEmail(
    to: string | string[],
    subject: string,
    body: string,
  ): Promise<void> {
    this.logger.log(
      `[email] to=${Array.isArray(to) ? to.join(',') : to} subject="${subject}"`,
    );
  }

  async sendSms(phone: string | string[], message: string): Promise<void> {
    this.logger.log(
      `[sms] to=${Array.isArray(phone) ? phone.join(',') : phone} body="${message}"`,
    );
  }

  async sendInApp(
    userId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    this.logger.log(
      `[in-app] user=${userId} payload=${JSON.stringify(payload)}`,
    );
  }
}
