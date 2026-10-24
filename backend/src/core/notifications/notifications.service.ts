import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  FALCON_EMAIL_FROM,
  falconEmailTransportOptions,
  portalEmailDeliveryEnabled,
  safeEmailRecipient,
} from '../../common/email/falcon-email-sender';

/** Bound only by the explicit isolated staging module; env vars cannot select it. */
export const NOTIFICATION_CAPTURE_DELIVERY = Symbol(
  'NOTIFICATION_CAPTURE_DELIVERY',
);
export interface NotificationCaptureDelivery {
  validateConfiguration(): void;
  send(to: string[], subject: string, body: string): Promise<unknown>;
}

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

  constructor(
    private readonly config: ConfigService,
    @Optional()
    @Inject(NOTIFICATION_CAPTURE_DELIVERY)
    private readonly capture?: NotificationCaptureDelivery,
  ) {}

  validateEmailDeliveryConfiguration(): void {
    if (this.capture) this.capture.validateConfiguration();
    else falconEmailTransportOptions((key) => this.config.get<unknown>(key));
  }

  isEmailDeliveryEnabled(): boolean {
    return portalEmailDeliveryEnabled((key) => this.config.get<unknown>(key));
  }

  async sendEmail(
    to: string | string[],
    subject: string,
    body: string,
  ): Promise<boolean> {
    if (!this.isEmailDeliveryEnabled()) return false;
    const recipients = Array.isArray(to) ? to : [to];
    try {
      if (
        !recipients.length ||
        !recipients.every(safeEmailRecipient) ||
        /[\r\n]/.test(subject)
      ) {
        throw new Error('Invalid notification envelope');
      }
      this.validateEmailDeliveryConfiguration();
      const delivery: unknown = this.capture
        ? await this.capture.send(recipients, subject, body)
        : await nodemailer
            .createTransport(
              falconEmailTransportOptions((key) =>
                this.config.get<unknown>(key),
              ),
            )
            .sendMail({
              from: FALCON_EMAIL_FROM,
              to: recipients,
              subject,
              text: body,
            });
      // A resolved SMTP call can still reject some recipients. Report success
      // only when the provider explicitly accepted every intended recipient.
      const result = delivery as
        | { accepted?: unknown; rejected?: unknown; pending?: unknown }
        | null
        | undefined;
      const accepted = result?.accepted;
      if (
        !Array.isArray(accepted) ||
        !accepted.every((address) => typeof address === 'string') ||
        !recipients.every((recipient) =>
          accepted.some(
            (address: string) =>
              address.toLowerCase() === recipient.toLowerCase(),
          ),
        ) ||
        (result?.rejected !== undefined &&
          (!Array.isArray(result.rejected) || result.rejected.length > 0)) ||
        (result?.pending !== undefined &&
          (!Array.isArray(result.pending) || result.pending.length > 0))
      ) {
        throw new Error('SMTP recipient acceptance was not confirmed');
      }
      return true;
    } catch {
      this.logger.warn('Portal email delivery failed (SMTP_FAILURE)');
      throw new Error('Portal email delivery failed (SMTP_FAILURE)');
    }
  }

  sendSms(phone: string | string[], message: string): Promise<void> {
    void phone;
    void message;
    this.logger.debug('SMS provider is not configured; delivery skipped');
    return Promise.resolve();
  }

  sendInApp(userId: string, payload: Record<string, unknown>): Promise<void> {
    void userId;
    void payload;
    this.logger.debug(
      'In-app notifications use the persisted notification inbox',
    );
    return Promise.resolve();
  }
}
